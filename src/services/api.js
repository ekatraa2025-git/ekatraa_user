/**
 * Backend API client for Ekatraa app.
 * When EXPO_PUBLIC_API_URL is set, uses new flow: occasions → categories → services → cart → checkout → orders.
 */
const API_BASE = process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
const REQUEST_TIMEOUT_MS = 15000;

/** Ensures error messages are strings (APIs sometimes return nested objects). */
function stringifyApiError(raw) {
    let msg = '';
    if (raw == null) msg = '';
    else if (typeof raw === 'string') msg = raw;
    else if (typeof raw === 'object') {
        if (typeof raw.message === 'string') msg = raw.message;
        else if (typeof raw.error === 'string') msg = raw.error;
        else if (raw.error && typeof raw.error === 'object' && typeof raw.error.message === 'string') {
            msg = raw.error.message;
        } else {
            const keys = Object.keys(raw);
            if (keys.length === 1 && typeof raw.model === 'string') {
                msg = 'Could not complete this request. Check the app backend and AI settings.';
            } else {
                try {
                    msg = JSON.stringify(raw);
                } catch {
                    msg = 'Request failed';
                }
            }
        }
    } else msg = String(raw);
    return msg || 'Request failed';
}

function buildError(e) {
    const msg = (e && e.message) || 'Network error';
    if (e && (e.name === 'AbortError' || /aborted/i.test(msg))) {
        // Friendly explanation for AbortController timeouts (the dreaded
        // "AI take aborted failed" UX). Callers that need raw cause should
        // inspect e.name, not the user-facing string.
        return 'The AI is taking longer than expected. Please try again — if it keeps happening, switch to a faster network.';
    }
    if (msg === 'Network request failed' || msg === 'Failed to fetch') {
        return 'Cannot reach server. Ensure the backend is running and .env EXPO_PUBLIC_API_URL is correct (use 10.0.2.2:3000 for Android emulator).';
    }
    return msg;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

/** Coalesce identical in-flight GETs so parallel mounts do not duplicate network work. */
const inflightGet = new Map();

/** Short-lived GET response cache (TTL per path). Invalidated on successful mutations. */
const getResponseCache = new Map();

function pathOnlyFromUrl(url) {
    try {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            return new URL(url).pathname;
        }
    } catch {
        /* fall through */
    }
    const q = url.indexOf('?');
    const noQuery = q >= 0 ? url.slice(0, q) : url;
    const api = noQuery.indexOf('/api/');
    return api >= 0 ? noQuery.slice(api) : noQuery;
}

function getCacheTtlMsForPath(pathname) {
    if (pathname.includes('/api/public/cart')) return 0;
    if (pathname.includes('/api/public/orders')) return 0;
    if (pathname.includes('/api/public/guests')) return 0;
    if (pathname.includes('/api/public/gifts')) return 0;
    if (pathname.includes('/api/public/recommendations')) return 0;
    if (pathname.includes('/api/public/budget-recommendation-snapshots')) return 0;
    if (pathname.includes('/api/translations')) return 30 * 60 * 1000;
    if (pathname.includes('/api/public/config/maps')) return 30 * 60 * 1000;
    if (pathname.includes('/api/public/banners')) return 15 * 60 * 1000;
    if (pathname.includes('/api/public/testimonials')) return 15 * 60 * 1000;
    if (pathname.includes('/api/public/e-invites/')) return 15 * 60 * 1000;
    if (pathname.includes('/api/public/occasions') || pathname.includes('/api/public/event-types')) return 10 * 60 * 1000;
    if (pathname.includes('/api/public/categories')) return 10 * 60 * 1000;
    if (pathname.includes('/api/public/special-services')) return 10 * 60 * 1000;
    if (pathname.includes('/api/public/venues/featured')) return 5 * 60 * 1000;
    if (pathname.includes('/api/public/booking-protection')) return 5 * 60 * 1000;
    if (pathname.includes('/api/public/services')) return 5 * 60 * 1000;
    return 60 * 1000;
}

function cloneApiResult(result) {
    try {
        return JSON.parse(JSON.stringify(result));
    } catch {
        return result;
    }
}

export function invalidateAllGetCache() {
    getResponseCache.clear();
}

/** Only clear caches after mutations that affect user/cart/order data — not AI/chat reads. */
function shouldInvalidateCacheForMutation(path) {
    const p = String(path || '').toLowerCase();
    if (p.includes('/api/public/ai/')) return false;
    if (p.includes('/api/public/recommendations/narrative')) return false;
    if (p.includes('/api/public/invitations/generate')) return false;
    return (
        p.includes('/cart') ||
        p.includes('/guests') ||
        p.includes('/gifts') ||
        p.includes('/orders') ||
        p.includes('/checkout') ||
        p.includes('/payment/') ||
        p.includes('/quotation')
    );
}

async function get(path, params = {}) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`;
    const pathname = pathOnlyFromUrl(url);
    const ttl = getCacheTtlMsForPath(pathname);
    if (ttl > 0) {
        const hit = getResponseCache.get(url);
        if (hit && hit.expires > Date.now() && hit.result && !hit.result.error) {
            return Promise.resolve(cloneApiResult(hit.result));
        }
    }
    if (inflightGet.has(url)) return inflightGet.get(url);

    const promise = (async () => {
        try {
            const res = await fetchWithTimeout(url);
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const msg = stringifyApiError(data?.error) || res.statusText;
                return { data: null, error: { message: msg } };
            }
            const result = { data, error: null };
            if (ttl > 0) {
                getResponseCache.set(url, { result, expires: Date.now() + ttl });
            }
            return result;
        } catch (e) {
            return { data: null, error: { message: buildError(e) } };
        } finally {
            inflightGet.delete(url);
        }
    })();

    inflightGet.set(url, promise);
    return promise;
}

const inflightGetAuth = new Map();

/** GET with Supabase session access token (saved recommendations, etc.). */
async function getWithAuth(path, params = {}, accessToken, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`;
    const cacheKey = `${url}\0${accessToken || ''}`;
    if (inflightGetAuth.has(cacheKey)) return inflightGetAuth.get(cacheKey);

    const promise = (async () => {
        const headers = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        try {
            const res = await fetchWithTimeout(url, { headers }, timeoutMs);
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const msg = stringifyApiError(data?.error) || res.statusText;
                return { data: null, error: { message: msg } };
            }
            return { data, error: null };
        } catch (e) {
            return { data: null, error: { message: buildError(e) } };
        } finally {
            inflightGetAuth.delete(cacheKey);
        }
    })();

    inflightGetAuth.set(cacheKey, promise);
    return promise;
}

async function post(path, body = {}, timeoutMs = REQUEST_TIMEOUT_MS, extraHeaders = {}) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const res = await fetchWithTimeout(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...extraHeaders },
            body: JSON.stringify(body),
        }, timeoutMs);
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => null)
            : null;
        if (!res.ok) {
            const fromErr =
                data?.error != null
                    ? stringifyApiError(data.error)
                    : data?.message != null
                      ? stringifyApiError(data.message)
                      : '';
            const details =
                data?.details && typeof data.details === 'object'
                    ? (() => {
                          try {
                              return ' ' + JSON.stringify(data.details);
                          } catch {
                              return '';
                          }
                      })()
                    : '';
            const fallback =
                res.status === 404
                    ? 'Endpoint not found. Ensure the backend is deployed and EXPO_PUBLIC_API_URL points to it.'
                    : [res.status, res.statusText || 'Error'].filter(Boolean).join(' ').trim();
            let msg = (fromErr && fromErr !== 'Request failed' ? fromErr : '') || fallback;
            if (fromErr === 'Request failed' && data?.error == null) {
                msg = fallback || 'Request failed';
            }
            if (!msg || msg === 'null' || msg === 'undefined') {
                msg = fallback || 'Request failed';
            }
            if (details && fromErr && fromErr === 'Invalid body') {
                msg = `${fromErr}${details}`;
            }
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

/** @param {Record<string,string>} extraHeaders merged into JSON PATCH headers */
async function patch(path, body = {}, extraHeaders = {}) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const res = await fetchWithTimeout(`${API_BASE}${path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...extraHeaders },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = stringifyApiError(data?.error) || res.statusText;
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

/** POST with Supabase access token (payments, guests, etc.). */
async function postWithAuth(path, body = {}, accessToken, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        const res = await fetchWithTimeout(
            `${API_BASE}${path}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            },
            timeoutMs
        );
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
        if (!res.ok) {
            const msg = stringifyApiError(data?.error) || res.statusText;
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

/** DELETE with Supabase access token. */
async function delWithAuth(path, accessToken) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const headers = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        const res = await fetchWithTimeout(`${API_BASE}${path}`, { method: 'DELETE', headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = stringifyApiError(data?.error) || res.statusText;
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data: data || {}, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

/** @param {Record<string,string>} extraHeaders merged before Authorization */
async function patchWithAuth(path, body = {}, accessToken, extraHeaders = {}) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const headers = { 'Content-Type': 'application/json', ...extraHeaders };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        const res = await fetchWithTimeout(`${API_BASE}${path}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = stringifyApiError(data?.error) || res.statusText;
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

async function del(path) {
    if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
    try {
        const res = await fetchWithTimeout(`${API_BASE}${path}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = stringifyApiError(data?.error) || res.statusText;
            return { data: null, error: { message: msg } };
        }
        if (shouldInvalidateCacheForMutation(path)) invalidateAllGetCache();
        return { data: data || {}, error: null };
    } catch (e) {
        return { data: null, error: { message: buildError(e) } };
    }
}

export const api = {
    // Legacy (still used when backend is on)
    async getBanners() {
        return get('/api/public/banners');
    },
    async getFeaturedVenues(city, limit = 10) {
        return get('/api/public/venues/featured', city ? { city, limit: String(limit) } : { limit: String(limit) });
    },
    async getEventTypes() {
        return get('/api/public/event-types');
    },
    async getServicesByEventType(eventType) {
        return get('/api/public/services', eventType ? { eventType } : {});
    },

    // New flow: occasions → categories → services
    async getOccasions() {
        return get('/api/public/occasions');
    },
    async getCategories(occasionId) {
        return get('/api/public/categories', occasionId ? { occasion_id: occasionId } : {});
    },
    async getMapsConfig() {
        return get('/api/public/config/maps');
    },
    async getSpecialServices() {
        return get('/api/public/special-services');
    },
    async getVendorsPreview(params = {}) {
        const q = {};
        if (params.occasion_id) q.occasion_id = params.occasion_id;
        if (params.city) q.city = params.city;
        if (params.state) q.state = params.state;
        if (params.limit) q.limit = params.limit;
        return get('/api/public/vendors/preview', q);
    },
    async getTestimonials() {
        return get('/api/public/testimonials');
    },
    async getEInviteTemplates(params = {}) {
        const q = {};
        if (params.section_key) q.section_key = params.section_key;
        if (params.limit) q.limit = params.limit;
        return get('/api/public/e-invites/templates', q);
    },
    async getEInviteFaqs(params = {}) {
        const q = {};
        if (params.limit) q.limit = params.limit;
        return get('/api/public/e-invites/faqs', q);
    },
    async getEInvitePricing() {
        return get('/api/public/e-invites/pricing');
    },
    /** Requires Supabase access_token (logged-in end user). */
    async generateEInviteMedia(body, accessToken) {
        if (!accessToken) return { data: null, error: { message: 'Sign in to generate e-invites.' } };
        return postWithAuth('/api/public/e-invites/generate-media', body, accessToken, 240000);
    },
    async createEInvitePaymentOrder(body, accessToken) {
        return postWithAuth('/api/public/e-invites/payment/create-order', body, accessToken);
    },
    async verifyEInvitePayment(body, accessToken) {
        return postWithAuth('/api/public/e-invites/payment/verify', body, accessToken);
    },
    async getMyEInvites(accessToken, params = {}) {
        return getWithAuth('/api/public/e-invites/mine', params, accessToken);
    },
    async getEInviteDownloadUrl(inviteId, accessToken) {
        return getWithAuth(`/api/public/e-invites/mine/${inviteId}/download`, {}, accessToken);
    },
    /** Remove a server-stored e-invite (does not change generation quota). */
    async deleteMyEInvite(inviteId, accessToken) {
        if (!accessToken) return { data: null, error: { message: 'Sign in to manage e-invites.' } };
        return delWithAuth(`/api/public/e-invites/mine/${inviteId}`, accessToken);
    },
    async getServices(params = {}) {
        const q = {};
        if (params.occasion_id) q.occasion_id = params.occasion_id;
        if (params.category_id) q.category_id = params.category_id;
        if (params.city) q.city = params.city;
        if (params.search) q.search = params.search;
        return get('/api/public/services', q);
    },
    /**
     * @param {string} occasionId
     * @param {string | number | { budget?: string, budget_inr?: number, category_weights?: Record<string, number> }} budgetOrOpts
     */
    async getRecommendations(occasionId, budgetOrOpts) {
        const q = { occasion_id: occasionId };
        if (budgetOrOpts != null && typeof budgetOrOpts === 'object' && !Array.isArray(budgetOrOpts)) {
            if (budgetOrOpts.budget_inr != null) q.budget_inr = String(budgetOrOpts.budget_inr);
            if (budgetOrOpts.budget) q.budget = budgetOrOpts.budget;
            if (budgetOrOpts.category_weights && Object.keys(budgetOrOpts.category_weights).length > 0) {
                q.category_weights = JSON.stringify(budgetOrOpts.category_weights);
            }
        } else {
            q.budget = String(budgetOrOpts);
        }
        return get('/api/public/recommendations', q);
    },
    async postRecommendationNarrative(body) {
        return post('/api/public/recommendations/narrative', body, 45000);
    },
    async postAiChat(body) {
        return post('/api/public/ai/chat', body, 45000);
    },
    /** Mastra planning agent (JSON). Pass threadId for memory continuity. Optional Bearer for cart-owner tools. */
    async postAiPlanningMessage(body, threadId, accessToken) {
        const extraHeaders = {};
        if (threadId) extraHeaders['X-Thread-Id'] = String(threadId);
        if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;
        return post('/api/public/ai/planning/message', body, 120000, extraHeaders);
    },
    /**
     * Sarvam STT proxy.
     * @param {{ uri: string, mimeType?: string, fileName?: string, languageCode?: string, model?: string }} audio
     */
    async postAiPlanningStt(audio, accessToken) {
        if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
        if (!audio?.uri) return { data: null, error: { message: 'Audio URI is required.' } };
        try {
            const form = new FormData();
            form.append('audio', {
                uri: audio.uri,
                name: audio.fileName || 'recording.m4a',
                type: audio.mimeType || 'audio/m4a',
            });
            if (audio.languageCode) form.append('language_code', String(audio.languageCode));
            if (audio.model) form.append('model', String(audio.model));
            const headers = {};
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
            const res = await fetchWithTimeout(`${API_BASE}/api/public/ai/planning/stt`, {
                method: 'POST',
                headers,
                body: form,
            }, 90000);
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const msg =
                    (typeof data?.message === 'string' && data.message.trim()) ||
                    stringifyApiError(data?.error || data?.detail) ||
                    res.statusText ||
                    'Speech recognition failed.';
                return { data: null, error: { message: msg } };
            }
            return { data, error: null };
        } catch (e) {
            return { data: null, error: { message: buildError(e) } };
        }
    },
    /**
     * Sarvam TTS proxy returning base64 JSON for app playback.
     * @param {{ text: string, target_language_code?: string, speaker?: string, model?: string }} body
     */
    async postAiPlanningTts(body) {
        return post(
            '/api/public/ai/planning/tts',
            { ...body, response_format: 'base64' },
            90000
        );
    },
    async postBudgetRecommendationSnapshot(body, accessToken) {
        if (accessToken) {
            return postWithAuth('/api/public/budget-recommendation-snapshots', body, accessToken);
        }
        return post('/api/public/budget-recommendation-snapshots', body);
    },
    /** @param {string} accessToken - Supabase session access_token */
    async getBudgetRecommendationSnapshots(accessToken, params = {}) {
        return getWithAuth('/api/public/budget-recommendation-snapshots', params, accessToken);
    },
    /** @param {string} accessToken */
    async getBudgetRecommendationSnapshot(id, accessToken) {
        return getWithAuth(`/api/public/budget-recommendation-snapshots/${id}`, {}, accessToken);
    },

    // Cart
    async createCart(body) {
        return post('/api/public/cart', body);
    },
    async createCartWithAuth(body, accessToken) {
        if (!accessToken) return post('/api/public/cart', body);
        return postWithAuth('/api/public/cart', body, accessToken);
    },
    /**
     * GET cart with ownership proofs (parity with Mastra `get_cart_summary`).
     * @param {string} cartId
     * @param {{ cartOwnerSession?: string|null, accessToken?: string|null }} [opts]
     */
    async getCart(cartId, opts = {}) {
        if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
        const id = String(cartId || '').trim();
        if (!id) return { data: null, error: { message: 'Cart id required' } };
        const url = `${API_BASE}/api/public/cart/${id}`;
        const token = opts.accessToken != null && String(opts.accessToken).trim() ? String(opts.accessToken).trim() : '';
        const ownerSess =
            opts.cartOwnerSession != null && String(opts.cartOwnerSession).trim()
                ? String(opts.cartOwnerSession).trim().slice(0, 512)
                : '';
        /** @type {Record<string,string>} */
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (ownerSess) headers['x-cart-owner-session'] = ownerSess;
        try {
            const res = await fetchWithTimeout(url, { headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const msg = stringifyApiError(data?.error) || res.statusText;
                return { data: null, error: { message: msg } };
            }
            return { data, error: null };
        } catch (e) {
            return { data: null, error: { message: buildError(e) } };
        }
    },
    /**
     * @param {{ cartOwnerSession?: string|null, accessToken?: string|null }} [opts]
     * — `cartOwnerSession` sets `x-cart-owner-session` (anonymous carts); optional `accessToken` adds Bearer.
     */
    async updateCart(cartId, body, opts = {}) {
        const headers = {};
        const s = opts.cartOwnerSession;
        if (s != null && String(s).trim()) headers['x-cart-owner-session'] = String(s).trim().slice(0, 512);
        const token = opts.accessToken != null && String(opts.accessToken).trim() ? String(opts.accessToken).trim() : '';
        if (token) return patchWithAuth(`/api/public/cart/${cartId}`, body, token, headers);
        return patch(`/api/public/cart/${cartId}`, body, headers);
    },
    /** @param {{ cartOwnerSession?: string|null }} [opts] */
    async updateCartWithAuth(cartId, body, accessToken, opts = {}) {
        const headers = {};
        const s = opts.cartOwnerSession;
        if (s != null && String(s).trim()) headers['x-cart-owner-session'] = String(s).trim().slice(0, 512);
        if (!accessToken) return patch(`/api/public/cart/${cartId}`, body, headers);
        return patchWithAuth(`/api/public/cart/${cartId}`, body, accessToken, headers);
    },
    async addCartItem(body) {
        return post('/api/public/cart/items', body);
    },
    async addCartItemWithAuth(body, accessToken) {
        if (!accessToken) return post('/api/public/cart/items', body);
        return postWithAuth('/api/public/cart/items', body, accessToken);
    },
    async updateCartItem(itemId, body) {
        return patch(`/api/public/cart/items/${itemId}`, body);
    },
    async removeCartItem(itemId) {
        return del(`/api/public/cart/items/${itemId}`);
    },

    /** Public booking protection pricing config (admin-managed). */
    async getBookingProtection() {
        return get('/api/public/booking-protection');
    },

    // Checkout & orders
    async checkout(body) {
        return post('/api/public/checkout', body);
    },
    /**
     * Razorpay advance order — backend requires Authorization: Bearer (Supabase access_token).
     * @param {object} body - { cart_id, booking_protection? }
     * @param {string} accessToken
     */
    async createPaymentOrder(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to pay.' } };
        }
        return postWithAuth('/api/public/payment/create-order', body, accessToken);
    },
    async verifyPayment(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to complete payment.' } };
        }
        return postWithAuth('/api/public/payment/verify', body, accessToken);
    },
    async getOrders(userId) {
        return get('/api/public/orders', { user_id: userId });
    },
    /**
     * Order detail (items, quotes, history, OTPs). Backend requires Authorization: Bearer access_token.
     * @param {string} orderId
     * @param {string} [accessToken] - Supabase session access_token
     */
    async getOrder(orderId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to view order details.' } };
        }
        return getWithAuth(`/api/public/orders/${orderId}`, {}, accessToken);
    },
    async cancelOrder(orderId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to cancel this order.' } };
        }
        return postWithAuth(`/api/public/orders/${orderId}/cancel`, {}, accessToken);
    },
    /**
     * Match active vendors to the selected services for a given order.
     * The API auto-derives services, location, and payment tier from order_id.
     * Contact details are unlocked only on full-payment orders.
     */
    async getOrderVendorMatches(orderId, accessToken, params = {}) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to view vendor options.' } };
        }
        const q = { order_id: orderId };
        if (params.limit_per_service) q.limit_per_service = String(params.limit_per_service);
        if (params.radius_km) q.radius_km = String(params.radius_km);
        // Vendor match signs gallery URLs server-side, so the response can be
        // noticeably slower than a plain DB read on cold caches. Give it 45s.
        return getWithAuth('/api/public/vendors/match', q, accessToken, 45000);
    },
    /**
     * Read existing customer-driven vendor allocations for an order.
     * Returns the most recent allocation per order item.
     */
    async getOrderAllocations(orderId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to view allocations.' } };
        }
        return getWithAuth(`/api/public/orders/${orderId}/allocate`, {}, accessToken);
    },
    /**
     * Persist customer-driven vendor allocations and notify the chosen vendors.
     * @param {string} orderId
     * @param {{ order_item_id: string, vendor_id: string }[]} allocations
     * @param {string} accessToken
     */
    async allocateOrderVendors(orderId, allocations, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to confirm vendors.' } };
        }
        // Allocation writes can fan out notifications + DB updates per item, so
        // allow up to 60s. Without an explicit timeout we'd inherit the 15s
        // default and the user would see a misleading "AI take aborted" toast.
        return postWithAuth(
            `/api/public/orders/${orderId}/allocate`,
            { allocations },
            accessToken,
            60000
        );
    },
    /**
     * Ask Ekatraa AI for a short grounded recommendation per service for the order.
     * Returns { summary, recommendations: [{ service_id, ai_note, ... }] } — lazy/opt-in
     * because every call triggers an LLM round-trip.
     * Backend allows up to 25s for the OpenRouter round-trip; client gives a
     * margin (60s) so slow networks + cold model starts don't AbortError
     * before the server can respond.
     * @param {string} orderId
     * @param {string} accessToken
     */
    async getOrderVendorRecommendation(orderId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to view Ekatraa AI suggestions.' } };
        }
        return postWithAuth(
            `/api/public/orders/${orderId}/recommend`,
            {},
            accessToken,
            60000
        );
    },
    /**
     * @param {string} accessToken - Supabase session access_token
     */
    async acceptQuotation(orderId, quotationId, action, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to continue.' } };
        }
        return patchWithAuth(`/api/public/orders/${orderId}/quotation/${quotationId}`, { action }, accessToken);
    },
    /** Accept vendor final invoice (updates order total for balance payment). */
    async acceptVendorInvoice(orderId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to continue.' } };
        }
        return postWithAuth(`/api/public/orders/${orderId}/invoice/accept`, {}, accessToken);
    },
    async createBalancePaymentOrder(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to pay.' } };
        }
        return postWithAuth('/api/public/payment/create-balance-order', body, accessToken);
    },
    /**
     * Balance payment verification — backend requires Authorization: Bearer (same as create-balance-order).
     * @param {string} accessToken - Supabase session access_token
     */
    async verifyBalancePayment(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to complete payment.' } };
        }
        return postWithAuth('/api/public/payment/verify-balance', body, accessToken);
    },
    async registerPushToken(expoPushToken, accessToken, platform) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in required.' } };
        }
        return postWithAuth(
            '/api/public/notifications/push-token',
            {
                expo_push_token: expoPushToken,
                platform: platform || null,
                app_id: 'ekatraa-user-app',
            },
            accessToken
        );
    },
    async unregisterPushToken(expoPushToken, accessToken) {
        if (!API_BASE) return { data: null, error: { message: 'API URL not configured. Set EXPO_PUBLIC_API_URL in .env' } };
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in required.' } };
        }
        try {
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
            const res = await fetchWithTimeout(`${API_BASE}/api/public/notifications/push-token`, {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ expo_push_token: expoPushToken }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const msg = stringifyApiError(data?.error) || res.statusText;
                return { data: null, error: { message: msg } };
            }
            return { data, error: null };
        } catch (e) {
            return { data: null, error: { message: buildError(e) } };
        }
    },

    // Guests (backend uses Bearer token; user_id from JWT)
    async getGuests(accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to manage guests.' } };
        }
        return getWithAuth('/api/public/guests', {}, accessToken);
    },
    async addGuest(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to add guests.' } };
        }
        return postWithAuth('/api/public/guests', body, accessToken);
    },
    async updateGuest(guestId, body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to update guests.' } };
        }
        return patchWithAuth(`/api/public/guests/${guestId}`, body, accessToken);
    },
    async deleteGuest(guestId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to delete guests.' } };
        }
        return delWithAuth(`/api/public/guests/${guestId}`, accessToken);
    },
    async bulkImportGuests(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to import guests.' } };
        }
        return postWithAuth('/api/public/guests/bulk', body, accessToken);
    },

    /** Public app copy (en / hi / or) from admin translations. */
    async getTranslations() {
        return get('/api/translations');
    },

    /** Claude-powered invitation samples or final text. */
    async generateInvitation(body) {
        return post('/api/public/invitations/generate', body, 90000);
    },

    // Gifts
    async getGifts(accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to view gifts.' } };
        }
        return getWithAuth('/api/public/gifts', {}, accessToken);
    },
    async addGift(body, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to add gifts.' } };
        }
        return postWithAuth('/api/public/gifts', body, accessToken);
    },
    async deleteGift(giftId, accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in to delete gifts.' } };
        }
        return delWithAuth(`/api/public/gifts/${giftId}`, accessToken);
    },

    /**
     * Permanently erase the signed-in user's account. Orders are preserved
     * for vendor records but detached + anonymized; everything else keyed to
     * the user is removed. Requires a current Supabase access token.
     */
    async deleteOwnAccount(accessToken) {
        if (!accessToken) {
            return { data: null, error: { message: 'Sign in required to delete this account.' } };
        }
        return post(
            '/api/public/account/delete',
            { confirmation: 'DELETE MY ACCOUNT' },
            REQUEST_TIMEOUT_MS,
            { Authorization: `Bearer ${accessToken}` }
        );
    },
};

export const useBackendApi = () => !!API_BASE;
