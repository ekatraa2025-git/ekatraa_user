/**
 * Pipecat voice session helpers (customer + vendor apps).
 */

export function isPipecatVoiceEnabled(flag) {
    const v = String(flag ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/** Map raw Pipecat / network errors to actionable messages for users. */
export function formatPipecatConnectError(raw) {
    const msg = String(raw || '').trim() || 'Could not start live voice.';
    if (/502|503|504|failed to respond|application failed|pipecat_unavailable|not responding|unavailable/i.test(msg)) {
        return 'Pipecat voice server is offline. Redeploy pipecat-service on Railway and confirm /health responds.';
    }
    if (/network request failed|fetch failed|timeout|timed out|abort|unreachable|could not connect/i.test(msg)) {
        return 'Cannot reach the Pipecat voice server. Check network and PIPECAT_SERVICE_URL on the backend.';
    }
    if (/No room URL|room URL has been provided/i.test(msg)) {
        return 'Pipecat transport mismatch. Set PIPECAT_TRANSPORT=daily on Railway and configure DAILY_API_KEY.';
    }
    return msg;
}

function pipecatBaseFromStartUrl(startUrl) {
    return String(startUrl || '').replace(/\/start\/?$/, '').replace(/\/$/, '');
}

/** Preflight before WebRTC — avoids hanging on "Connecting live voice". */
export async function checkPipecatServiceHealth(startUrl, timeoutMs = 8000) {
    const base = pipecatBaseFromStartUrl(startUrl);
    if (!base) throw new Error('Pipecat start URL is missing from the voice session.');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}/health`, { method: 'GET', signal: ctrl.signal });
        if (!res.ok) {
            throw new Error(`Pipecat voice server unavailable (${res.status}).`);
        }
        const data = await res.json().catch(() => null);
        if (data?.status && data.status !== 'ok') {
            throw new Error(data.detail || 'Pipecat voice server is unhealthy.');
        }
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw new Error('Pipecat voice server timed out. Railway may be down or restarting.');
        }
        throw e instanceof Error ? e : new Error('Pipecat voice server is unreachable.');
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchPipecatVoiceSession(apiBase, body, headers = {}) {
    const base = String(apiBase || '').replace(/\/$/, '');
    if (!base) throw new Error('API URL not configured.');
    const res = await fetch(`${base}/api/public/ai/voice/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg =
            (data && (data.error || data.message)) ||
            `Voice session failed (${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : 'Voice session failed');
    }
    return data;
}
