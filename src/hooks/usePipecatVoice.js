import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import {
    checkPipecatServiceHealth,
    fetchPipecatVoiceSession,
    formatPipecatConnectError,
    isPipecatVoiceEnabled,
} from '../lib/pipecatVoice';
import {
    isPipecatNativeReady,
    loadPipecatVoiceClient,
    pipecatNativeUnavailableMessage,
    waitForPipecatNative,
} from '../lib/pipecatNative';

function extractPipecatClientError(err) {
    if (typeof err?.data === 'string' && err.data.trim()) return err.data.trim();
    if (err instanceof Error && err.message) return err.message;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
    return 'Pipecat client error';
}

async function ensureMicPermission() {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
        throw new Error('Allow microphone access to use live voice.');
    }
    await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
    });
}

/**
 * Live Pipecat voice (Daily WebRTC + Mastra). Requires a dev build — not Expo Go.
 */
export function usePipecatVoice({
    apiBase,
    enabled = isPipecatVoiceEnabled(process.env.EXPO_PUBLIC_PIPECAT_VOICE),
    sessionRequest,
    authHeaders = {},
    onUserTranscript,
    onBotTranscript,
    onError,
}) {
    const clientRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [liveActive, setLiveActive] = useState(false);
    const [nativeReady, setNativeReady] = useState(() => isPipecatNativeReady());

    useEffect(() => {
        if (nativeReady) return undefined;
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            if (isPipecatNativeReady()) {
                setNativeReady(true);
                return;
            }
            const ok = await waitForPipecatNative(8000);
            if (!cancelled && ok) setNativeReady(true);
        };
        void tick();
        const id = setInterval(() => {
            if (isPipecatNativeReady()) {
                setNativeReady(true);
                clearInterval(id);
            }
        }, 400);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [nativeReady]);

    const reportError = useCallback(
        (message) => {
            const formatted = formatPipecatConnectError(message);
            setError(formatted);
            setStatus('error');
            onError?.(formatted);
        },
        [onError]
    );

    const disconnect = useCallback(async () => {
        setLiveActive(false);
        setStatus('idle');
        setError(null);
        try {
            await clientRef.current?.disconnect();
        } catch {
            /* noop */
        }
        clientRef.current = null;
    }, []);

    const connect = useCallback(async () => {
        if (!enabled) {
            reportError('Live Pipecat voice is disabled. Set EXPO_PUBLIC_PIPECAT_VOICE=1.');
            return;
        }
        if (!apiBase?.trim()) {
            reportError('API URL is not configured.');
            return;
        }
        if (liveActive || status === 'connecting') return;

        setStatus('connecting');
        setError(null);

        try {
            const ready = nativeReady || (await waitForPipecatNative());
            if (!ready) {
                reportError(pipecatNativeUnavailableMessage());
                setStatus('error');
                return;
            }
            setNativeReady(true);

            await ensureMicPermission();

            const authToken = authHeaders.Authorization || sessionRequest?.authorization;
            const session = await fetchPipecatVoiceSession(
                apiBase,
                {
                    ...sessionRequest,
                    authorization: authToken,
                },
                authHeaders
            );

            await checkPipecatServiceHealth(session.pipecat.start_url);

            const { PipecatClient, RNDailyTransport } = await loadPipecatVoiceClient();
            const transport = new RNDailyTransport();
            const client = new PipecatClient({
                transport,
                enableMic: true,
                enableCam: false,
                callbacks: {
                    onUserTranscript: (data) => {
                        const text = typeof data?.text === 'string' ? data.text.trim() : '';
                        if (text) onUserTranscript?.(text);
                    },
                    onBotTranscript: (data) => {
                        const text = typeof data?.text === 'string' ? data.text.trim() : '';
                        if (text) onBotTranscript?.(text);
                    },
                    onError: (err) => reportError(extractPipecatClientError(err)),
                },
            });

            clientRef.current = client;
            const useDaily = session.transport === 'daily' || session.daily?.createDailyRoom;
            await client.startBotAndConnect({
                endpoint: session.pipecat.start_url,
                requestData: {
                    ...(useDaily
                        ? {
                              createDailyRoom: true,
                              dailyRoomProperties: session.daily?.dailyRoomProperties ?? { start_video_off: true },
                          }
                        : {}),
                    body: {
                        session: {
                            ...session.session,
                            ...sessionRequest,
                            mastra_openai_base_url: session.mastra.openai_base_url,
                            authorization: authToken,
                        },
                    },
                },
            });

            setLiveActive(true);
            setStatus('connected');
        } catch (e) {
            reportError(e instanceof Error ? e.message : 'Could not start live voice.');
            await disconnect();
        }
    }, [
        apiBase,
        authHeaders,
        disconnect,
        enabled,
        liveActive,
        nativeReady,
        onBotTranscript,
        onUserTranscript,
        reportError,
        sessionRequest,
        status,
    ]);

    useEffect(() => {
        return () => {
            void disconnect();
        };
    }, [disconnect]);

    const toggle = useCallback(async () => {
        if (liveActive) await disconnect();
        else await connect();
    }, [connect, disconnect, liveActive]);

    return {
        enabled,
        status,
        error,
        liveActive,
        nativeReady,
        connect,
        disconnect,
        toggle,
    };
}
