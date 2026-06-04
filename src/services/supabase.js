import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

function readConfig(key) {
    const direct = process.env[key] || process.env[key.replace('EXPO_PUBLIC_', 'NEXT_PUBLIC_')];
    if (direct) return String(direct).trim();
    const extra = Constants.expoConfig?.extra;
    if (extra?.[key]) return String(extra[key]).trim();
    return '';
}

// Get Supabase credentials from env or app.config extra (EAS production builds).
const supabaseUrl = readConfig('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = readConfig('EXPO_PUBLIC_SUPABASE_ANON_KEY');

const resolvedUrl = supabaseUrl || (__DEV__ ? 'https://placeholder.supabase.co' : '');
const resolvedKey = supabaseAnonKey || (__DEV__ ? 'placeholder-key' : '');

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
    console.warn(
        'Supabase credentials not found. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env or EAS secrets.'
    );
}

if (!resolvedUrl || !resolvedKey) {
    throw new Error(
        'Supabase is not configured. Login cannot work until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
}

// Create Supabase client with AsyncStorage for session persistence
export const supabase = createClient(resolvedUrl, resolvedKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Helper to get public URL for storage files
export const getStorageUrl = (bucketName, filePath) => {
    if (!filePath) return null;
    // If it's already a full URL, return as is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
    }
    // Construct Supabase storage public URL
    return `${resolvedUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
};

// Helper to get vendor logo URL
export const getVendorImageUrl = (logoPath, vendorName = 'Vendor') => {
    if (!logoPath) {
        // Return a generated avatar if no logo
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(vendorName)}&background=FF4117&color=fff&size=200`;
    }
    // If it's already a full URL, return as is
    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
        return logoPath;
    }
    // Construct Supabase storage URL (assuming bucket is 'ekatraa2025' or similar)
    return `${resolvedUrl}/storage/v1/object/public/ekatraa2025/${logoPath}`;
};

/** Returns full URL for a service image (storage path or full URL). Returns null if no path (caller can hide image). */
export const getServiceImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    return `${resolvedUrl}/storage/v1/object/public/ekatraa2025/${imagePath}`;
};

const STORAGE_PATH_RE = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/;
const apiBase = readConfig('EXPO_PUBLIC_API_URL');

function sortVendorServiceRows(rows = []) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    return [...list].sort((a, b) => {
        const occA = String(a?.occasion_name || a?.occasion_id || '').toLowerCase();
        const occB = String(b?.occasion_name || b?.occasion_id || '').toLowerCase();
        if (occA !== occB) return occA.localeCompare(occB);

        const catA = String(a?.category_name || a?.category || a?.category_id || '').toLowerCase();
        const catB = String(b?.category_name || b?.category || b?.category_id || '').toLowerCase();
        if (catA !== catB) return catA.localeCompare(catB);

        const orderA = Number(a?.display_order);
        const orderB = Number(b?.display_order);
        if (Number.isFinite(orderA) || Number.isFinite(orderB)) {
            return (Number.isFinite(orderA) ? orderA : 9999) - (Number.isFinite(orderB) ? orderB : 9999);
        }

        return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
}

/** Resolves a storage path (or full Supabase URL) to a signed URL via the backend. Returns null if no path. */
export const resolveStorageUrl = async (pathOrUrl) => {
    if (!pathOrUrl) return null;
    let storagePath = pathOrUrl;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        const match = pathOrUrl.match(STORAGE_PATH_RE);
        if (!match) return pathOrUrl;
        storagePath = match[1];
    }
    if (apiBase) {
        try {
            const res = await fetch(`${apiBase}/api/public/storage/signed-url?path=${encodeURIComponent(storagePath)}`);
            const json = await res.json();
            if (json?.url) return json.url;
        } catch (_) { /* fall through */ }
    }
    try {
        const { data, error } = await supabase.storage
            .from('ekatraa2025')
            .createSignedUrl(storagePath, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
    } catch (_) { /* fall through */ }
    return `${resolvedUrl}/storage/v1/object/public/ekatraa2025/${storagePath}`;
};

// Auth helper functions
export const authService = {
    // Send OTP to phone number
    async sendOtp(phone) {
        const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;
        const { data, error } = await supabase.auth.signInWithOtp({
            phone: formattedPhone,
        });
        return { data, error };
    },

    // Verify OTP
    async verifyOtp(phone, token) {
        const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;
        const { data, error } = await supabase.auth.verifyOtp({
            phone: formattedPhone,
            token,
            type: 'sms',
        });
        return { data, error };
    },

    // Google OAuth — Expo: in-app browser + deep link (matches app.json scheme `ekatraa`, host `auth-callback` on Android)
    async signInWithGoogle() {
        try {
            const redirectTo = Linking.createURL('auth-callback');
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    skipBrowserRedirect: true,
                },
            });

            if (error) return { data: null, error };
            if (!data?.url) return { data: null, error: { message: 'Could not start Google sign-in.' } };

            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

            if (result.type !== 'success' || !result.url) {
                return {
                    data: null,
                    error:
                        result.type === 'cancel' || result.type === 'dismiss'
                            ? { silent: true, message: 'CANCELLED' }
                            : { message: 'Google sign-in was cancelled or failed.' },
                };
            }

            const callbackUrl = result.url;
            let code = null;
            let access_token = null;
            let refresh_token = '';
            try {
                const u = new URL(callbackUrl);
                code = u.searchParams.get('code');
                const hash = (u.hash && u.hash.length > 1) ? u.hash.substring(1) : '';
                if (hash) {
                    const sp = new URLSearchParams(hash);
                    access_token = sp.get('access_token');
                    refresh_token = sp.get('refresh_token') || '';
                }
            } catch {
                /* fall through */
            }

            if (code) {
                const exchanged = await supabase.auth.exchangeCodeForSession(code);
                if (exchanged.error) return { data: null, error: exchanged.error };
                return { data: exchanged.data, error: null };
            }

            if (!access_token && callbackUrl.includes('access_token=')) {
                const m = callbackUrl.match(/access_token=([^&]+)/);
                if (m) access_token = decodeURIComponent(m[1]);
                const mr = callbackUrl.match(/refresh_token=([^&]+)/);
                if (mr) refresh_token = decodeURIComponent(mr[1]);
            }

            if (!access_token) {
                return {
                    data: null,
                    error: {
                        message:
                            'Could not complete Google sign-in. Add this redirect URL in Supabase Auth → URL Configuration: ' +
                            String(Linking.createURL('auth-callback')),
                    },
                };
            }

            const sessionRes = await supabase.auth.setSession({ access_token, refresh_token });
            if (sessionRes.error) return { data: null, error: sessionRes.error };
            return { data: sessionRes.data, error: null };
        } catch (error) {
            console.error('Google OAuth error:', error);
            return {
                data: null,
                error: { message: error?.message || 'Google sign-in failed. Please try again or use OTP.' },
            };
        }
    },

    // Sign out — use local scope so clearing AsyncStorage never throws AuthSessionMissingError
    async signOut() {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        return { error };
    },

    // Get current session (may still have expired access_token until refreshed)
    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        return { session, error };
    },

    /**
     * Refresh access_token via refresh_token (fixes "Invalid or expired token" on backend JWT verify).
     * Falls back to getSession if refresh is not possible.
     */
    async refreshSessionTokens() {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
            return { session: refreshed.session, error: null };
        }
        const { data: { session }, error } = await supabase.auth.getSession();
        const expMs = session?.expires_at ? session.expires_at * 1000 : null;
        const likelyExpired = expMs != null && expMs < Date.now() + 5000;
        // Do not return a cached access_token that is already past expiry — backend getUser(JWT) will 401.
        if (session?.access_token && likelyExpired) {
            return {
                session: null,
                error: refreshErr || error || { message: 'Session expired. Sign in again.' },
            };
        }
        return { session, error: error || refreshErr };
    },

    // Get current user
    async getUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        return { user, error };
    },

    // Listen to auth state changes
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    },
};

// Database service functions - Updated for flexible vendor queries
export const dbService = {
    // Fetch vendors by location (city and/or state) and service category
    async getVendors({ city, state, serviceCategory, limit = 20 }) {
        let query = supabase
            .from('vendors')
            .select(`
                *,
                services (*)
            `);

        if (city) {
            const safeCity = String(city).trim().substring(0, 100);
            if (safeCity) query = query.ilike('city', `%${safeCity}%`);
        }
        if (state) {
            const safeState = String(state).trim().substring(0, 100);
            if (safeState) query = query.ilike('state', `%${safeState}%`);
        }
        if (serviceCategory) {
            const safeCat = String(serviceCategory).trim().substring(0, 100);
            if (safeCat) query = query.ilike('category', `%${safeCat}%`);
        }

        query = query.limit(limit);

        const { data, error } = await query;
        return { data, error };
    },

    // Fetch venues from Supabase
    async getVenues({ city, eventType, limit = 20 }) {
        let query = supabase
            .from('venues')
            .select('*')
            .eq('is_active', true);

        if (city) {
            const safeCity = String(city).trim().substring(0, 100);
            if (safeCity) query = query.ilike('city', `%${safeCity}%`);
        }

        if (eventType && eventType !== 'all') {
            query = query.contains('event_types', [eventType]);
        }

        query = query.limit(limit);

        const { data, error } = await query;
        return { data, error };
    },

    // Fetch service categories
    async getServiceCategories() {
        const { data, error } = await supabase
            .from('vendor_categories')
            .select('*')
            .order('name');
        return { data, error };
    },

    // Fetch event types (get-together types with icon, color, image_url from admin)
    async getEventTypes() {
        const { data, error } = await supabase
            .from('event_types')
            .select('*')
            .eq('is_active', true)
            .order('display_order');
        return { data, error };
    },

    // Fetch occasions from the occasions table (new flow)
    async getOccasions() {
        const { data, error } = await supabase
            .from('occasions')
            .select('id, name, icon, icon_url, image_url, video_url, display_order')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        return { data, error };
    },

    // Fetch categories for an occasion (via occasion_categories join table)
    async getCategoriesByOccasion(occasionId) {
        if (!occasionId) {
            const { data, error } = await supabase
                .from('categories')
                .select('id, name, icon_url, video_url, display_order')
                .eq('is_active', true)
                .order('display_order', { ascending: true });
            return { data, error };
        }
        const { data, error } = await supabase
            .from('occasion_categories')
            .select('category_id, categories(id, name, icon_url, video_url, display_order)')
            .eq('occasion_id', occasionId)
            .order('display_order', { ascending: true });
        if (error) return { data: null, error };
        const list = (data ?? []).flatMap(row =>
            Array.isArray(row.categories) ? row.categories : row.categories ? [row.categories] : []
        );
        return { data: list, error: null };
    },

    // Fetch app service catalog by event type (services shown per get-together type, configurable in admin)
    async getAppServicesByEventType(eventType) {
        let query = supabase
            .from('app_service_catalog')
            .select('*')
            .eq('is_active', true)
            .order('display_order');
        if (eventType && eventType !== 'all') {
            query = query.contains('event_types', [eventType]);
        }
        const { data, error } = await query;
        return { data: data || [], error };
    },

    // Submit enquiry
    async submitEnquiry(enquiryData) {
        const { data, error } = await supabase
            .from('enquiries')
            .insert([enquiryData])
            .select()
            .single();
        return { data, error };
    },

    // Submit booking request
    async submitBooking(bookingData) {
        const { data, error } = await supabase
            .from('bookings')
            .insert([bookingData])
            .select()
            .single();
        return { data, error };
    },

    // Get user's bookings
    async getUserBookings(userId) {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                *,
                vendor:vendors(business_name, logo_url, phone),
                service:services(name, price_amount)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        return { data, error };
    },

    // Get user's enquiries
    async getUserEnquiries(userId) {
        const { data, error } = await supabase
            .from('enquiries')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        return { data, error };
    },

    // Update user profile
    async updateUserProfile(userId, profileData) {
        const { data, error } = await supabase
            .from('user_profiles')
            .upsert({
                id: userId,
                ...profileData,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();
        return { data, error };
    },

    // Get user profile
    async getUserProfile(userId) {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();
        return { data, error };
    },

    // Get cities
    async getCities() {
        const { data, error } = await supabase
            .from('cities')
            .select('*')
            .eq('is_active', true)
            .order('name');
        return { data, error };
    },

    // Get banner ads (success stories, events, promotions)
    async getBanners() {
        const { data, error } = await supabase
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        return { data, error };
    },

    // Get vendors by service category - v4 with proper filtering (city and/or state)
    async getVendorsByService({ serviceCategory, city, state, limit = 80 }) {
        try {
            console.log('[VENDORS-V4] Starting fetch for:', serviceCategory, 'in', city, state ? `state: ${state}` : '');
            
            // Fetch all vendors with their services
            let query = supabase
                .from('vendors')
                .select(`
                    id, 
                    business_name, 
                    owner_name, 
                    category, 
                    description, 
                    phone, 
                    email, 
                    address, 
                    city, 
                    state,
                    logo_url, 
                    status, 
                    is_verified, 
                    created_at,
                    services (
                        id,
                        name,
                        description,
                        price_amount,
                        price_unit,
                        base_price,
                        image_url
                    )
                `)
                .limit(limit);
            if (city) query = query.ilike('city', `%${city}%`);
            // Do NOT filter by state in query - vendors with null state would be excluded; filter in JS instead

            const { data: allVendors, error: fetchError } = await query;

            if (fetchError) {
                console.log('[VENDORS-V4] Fetch error:', fetchError.message);
                return { data: [], error: fetchError };
            }

            let hydratedVendors = allVendors || [];
            const missingServiceVendorIds = hydratedVendors
                .filter((v) => !Array.isArray(v.services) || v.services.length === 0)
                .map((v) => v.id)
                .filter(Boolean);

            if (missingServiceVendorIds.length > 0) {
                const { data: linkedRows } = await supabase
                    .from('offerable_service_vendors')
                    .select(`
                        vendor_id,
                        offerable_services (
                            id,
                            name,
                            description,
                            image_url,
                            display_order,
                            category_id,
                            categories(name)
                        )
                    `)
                    .in('vendor_id', missingServiceVendorIds);

                const serviceMap = new Map();
                (linkedRows || []).forEach((row) => {
                    const vendorId = row?.vendor_id;
                    const svcRaw = row?.offerable_services;
                    const svc = Array.isArray(svcRaw) ? svcRaw[0] : svcRaw;
                    if (!vendorId || !svc) return;
                    const current = serviceMap.get(vendorId) || [];
                    current.push({
                        ...svc,
                        category_name:
                            Array.isArray(svc?.categories) ? svc.categories?.[0]?.name || null : svc?.categories?.name || null,
                    });
                    serviceMap.set(vendorId, current);
                });

                hydratedVendors = hydratedVendors.map((v) => {
                    if (Array.isArray(v.services) && v.services.length > 0) {
                        return { ...v, services: sortVendorServiceRows(v.services) };
                    }
                    const fallback = serviceMap.get(v.id) || [];
                    return { ...v, services: sortVendorServiceRows(fallback) };
                });
            } else {
                hydratedVendors = hydratedVendors.map((v) => ({ ...v, services: sortVendorServiceRows(v.services) }));
            }

            console.log('[VENDORS-V4] Raw fetch:', hydratedVendors?.length || 0, 'vendors');

            // Filter by service category
            let filteredVendors = hydratedVendors || [];
            
            if (serviceCategory && filteredVendors.length > 0) {
                const searchTerm = serviceCategory.toLowerCase().trim();
                const searchStem = searchTerm.slice(0, 4);
                filteredVendors = filteredVendors.filter(v => {
                    const cat = (v.category || '').toLowerCase();
                    const categoryMatch = cat && (cat.includes(searchTerm) || searchTerm.includes(cat) || cat.slice(0, 4) === searchStem || searchStem === cat.slice(0, 4));
                    const serviceMatch = Array.isArray(v.services) && v.services.some(svc =>
                        (svc.name || '').toLowerCase().includes(searchTerm) || searchTerm.includes((svc.name || '').toLowerCase())
                    );
                    return categoryMatch || serviceMatch;
                });
                // Only show vendors that match this service type; do not fall back to all vendors
                console.log('[VENDORS-V4] After category filter:', filteredVendors.length, 'vendors');
            }
            
            // Filter by city if provided (when not already filtered by city in query)
            if (city && filteredVendors.length > 0) {
                const cityTerm = city.toLowerCase();
                const cityFiltered = filteredVendors.filter(v => 
                    v.city?.toLowerCase().includes(cityTerm) ||
                    v.address?.toLowerCase().includes(cityTerm)
                );
                
                // Only apply city filter if it returns results
                if (cityFiltered.length > 0) {
                    filteredVendors = cityFiltered;
                }
                console.log('[VENDORS-V4] After city filter:', filteredVendors.length, 'vendors');
            }
            if (state && filteredVendors.length > 0) {
                const stateTerm = state.toLowerCase();
                const stateFiltered = filteredVendors.filter(v => !v.state || v.state.toLowerCase().includes(stateTerm));
                if (stateFiltered.length > 0) filteredVendors = stateFiltered;
            }

            // Return empty array if no matches - don't show all vendors
            console.log('[VENDORS-V4] Final result:', filteredVendors.length, 'vendors for', serviceCategory);
            return { data: filteredVendors, error: null };
        } catch (err) {
            console.error('[VENDORS-V4] Error:', err);
            return { data: [], error: err };
        }
    },

    // Create booking with all details
    async createBooking(bookingData) {
        const { data, error } = await supabase
            .from('user_bookings')
            .insert([{
                ...bookingData,
                status: 'pending',
                created_at: new Date().toISOString(),
            }])
            .select()
            .single();
        return { data, error };
    },

    // Update booking status
    async updateBookingStatus(bookingId, status) {
        const { data, error } = await supabase
            .from('user_bookings')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', bookingId)
            .select()
            .single();
        return { data, error };
    },

    // Get all bookings for a user with vendor details
    async getAllUserBookings(userId) {
        const { data, error } = await supabase
            .from('user_bookings')
            .select(`
                *,
                vendor:vendors(id, business_name, logo_url, phone, category)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        return { data, error };
    },

    // Get public URL for storage files (synchronous helper)
    getPublicUrl(bucketName, filePath) {
        if (!filePath) return null;
        // If it's already a full URL, return as is
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            return filePath;
        }
        // Construct Supabase storage public URL
        return `${resolvedUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
    },

    // Get vendor services
    async getVendorServices(vendorId) {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('vendor_id', vendorId);
        return { data, error };
    },

    // Get single vendor with all services and details (for VendorDetail page).
    //
    // Two paths produce a `services` row for a vendor:
    //   1. Backend create — writes directly to offerable_service_vendors join.
    //   2. App onboarding — writes to the `services` table per-vendor; those
    //      rows carry catalog_service_id but lack the tier pricing/qty_label/
    //      sub_variety columns the UI expects (getOfferableTierRows reads them).
    //
    // To make both paths render identically (occasion + category + every tier),
    // we always enrich whatever rows we have by joining to offerable_services
    // and the service_occasions catalog before returning.
    async getVendorById(vendorId) {
        const { data, error } = await supabase
            .from('vendors')
            .select('*, services(*)')
            .eq('id', vendorId)
            .single();
        if (error || !data) return { data, error };

        const offerableSelect = `
            id,
            name,
            description,
            image_url,
            video_url,
            display_order,
            category_id,
            categories(name),
            price_min,
            price_max,
            price_unit,
            price_basic,
            price_classic_value,
            price_signature,
            price_prestige,
            price_royal,
            price_imperial,
            qty_label_basic,
            qty_label_classic_value,
            qty_label_signature,
            qty_label_prestige,
            qty_label_royal,
            qty_label_imperial,
            sub_variety_basic,
            sub_variety_classic_value,
            sub_variety_signature,
            sub_variety_prestige,
            sub_variety_royal,
            sub_variety_imperial
        `;

        const normalizeOfferable = (svc) => {
            if (!svc) return null;
            return {
                ...svc,
                category_name: Array.isArray(svc?.categories)
                    ? svc.categories?.[0]?.name || null
                    : svc?.categories?.name || null,
            };
        };

        const fetchOccasionMap = async (ids) => {
            const map = new Map();
            if (!ids.length) return map;
            const { data: occRows } = await supabase
                .from('service_occasions')
                .select('service_id, occasions(name)')
                .in('service_id', ids);
            (occRows || []).forEach((row) => {
                const sid = row?.service_id;
                const occRaw = row?.occasions;
                const occObj = Array.isArray(occRaw) ? occRaw[0] : occRaw;
                const occName = occObj?.name || null;
                if (sid && occName && !map.has(sid)) map.set(sid, occName);
            });
            return map;
        };

        let services = Array.isArray(data.services) ? data.services : [];

        // PATH A: vendor has rows in `services` (app-onboarded or imported).
        // Enrich each row from its linked offerable_services entry so tier
        // pricing/qty/sub-variety + category + occasion are present.
        if (services.length > 0) {
            const catalogIds = Array.from(
                new Set(
                    services
                        .map((s) => s?.catalog_service_id)
                        .filter((id) => typeof id === 'string' && id.length > 0)
                )
            );

            let catalogById = new Map();
            if (catalogIds.length > 0) {
                const { data: catalogRows } = await supabase
                    .from('offerable_services')
                    .select(offerableSelect)
                    .in('id', catalogIds);
                (catalogRows || []).forEach((row) => {
                    const norm = normalizeOfferable(row);
                    if (norm?.id) catalogById.set(norm.id, norm);
                });
            }

            const occasionMap = await fetchOccasionMap(catalogIds);

            services = services.map((svc) => {
                const catalog = svc?.catalog_service_id
                    ? catalogById.get(svc.catalog_service_id)
                    : null;
                if (!catalog) return svc;
                // Merge: prefer the vendor row's own non-null fields, fall
                // back to the catalog so tier pricing/qty_label/sub_variety
                // always appear. Occasion/category prefer the vendor row only
                // when set; otherwise pull from the catalog + occasions table.
                const merged = { ...catalog, ...svc };
                for (const key of Object.keys(catalog)) {
                    if (merged[key] == null) merged[key] = catalog[key];
                }
                if (!merged.category_name) merged.category_name = catalog.category_name;
                if (!merged.occasion_name) {
                    merged.occasion_name = occasionMap.get(catalog.id) || null;
                }
                return merged;
            });
        } else {
            // PATH B: no `services` rows at all — fall back to the
            // offerable_service_vendors join used by backend-onboarded vendors.
            const { data: linkedRows } = await supabase
                .from('offerable_service_vendors')
                .select(`offerable_services (${offerableSelect})`)
                .eq('vendor_id', vendorId);

            const offerableServices = (linkedRows || [])
                .map((row) => {
                    const svcRaw = row?.offerable_services;
                    const svc = Array.isArray(svcRaw) ? svcRaw[0] : svcRaw;
                    return normalizeOfferable(svc);
                })
                .filter(Boolean);

            const offerableIds = offerableServices.map((s) => s.id).filter(Boolean);
            const occasionMap = await fetchOccasionMap(offerableIds);

            services = offerableServices.map((svc) => ({
                ...svc,
                occasion_name: occasionMap.get(svc.id) || null,
            }));
        }

        return { data: { ...data, services: sortVendorServiceRows(services) }, error: null };
    },
};

export default supabase;
