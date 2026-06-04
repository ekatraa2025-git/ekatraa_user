import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Pressable,
    Switch,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    createAudioPlayer,
    setAudioModeAsync,
    useAudioRecorder,
    RecordingPresets,
    AudioModule,
} from 'expo-audio';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { isPipecatVoiceEnabled } from '../lib/pipecatVoice';
import { isExpoGoClient } from '../lib/pipecatNative';
import { usePipecatVoice } from '../hooks/usePipecatVoice';
import { sanitizeAiDisplayText } from '../utils/sanitizeAiDisplayText';
import { VOICE_LANG_OPTIONS, readStoredVoiceLang, persistVoiceLang } from '../utils/voiceLanguages';
import AssistantMarkdownMessage from './AssistantMarkdownMessage';
import { colors as brandColors } from '../theme/colors';

const USE_MASTRA_PLANNING =
    process.env.EXPO_PUBLIC_AI_PLANNING === '1' || process.env.EXPO_PUBLIC_AI_PLANNING === 'true';
const USE_PIPECAT_VOICE = isPipecatVoiceEnabled(process.env.EXPO_PUBLIC_PIPECAT_VOICE);

const SUGGESTED_PROMPTS = [
    'Plan a wedding in Bhubaneswar on a mid-range budget',
    'What services do you offer for a child’s birthday party?',
    'Compare package tiers and what’s included in each',
    'Suggest vendors for traditional Odia catering',
];

const CART_LINE = /(?:^|\n)CART_ACTIONS:(\{[\s\S]*\})\s*$/m;
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function splitCartActions(fullText) {
    const t = String(fullText ?? '');
    const m = t.match(CART_LINE);
    if (!m) {
        return { display: t.trim(), items: [] };
    }
    let items = [];
    try {
        const j = JSON.parse(m[1]);
        if (j && Array.isArray(j.items)) {
            for (const row of j.items) {
                const sid = row && typeof row.service_id === 'string' ? row.service_id.trim() : '';
                if (!UUID_RE.test(sid)) continue;
                const q = Math.min(100, Math.max(1, Math.floor(Number(row.quantity)) || 1));
                const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null;
                const priceRaw = Number(row.unit_price_inr);
                const unitPriceInr = Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) : null;
                const category = typeof row.category === 'string' && row.category.trim() ? row.category.trim() : null;
                const recommended = row.recommended === true;
                items.push({
                    service_id: sid,
                    quantity: q,
                    ...(label ? { label } : {}),
                    ...(unitPriceInr != null ? { unitPriceInr } : {}),
                    ...(category ? { category } : {}),
                    recommended,
                });
            }
        }
    } catch {
        /* ignore */
    }
    const display = t.replace(CART_LINE, '').trim();
    return { display, items };
}

function formatInr(value) {
    if (!Number.isFinite(value)) return '';
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Agent voice confirmations after silent cart/budget tool writes. */
function detectLiveCartConfirmation(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    const cartAdded =
        /\badded\b/.test(lower) &&
        (/\bto your cart\b/.test(lower) || /\bin your cart\b/.test(lower) || /\bcart\b/.test(lower));
    const budgetSaved =
        /\bbudget\b/.test(lower) &&
        (/\bsaved\b/.test(lower) || /\bupdated\b/.test(lower) || /\bset\b/.test(lower));
    if (!cartAdded && !budgetSaved) return null;
    return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function buildWelcomeMessages(city, occasionName) {
    const place = city ? ` in ${city}` : '';
    const occ = occasionName
        ? ` If you're planning ${occasionName}, we can talk through budget areas and what to explore next in the app.`
        : '';
    return [
        // { id: '1', text: `Namaste! 🙏 I'm Ekatraa AI — here to help with gatherings using what's in the Ekatraa app${place}.`, sender: 'bot' },
        // { id: '2', text: `Ask about occasions, spending areas, or what to book.${occ} I'll suggest real categories and service types from our catalog when it helps.`, sender: 'bot' },
    ];
}

export default function ChatModal({
    visible,
    onClose,
    city,
    occasionId,
    occasionName,
    plannedBudgetInr,
    eventFormSnapshot,
    navigation,
}) {
    const { theme, isDarkMode } = useTheme();
    const { showToast, showConfirm } = useToast();
    const { isAuthenticated, user, session } = useAuth();
    const { cartId, cartOwnerAnonSession, setCartId, refreshCartCount, cartItemCount } = useCart();
    const insets = useSafeAreaInsets();
    const planningThreadIdRef = useRef(`app-chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    /** Mirrors `carts.session_id` for anonymous carts so planning API can authorize `get_cart_summary`. */
    const planningCartSessionRef = useRef(null);
    const [messages, setMessages] = useState(() => buildWelcomeMessages(city, occasionName));
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isVoiceBusy, setIsVoiceBusy] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [addingServiceId, setAddingServiceId] = useState(null);
    const [selectedByMessageId, setSelectedByMessageId] = useState({});
    const [cartSheetVisible, setCartSheetVisible] = useState(false);
    const [cartSheetLoading, setCartSheetLoading] = useState(false);
    const [cartSheetData, setCartSheetData] = useState(null);
    const flatListRef = useRef(null);
    const prevVisibleRef = useRef(false);
    const liveVoiceActiveRef = useRef(false);
    const cartIdRef = useRef(cartId);
    const liveCartBaselineRef = useRef(cartItemCount);
    const openCartSheetRef = useRef(() => {});
    const lastVoiceCartConfirmRef = useRef(0);
    const recordingRef = useRef(null);
    const playbackRef = useRef(null);
    const playbackStatusSubRef = useRef(null);
    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const [liveVoiceMode, setLiveVoiceMode] = useState(USE_PIPECAT_VOICE);
    const [voiceLang, setVoiceLang] = useState('en-IN');

    const appendVoiceMessage = useCallback((role, text) => {
        const t = String(text || '').trim();
        if (!t) return;
        setMessages((prev) => [...prev, { id: `${role}-${Date.now()}`, text: t, sender: role === 'user' ? 'user' : 'bot' }]);
    }, []);

    useEffect(() => {
        cartIdRef.current = cartId;
    }, [cartId]);

    const handleBotVoiceTranscript = useCallback(
        (text) => {
            appendVoiceMessage('assistant', text);
            if (!liveVoiceActiveRef.current) return;

            const confirmation = detectLiveCartConfirmation(text);
            if (confirmation) {
                lastVoiceCartConfirmRef.current = Date.now();
                showToast({
                    variant: 'success',
                    title: 'Cart updated',
                    message: confirmation,
                    action: { label: 'View cart', onPress: () => openCartSheetRef.current() },
                });
            }

            const cid = cartIdRef.current;
            if (cid) void refreshCartCount(cid);
        },
        [appendVoiceMessage, refreshCartCount, showToast]
    );

    const pipecatVoice = usePipecatVoice({
        apiBase: process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '',
        enabled: USE_PIPECAT_VOICE && liveVoiceMode && visible,
        sessionRequest: {
            agent: 'customer',
            thread_id: planningThreadIdRef.current,
            voice_target_language_code: voiceLang,
            city: city || undefined,
            occasion_id: occasionId != null ? String(occasionId) : undefined,
            occasion_name: occasionName || undefined,
            planned_budget_inr:
                typeof plannedBudgetInr === 'number' && Number.isFinite(plannedBudgetInr) ? plannedBudgetInr : undefined,
            event_form_snapshot: eventFormSnapshot || undefined,
            cart_owner_session_id: planningCartSessionRef.current || cartOwnerAnonSession || undefined,
            cart_id: cartId || undefined,
        },
        authHeaders: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        onUserTranscript: (text) => appendVoiceMessage('user', text),
        onBotTranscript: (text) => handleBotVoiceTranscript(text),
        onError: (message) => showToast({ variant: 'error', title: 'Live voice', message }),
    });

    useEffect(() => {
        liveVoiceActiveRef.current = pipecatVoice.liveActive;
    }, [pipecatVoice.liveActive]);

    const prevLiveVoiceRef = useRef(false);
    useEffect(() => {
        if (pipecatVoice.liveActive && !prevLiveVoiceRef.current) {
            liveCartBaselineRef.current = cartItemCount;
        }
        prevLiveVoiceRef.current = pipecatVoice.liveActive;
    }, [pipecatVoice.liveActive, cartItemCount]);

    useEffect(() => {
        let cancelled = false;
        void readStoredVoiceLang().then((code) => {
            if (!cancelled) setVoiceLang(code);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (visible && !prevVisibleRef.current) {
            setMessages(buildWelcomeMessages(city, occasionName));
            setSelectedByMessageId({});
            /* Keep Mastra cart proof aligned with persisted anonymous cart anchor. */
            if (cartOwnerAnonSession) planningCartSessionRef.current = cartOwnerAnonSession;
        }
        prevVisibleRef.current = visible;
    }, [visible, city, occasionName, cartOwnerAnonSession]);

    const MAX_MESSAGE_LENGTH = 2000;

    const stopPlayback = useCallback(async () => {
        const player = playbackRef.current;
        if (!player) return;
        playbackRef.current = null;
        if (playbackStatusSubRef.current) {
            playbackStatusSubRef.current.remove();
            playbackStatusSubRef.current = null;
        }
        try {
            player.pause();
        } catch {
            /* noop */
        }
        try {
            player.remove();
        } catch {
            /* noop */
        }
        setIsSpeaking(false);
    }, []);

    const speakAssistantText = useCallback(
        async (rawText) => {
            const text = String(rawText || '').trim();
            if (!text) return;
            setIsVoiceBusy(true);
            try {
                await stopPlayback();
                const { data, error } = await api.postAiPlanningTts({
                    text,
                    target_language_code: voiceLang,
                });
                if (error) {
                    showToast({ variant: 'error', title: 'Voice', message: error.message || 'TTS failed.' });
                    return;
                }
                if (!data?.audio_base64 || !data?.mime_type) {
                    showToast({ variant: 'error', title: 'Voice', message: 'Invalid TTS response from server.' });
                    return;
                }
                const uri = `data:${data.mime_type};base64,${data.audio_base64}`;
                const player = createAudioPlayer({ uri });
                playbackRef.current = player;
                playbackStatusSubRef.current = player.addListener('playbackStatusUpdate', (status) => {
                    if (status?.didJustFinish) {
                        setIsSpeaking(false);
                    }
                });
                player.play();
                setIsSpeaking(true);
            } catch (e) {
                showToast({ variant: 'error', title: 'Voice', message: e?.message || 'Could not play voice response.' });
                setIsSpeaking(false);
            } finally {
                setIsVoiceBusy(false);
            }
        },
        [showToast, stopPlayback, voiceLang]
    );

    const onSelectChip = useCallback((text) => {
        const t = String(text || '').trim();
        if (!t) return;
        setInputText(t);
    }, []);

    const ensureCart = useCallback(async () => {
        if (cartId) return cartId;
        let sid = planningCartSessionRef.current;
        if (!sid) {
            sid = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            planningCartSessionRef.current = sid;
        }
        const { data, error } = await api.createCartWithAuth({
            session_id: sid,
            user_id: isAuthenticated && user?.id ? user.id : null,
            event_name: occasionName || null,
            location_preference: city || null,
            planned_budget_inr:
                typeof plannedBudgetInr === 'number' && Number.isFinite(plannedBudgetInr) && plannedBudgetInr >= 0
                    ? plannedBudgetInr
                    : null,
        }, session?.access_token);
        if (error) {
            showToast({ variant: 'error', title: 'Cart', message: error.message || 'Could not start a cart.' });
            return null;
        }
        const id = data?.id;
        if (id) {
            const rowSession =
                typeof data?.session_id === 'string' && data.session_id.trim() ? String(data.session_id).trim() : null;
            await setCartId(id, rowSession ?? sid);
            if (planningCartSessionRef.current == null && (rowSession || sid)) {
                planningCartSessionRef.current = rowSession || sid;
            }
            return id;
        }
        return null;
    }, [cartId, setCartId, isAuthenticated, user?.id, occasionName, city, plannedBudgetInr, showToast, session?.access_token]);

    /**
     * Phase 6: make sure a cart exists before live voice starts, so the agent's auto-add tools have a
     * target cart id (passed via sessionRequest.cart_id) and never need to ask the user for one.
     */
    useEffect(() => {
        if (!USE_PIPECAT_VOICE || !liveVoiceMode || !visible) return;
        if (cartId) return;
        void ensureCart();
    }, [liveVoiceMode, visible, cartId, ensureCart]);

    const addServiceToCart = useCallback(
        async (serviceId, label, options = {}) => {
            const sid = String(serviceId || '').trim();
            if (!sid) return;
            setAddingServiceId(sid);
            try {
                const cid = await ensureCart();
                if (!cid) return;
                const { error } = await api.addCartItemWithAuth({
                    cart_id: cid,
                    service_id: sid,
                    quantity: 1,
                    unit_price: null,
                    options: { source: 'ai_chat', label: label || null },
                }, session?.access_token);
                if (error) {
                    showToast({ variant: 'error', title: 'Could not add', message: error.message || 'Try again from the service page.' });
                    return;
                }
                await refreshCartCount(cid);
                if (!options?.silent) {
                    showToast({
                        variant: 'success',
                        title: 'Added to cart',
                        message: (label && String(label)) || 'Service added.',
                        action: navigation
                            ? { label: 'View cart', onPress: () => navigation.navigate('Cart') }
                            : undefined,
                    });
                }
            } finally {
                setAddingServiceId(null);
            }
        },
        [ensureCart, refreshCartCount, showToast, navigation, session?.access_token]
    );

    const toggleCartSelection = useCallback((messageId, serviceId) => {
        setSelectedByMessageId((prev) => {
            const msgMap = { ...(prev?.[messageId] || {}) };
            if (msgMap[serviceId]) delete msgMap[serviceId];
            else msgMap[serviceId] = true;
            return { ...prev, [messageId]: msgMap };
        });
    }, []);

    const handleBulkCartAction = useCallback(
        (messageId, items, shouldCheckout) => {
            const selectedMap = selectedByMessageId?.[messageId] || {};
            const selected = (Array.isArray(items) ? items : []).filter((it) => !!selectedMap[it.service_id]);
            if (!selected.length) {
                showToast({
                    variant: 'info',
                    title: 'Select services',
                    message: 'Tap one or more suggested services first.',
                });
                return;
            }
            const run = async () => {
                for (const it of selected) {
                    // Sequential add keeps ordering stable and avoids cart races.
                    // eslint-disable-next-line no-await-in-loop
                    await addServiceToCart(it.service_id, it.label, { silent: true });
                }
                showToast({
                    variant: 'success',
                    title: shouldCheckout ? 'Budget acknowledged' : 'Added to cart',
                    message: shouldCheckout
                        ? 'Selected services were added. Review and checkout in your cart.'
                        : `${selected.length} service${selected.length > 1 ? 's' : ''} added to cart.`,
                });
                if (shouldCheckout && navigation) navigation.navigate('Cart');
            };
            if (!shouldCheckout) {
                void run();
                return;
            }
            showConfirm({
                title: 'Acknowledge budget plan?',
                message: 'This confirms your selected services for the planned budget. Continue to cart to review before checkout.',
                confirmLabel: 'Acknowledge & Continue',
                cancelLabel: 'Not now',
                onConfirm: () => void run(),
            });
        },
        [selectedByMessageId, showToast, addServiceToCart, navigation, showConfirm]
    );

    const loadCartSheet = useCallback(async () => {
        if (!cartId) {
            setCartSheetData(null);
            return;
        }
        setCartSheetLoading(true);
        try {
            const { data, error } = await api.getCart(cartId, {
                cartOwnerSession: cartOwnerAnonSession,
                accessToken: session?.access_token || null,
            });
            if (error) {
                showToast({ variant: 'error', title: 'Cart', message: error.message || 'Could not load your cart.' });
                setCartSheetData(null);
                return;
            }
            setCartSheetData(data || null);
        } finally {
            setCartSheetLoading(false);
        }
    }, [cartId, cartOwnerAnonSession, session?.access_token, showToast]);

    const openCartSheet = useCallback(() => {
        setCartSheetVisible(true);
        void loadCartSheet();
    }, [loadCartSheet]);

    const goToCheckout = useCallback(() => {
        setCartSheetVisible(false);
        if (navigation) navigation.navigate('Cart');
    }, [navigation]);

    openCartSheetRef.current = openCartSheet;

    /** Fallback toast when cart count rises during live voice but the agent phrasing did not match. */
    useEffect(() => {
        if (!pipecatVoice.liveActive) return;
        const baseline = liveCartBaselineRef.current;
        if (cartItemCount <= baseline) return;
        if (Date.now() - lastVoiceCartConfirmRef.current < 4000) {
            liveCartBaselineRef.current = cartItemCount;
            return;
        }
        const delta = cartItemCount - baseline;
        liveCartBaselineRef.current = cartItemCount;
        showToast({
            variant: 'success',
            title: 'Added to cart',
            message: delta === 1 ? '1 service was added to your cart.' : `${delta} services were added to your cart.`,
            action: { label: 'View cart', onPress: () => openCartSheetRef.current() },
        });
    }, [cartItemCount, pipecatVoice.liveActive, showToast]);

    const cartSheetItems = Array.isArray(cartSheetData?.items) ? cartSheetData.items : [];
    const cartSheetTotal = cartSheetItems.reduce((sum, it) => {
        const price = Number(it?.unit_price) || 0;
        const qty = Number(it?.quantity) || 1;
        return sum + price * qty;
    }, 0);

    const sendWithText = useCallback(
        async (rawText, opts = {}) => {
            const trimmed = String(rawText || '').trim();
            if (!trimmed || isTyping) return;
            if (trimmed.length > MAX_MESSAGE_LENGTH) {
                showToast({
                    variant: 'error',
                    title: 'Message too long',
                    message: `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`,
                });
                return;
            }

            const history = messages.map((m) => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                text: splitCartActions(String(m.text ?? '')).display,
            }));

            const userMsg = { id: Date.now().toString(), text: trimmed, sender: 'user' };
            setMessages((prev) => [...prev, userMsg]);
            setInputText('');
            setIsTyping(true);

            try {
                const chatBody = {
                    message: trimmed,
                    history,
                    ...(city ? { city: String(city) } : {}),
                    ...(occasionId != null && String(occasionId).length > 0 ? { occasion_id: String(occasionId) } : {}),
                    ...(occasionName ? { occasion_name: String(occasionName) } : {}),
                    ...(typeof plannedBudgetInr === 'number' && Number.isFinite(plannedBudgetInr) && plannedBudgetInr >= 0
                        ? { planned_budget_inr: plannedBudgetInr }
                        : {}),
                    ...(eventFormSnapshot && typeof eventFormSnapshot === 'object'
                        ? { event_form_snapshot: eventFormSnapshot }
                        : {}),
                };
                let ownerSid = cartOwnerAnonSession || planningCartSessionRef.current;
                if (
                    USE_MASTRA_PLANNING &&
                    cartId &&
                    !ownerSid &&
                    isAuthenticated &&
                    session?.access_token
                ) {
                    const cg = await api.getCart(cartId, { accessToken: session.access_token });
                    if (cg?.data?.session_id) ownerSid = String(cg.data.session_id);
                }
                if (ownerSid) planningCartSessionRef.current = ownerSid;
                if (USE_MASTRA_PLANNING && ownerSid) chatBody.cart_owner_session_id = ownerSid;
                if (USE_MASTRA_PLANNING && opts.voiceMode) {
                    chatBody.response_mode = 'voice';
                    chatBody.voice_target_language_code = voiceLang;
                }
                const { data, error } = USE_MASTRA_PLANNING
                    ? await api.postAiPlanningMessage(chatBody, planningThreadIdRef.current, session?.access_token)
                    : await api.postAiChat(chatBody);
                if (error) {
                    const rawErr = error.message || 'Could not reach Ekatraa AI. Check your connection and API settings.';
                    setMessages((prev) => [...prev, { id: String(Date.now() + 1), text: rawErr, sender: 'bot' }]);
                    return;
                }
                const rawR = typeof data?.reply === 'string' ? data.reply : '';
                const reply = sanitizeAiDisplayText(rawR);
                setMessages((prev) => [
                    ...prev,
                    { id: String(Date.now() + 1), text: reply || 'No reply from AI.', sender: 'bot' },
                ]);
                if (opts.voiceMode) {
                    const spoken = data?.speech_text || reply;
                    if (spoken) await speakAssistantText(spoken);
                }
            } catch (e) {
                setMessages((prev) => [
                    ...prev,
                    { id: String(Date.now() + 1), text: e?.message || 'Something went wrong.', sender: 'bot' },
                ]);
            } finally {
                setIsTyping(false);
            }
        },
        [
            isTyping,
            messages,
            city,
            occasionId,
            occasionName,
            plannedBudgetInr,
            eventFormSnapshot,
            showToast,
            cartId,
            cartOwnerAnonSession,
            session?.access_token,
            isAuthenticated,
            speakAssistantText,
        ]
    );

    const startVoiceCapture = useCallback(async () => {
        if (isTyping || isRecording || isVoiceBusy) return;
        try {
            await stopPlayback();
            const perm = await AudioModule.requestRecordingPermissionsAsync();
            if (!perm.granted) {
                showToast({ variant: 'error', title: 'Microphone', message: 'Allow microphone access to use voice chat.' });
                return;
            }
            await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
            });
            await audioRecorder.prepareToRecordAsync();
            audioRecorder.record();
            recordingRef.current = true;
            setIsRecording(true);
        } catch (e) {
            showToast({ variant: 'error', title: 'Voice', message: e?.message || 'Could not start recording.' });
            setIsRecording(false);
        }
    }, [isTyping, isRecording, isVoiceBusy, showToast, stopPlayback, audioRecorder]);

    const stopVoiceCapture = useCallback(async () => {
        if (!recordingRef.current) return;
        setIsRecording(false);
        setIsVoiceBusy(true);
        try {
            await audioRecorder.stop();
            recordingRef.current = null;
            const uri = audioRecorder.uri;
            if (!uri) {
                showToast({ variant: 'error', title: 'Voice', message: 'Recording did not produce an audio file.' });
                return;
            }
            const { data, error } = await api.postAiPlanningStt(
                { uri, mimeType: 'audio/m4a', fileName: 'voice-note.m4a', languageCode: voiceLang },
                session?.access_token
            );
            if (error) {
                showToast({ variant: 'error', title: 'Voice', message: error.message || 'Speech recognition failed.' });
                return;
            }
            const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
            if (!transcript) {
                showToast({ variant: 'error', title: 'Voice', message: 'Could not detect speech from your recording.' });
                return;
            }
            await sendWithText(transcript, { voiceMode: true });
        } catch (e) {
            showToast({ variant: 'error', title: 'Voice', message: e?.message || 'Could not process recording.' });
        } finally {
            setIsVoiceBusy(false);
            await setAudioModeAsync({
                allowsRecording: false,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
            }).catch(() => {});
        }
    }, [showToast, session?.access_token, sendWithText, voiceLang, audioRecorder]);

    useEffect(() => {
        return () => {
            if (recordingRef.current) {
                audioRecorder.stop().catch(() => {});
                recordingRef.current = null;
            }
            if (playbackRef.current) {
                playbackRef.current.remove?.();
                playbackRef.current = null;
            }
            if (playbackStatusSubRef.current) {
                playbackStatusSubRef.current.remove();
                playbackStatusSubRef.current = null;
            }
        };
    }, [audioRecorder]);

    const sendMessage = () => {
        void sendWithText(inputText);
    };

    useEffect(() => {
        if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
        }
    }, [messages, isTyping]);

    const showEmptySuggestions = useMemo(
        () => !messages.some((m) => m.sender === 'user') && messages.length <= 2,
        [messages]
    );

    const renderMessage = useCallback(
        ({ item }) => {
            if (item.sender === 'user') {
                return (
                    <View style={styles.userRow}>
                        <LinearGradient
                            colors={[brandColors.primary, brandColors.primaryGradientEnd || brandColors.gradientEnd || '#FFA040']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.userBubble}
                        >
                            <Text style={styles.userText}>{item.text}</Text>
                        </LinearGradient>
                    </View>
                );
            }

            const { display, items } = splitCartActions(item.text);
            const selectedMap = selectedByMessageId?.[item.id] || {};
            const selectedCount = items.filter((it) => !!selectedMap[it.service_id]).length;
            return (
                <View style={styles.assistantRow}>
                    <View style={[styles.assistantIcon, { borderColor: theme.border, backgroundColor: theme.card }]}>
                        <Text style={styles.assistantIconText}>✦</Text>
                    </View>
                    <View style={[styles.assistantCol, { borderColor: theme.border, backgroundColor: theme.card }]}>
                        {display ? (
                            <AssistantMarkdownMessage
                                content={display}
                                theme={theme}
                                colors={brandColors}
                                isDarkMode={isDarkMode}
                                onSelectChip={onSelectChip}
                            />
                        ) : (
                            <Text style={{ color: theme.text }}> </Text>
                        )}
                        {items.length > 0 ? (
                            <View style={styles.cartActions}>
                                {items.map((it) => (
                                    <TouchableOpacity
                                        key={it.service_id}
                                        style={[
                                            styles.addCartBtn,
                                            { borderColor: selectedMap[it.service_id] ? brandColors.primary : theme.border },
                                        ]}
                                        onPress={() => toggleCartSelection(item.id, it.service_id)}
                                        disabled={addingServiceId != null}
                                    >
                                        <Ionicons
                                            name={selectedMap[it.service_id] ? 'checkbox' : 'square-outline'}
                                            size={18}
                                            color={selectedMap[it.service_id] ? brandColors.primary : theme.textLight}
                                        />
                                        <View style={styles.addCartBtnBody}>
                                            <View style={styles.addCartBtnLabelRow}>
                                                {it.recommended ? (
                                                    <Ionicons name="sparkles" size={12} color={brandColors.primary} />
                                                ) : null}
                                                <Text
                                                    style={[
                                                        styles.addCartBtnText,
                                                        { color: selectedMap[it.service_id] ? brandColors.primary : theme.text },
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {it.label || it.service_id.slice(0, 8) + '…'}
                                                </Text>
                                            </View>
                                            {it.category ? (
                                                <Text style={[styles.addCartBtnMeta, { color: theme.textLight }]} numberOfLines={1}>
                                                    {it.category}
                                                </Text>
                                            ) : null}
                                        </View>
                                        {it.unitPriceInr != null ? (
                                            <Text style={[styles.addCartBtnPrice, { color: theme.text }]}>
                                                {formatInr(it.unitPriceInr)}
                                            </Text>
                                        ) : null}
                                    </TouchableOpacity>
                                ))}
                                <View style={styles.cartCtaRow}>
                                    <TouchableOpacity
                                        style={[styles.inlineActionBtn, { borderColor: brandColors.primary }]}
                                        onPress={() => handleBulkCartAction(item.id, items, false)}
                                    >
                                        <Ionicons name="cart-outline" size={15} color={brandColors.primary} />
                                        <Text style={[styles.inlineActionText, { color: brandColors.primary }]}>
                                            Add selected ({selectedCount})
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.inlineActionBtnPrimary, { backgroundColor: brandColors.primary }]}
                                        onPress={() => handleBulkCartAction(item.id, items, true)}
                                    >
                                        <Ionicons name="checkmark-done" size={15} color="#fff" />
                                        <Text style={styles.inlineActionPrimaryText}>Acknowledge budget & checkout</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : null}
                    </View>
                </View>
            );
        },
        [theme, isDarkMode, onSelectChip, addingServiceId, selectedByMessageId, toggleCartSelection, handleBulkCartAction]
    );

    // iOS uses pageSheet (a card that floats below the status bar) but Android
    // renders Modal fullscreen — and even on iOS the sheet can clip the close
    // button when the status bar is opaque. Adding the safe-area top inset to
    // the header keeps the title clear of the system clock on both platforms.
    const headerTopPad = Platform.OS === 'ios' ? 12 : Math.max(insets.top, 12);
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <View
                    style={[
                        styles.header,
                        { borderBottomColor: theme.border, paddingTop: headerTopPad },
                    ]}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: theme.text }]}>Plan with Ekatraa</Text>
                        <Text style={[styles.subtitle, { color: theme.textLight }]}>
                            {pipecatVoice.liveActive
                                ? 'Live voice — Pipecat + Mastra'
                                : 'Event planning — grounded in the catalog'}
                        </Text>
                    </View>
                    {USE_PIPECAT_VOICE ? (
                        <View style={styles.liveToggleWrap}>
                            <Text style={[styles.liveToggleLabel, { color: theme.textLight }]}>Voice</Text>
                            <Switch
                                value={liveVoiceMode}
                                onValueChange={(on) => {
                                    setLiveVoiceMode(on);
                                    if (!on) void pipecatVoice.disconnect();
                                }}
                                disabled={pipecatVoice.status === 'connecting'}
                                trackColor={{ false: theme.border, true: brandColors.primary }}
                            />
                        </View>
                    ) : null}
                    <TouchableOpacity onPress={onClose} hitSlop={12}>
                        <Ionicons name="close-circle" size={30} color={theme.textLight} />
                    </TouchableOpacity>
                </View>

                {USE_PIPECAT_VOICE && liveVoiceMode ? (
                    <View
                        style={[
                            styles.liveStatusBar,
                            {
                                borderBottomColor: theme.border,
                                backgroundColor: pipecatVoice.liveActive
                                    ? isDarkMode
                                        ? 'rgba(16,185,129,0.12)'
                                        : '#ECFDF5'
                                    : pipecatVoice.status === 'error'
                                      ? isDarkMode
                                          ? 'rgba(220,38,38,0.12)'
                                          : '#FEF2F2'
                                      : pipecatVoice.status === 'connecting'
                                        ? isDarkMode
                                            ? 'rgba(245,158,11,0.12)'
                                            : '#FFFBEB'
                                        : theme.card,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.liveDot,
                                {
                                    backgroundColor: pipecatVoice.liveActive
                                        ? '#059669'
                                        : pipecatVoice.status === 'error'
                                          ? '#DC2626'
                                          : pipecatVoice.status === 'connecting'
                                            ? '#D97706'
                                            : theme.textLight,
                                },
                            ]}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.liveStatusTitle, { color: theme.text }]}>
                                {pipecatVoice.status === 'connecting'
                                    ? 'Connecting live voice'
                                    : pipecatVoice.status === 'error'
                                      ? 'Live voice unavailable'
                                      : pipecatVoice.liveActive
                                        ? 'Live conversation'
                                        : 'Conversational voice ready'}
                            </Text>
                            <Text style={[styles.liveStatusSub, { color: theme.textLight }]}>
                                {pipecatVoice.status === 'error' && pipecatVoice.error
                                    ? pipecatVoice.error
                                    : pipecatVoice.liveActive
                                      ? 'Speak naturally — transcripts appear in the thread.'
                                      : pipecatVoice.nativeReady
                                        ? 'Tap the mic to start Pipecat + Mastra (Daily WebRTC).'
                                        : isExpoGoClient()
                                          ? 'Close Expo Go. Run npm run android, then npm start and open the Ekatraa dev app.'
                                          : 'Run: npm run android:build — this install needs Daily WebRTC native code.'}
                            </Text>
                        </View>
                        {pipecatVoice.status === 'connecting' ? (
                            <ActivityIndicator size="small" color={brandColors.primary} />
                        ) : null}
                    </View>
                ) : null}

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    extraData={{ isTyping, addingServiceId, messages }}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    ListHeaderComponent={
                        showEmptySuggestions ? (
                            <View style={[styles.suggestCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                                <Text style={[styles.suggestTitle, { color: theme.text }]}>How can we help you plan today?</Text>
                                <Text style={[styles.suggestSub, { color: theme.textLight }]}>
                                    Tap a suggestion or type your own. Lists and tables are tappable to fill the box — you can edit and send. Use
                                    Add to cart when the assistant suggests a service.
                                </Text>
                                <View style={styles.suggestChips}>
                                    {SUGGESTED_PROMPTS.map((p) => (
                                        <Pressable
                                            key={p}
                                            style={({ pressed }) => [
                                                styles.suggestChip,
                                                { borderColor: theme.border, backgroundColor: isDarkMode ? theme.inputBackground : '#fff', opacity: pressed ? 0.9 : 1 },
                                            ]}
                                            onPress={() => {
                                                void sendWithText(p);
                                            }}
                                            disabled={isTyping}
                                        >
                                            <Text style={[styles.suggestChipText, { color: theme.text }]}>{p}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        ) : null
                    }
                    ListFooterComponent={
                        isTyping || (USE_PIPECAT_VOICE && pipecatVoice.status === 'connecting') ? (
                            <View style={styles.thinkingRow}>
                                <View style={[styles.assistantIcon, { borderColor: theme.border }]}>
                                    <Text style={styles.assistantIconText}>✦</Text>
                                </View>
                                <View style={[styles.thinkingBubble, { borderColor: theme.border, backgroundColor: theme.card }]}>
                                    <Text style={{ color: theme.text, fontWeight: '600' }}>
                                        {pipecatVoice.status === 'connecting' ? 'Connecting voice' : 'Thinking'}
                                    </Text>
                                    <ActivityIndicator style={{ marginTop: 8 }} size="small" color={brandColors.primary} />
                                </View>
                            </View>
                        ) : null
                    }
                />

                {cartItemCount > 0 ? (
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={openCartSheet}
                        style={[styles.stickyCartBar, { backgroundColor: brandColors.primary }]}
                    >
                        <View style={styles.stickyCartLeft}>
                            <Ionicons name="cart" size={18} color="#fff" />
                            <Text style={styles.stickyCartText}>
                                {cartItemCount} {cartItemCount === 1 ? 'service' : 'services'} in cart
                            </Text>
                        </View>
                        <View style={styles.stickyCartRight}>
                            <Text style={styles.stickyCartReview}>Review</Text>
                            <Ionicons name="chevron-up" size={16} color="#fff" />
                        </View>
                    </TouchableOpacity>
                ) : null}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : Math.max(insets.bottom, 12) + 12}
                >
                    <View
                        style={[
                            styles.composer,
                            { borderTopColor: theme.border, backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 10) },
                        ]}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.voiceLangRow}
                            style={styles.voiceLangScroll}
                        >
                            {VOICE_LANG_OPTIONS.map((o) => {
                                const selected = voiceLang === o.code;
                                const shortLabel = o.label.split(' · ')[0];
                                return (
                                    <TouchableOpacity
                                        key={o.code}
                                        style={[
                                            styles.voiceLangChip,
                                            {
                                                borderColor: selected ? brandColors.primary : theme.border,
                                                backgroundColor: selected ? brandColors.primary : theme.card,
                                            },
                                        ]}
                                        onPress={() => {
                                            setVoiceLang(o.code);
                                            void persistVoiceLang(o.code);
                                            if (pipecatVoice.liveActive) void pipecatVoice.disconnect();
                                        }}
                                        disabled={pipecatVoice.status === 'connecting' || isRecording}
                                    >
                                        <Text style={[styles.voiceLangChipText, { color: selected ? '#fff' : theme.text }]}>
                                            {shortLabel}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <Text style={[styles.composerHint, { color: theme.textLight }]}>
                            {liveVoiceMode && USE_PIPECAT_VOICE
                                ? pipecatVoice.liveActive
                                    ? 'Live voice session — speak naturally with Ekatraa.'
                                    : 'Tap mic for live Pipecat voice (Mastra + Sarvam).'
                                : isRecording
                                  ? 'Recording… tap stop to transcribe and send.'
                                  : isSpeaking
                                    ? 'Playing voice reply…'
                                    : 'Lists and pricing table rows are tappable. Edit the message, then Send.'}
                        </Text>
                        <View style={[styles.composerRow, { borderColor: theme.border, backgroundColor: theme.inputBackground || theme.card }]}>
                            <TextInput
                                style={[styles.composerInput, { color: theme.text }]}
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder="Message Ekatraa…"
                                placeholderTextColor={theme.textLight}
                                multiline
                                maxLength={MAX_MESSAGE_LENGTH}
                                editable={!isTyping}
                            />
                            <TouchableOpacity
                                onPress={() => {
                                    if (liveVoiceMode && USE_PIPECAT_VOICE) {
                                        void pipecatVoice.toggle();
                                        return;
                                    }
                                    if (isRecording) void stopVoiceCapture();
                                    else void startVoiceCapture();
                                }}
                                style={[
                                    styles.voiceFab,
                                    {
                                        backgroundColor:
                                            isRecording || pipecatVoice.liveActive
                                                ? '#DC2626'
                                                : isVoiceBusy || pipecatVoice.status === 'connecting'
                                                  ? theme.border
                                                  : theme.card,
                                        borderColor: isRecording || pipecatVoice.liveActive ? '#DC2626' : theme.border,
                                        opacity:
                                            isTyping ||
                                            isVoiceBusy ||
                                            pipecatVoice.status === 'connecting'
                                                ? 0.5
                                                : 1,
                                    },
                                ]}
                                disabled={
                                    isTyping ||
                                    isVoiceBusy ||
                                    pipecatVoice.status === 'connecting'
                                }
                            >
                                <Ionicons
                                    name={isRecording || pipecatVoice.liveActive ? 'stop' : 'mic'}
                                    size={18}
                                    color={isRecording || pipecatVoice.liveActive ? '#FFF' : theme.text}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={sendMessage}
                                style={[
                                    styles.sendFab,
                                    { backgroundColor: brandColors.primary, opacity: !inputText.trim() || isTyping ? 0.4 : 1 },
                                ]}
                                disabled={!inputText.trim() || isTyping}
                            >
                                <Ionicons name="send" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>

                <Modal visible={cartSheetVisible} transparent animationType="slide" onRequestClose={() => setCartSheetVisible(false)}>
                    <Pressable style={styles.cartSheetBackdrop} onPress={() => setCartSheetVisible(false)} />
                    <View style={[styles.cartSheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <View style={styles.cartSheetHandle} />
                        <View style={styles.cartSheetHeader}>
                            <Text style={[styles.cartSheetTitle, { color: theme.text }]}>Your cart</Text>
                            <TouchableOpacity onPress={() => setCartSheetVisible(false)} hitSlop={10}>
                                <Ionicons name="close" size={22} color={theme.textLight} />
                            </TouchableOpacity>
                        </View>

                        {cartSheetLoading ? (
                            <View style={styles.cartSheetEmpty}>
                                <ActivityIndicator size="small" color={brandColors.primary} />
                            </View>
                        ) : cartSheetItems.length === 0 ? (
                            <View style={styles.cartSheetEmpty}>
                                <Text style={{ color: theme.textLight }}>No services added yet.</Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.cartSheetList} contentContainerStyle={{ paddingBottom: 8 }}>
                                {cartSheetItems.map((it) => (
                                    <View
                                        key={it.id || it.service_id}
                                        style={[styles.cartSheetRow, { borderBottomColor: theme.border }]}
                                    >
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                            <Text style={[styles.cartSheetItemName, { color: theme.text }]} numberOfLines={2}>
                                                {it.name || it.label || 'Service'}
                                            </Text>
                                            <Text style={[styles.cartSheetItemMeta, { color: theme.textLight }]}>
                                                Qty {Number(it.quantity) || 1}
                                            </Text>
                                        </View>
                                        <Text style={[styles.cartSheetItemPrice, { color: theme.text }]}>
                                            {formatInr((Number(it.unit_price) || 0) * (Number(it.quantity) || 1))}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>
                        )}

                        {cartSheetItems.length > 0 ? (
                            <View style={[styles.cartSheetTotalRow, { borderTopColor: theme.border }]}>
                                <Text style={[styles.cartSheetTotalLabel, { color: theme.textLight }]}>Estimated total</Text>
                                <Text style={[styles.cartSheetTotalValue, { color: theme.text }]}>{formatInr(cartSheetTotal)}</Text>
                            </View>
                        ) : null}

                        <View style={styles.cartSheetActions}>
                            <TouchableOpacity
                                style={[styles.cartSheetSecondary, { borderColor: theme.border }]}
                                onPress={() => setCartSheetVisible(false)}
                            >
                                <Text style={[styles.cartSheetSecondaryText, { color: theme.text }]}>Continue planning</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.cartSheetPrimary,
                                    { backgroundColor: brandColors.primary, opacity: cartSheetItems.length === 0 ? 0.5 : 1 },
                                ]}
                                onPress={goToCheckout}
                                disabled={cartSheetItems.length === 0}
                            >
                                <Ionicons name="bag-check" size={18} color="#fff" />
                                <Text style={styles.cartSheetPrimaryText}>Checkout</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    liveToggleWrap: { alignItems: 'center', gap: 2 },
    liveToggleLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
    liveStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    liveDot: { width: 10, height: 10, borderRadius: 5 },
    liveStatusTitle: { fontSize: 13, fontWeight: '600' },
    liveStatusSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
    title: { fontSize: 18, fontWeight: '700' },
    subtitle: { fontSize: 11, marginTop: 2 },
    listContent: { padding: 12, paddingBottom: 24 },
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12, paddingLeft: 48 },
    userBubble: {
        maxWidth: '90%',
        borderRadius: 18,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    assistantRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingRight: 8, gap: 8 },
    assistantIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    assistantIconText: { fontSize: 16 },
    assistantCol: { flex: 1, maxWidth: '100%', borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
    cartActions: { marginTop: 10, gap: 8 },
    addCartBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    addCartBtnBody: { flex: 1, gap: 2 },
    addCartBtnLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    addCartBtnText: { flexShrink: 1, fontWeight: '600', fontSize: 14 },
    addCartBtnMeta: { fontSize: 11, fontWeight: '500' },
    addCartBtnPrice: { fontSize: 13, fontWeight: '700' },
    stickyCartBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 12,
        marginBottom: 6,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 14,
    },
    stickyCartLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stickyCartText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    stickyCartRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stickyCartReview: { color: '#fff', fontWeight: '600', fontSize: 13 },
    cartSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    cartSheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 18,
        paddingTop: 10,
        maxHeight: '70%',
    },
    cartSheetHandle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(128,128,128,0.4)',
        marginBottom: 12,
    },
    cartSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    cartSheetTitle: { fontSize: 18, fontWeight: '700' },
    cartSheetEmpty: { paddingVertical: 28, alignItems: 'center' },
    cartSheetList: { flexGrow: 0 },
    cartSheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    cartSheetItemName: { fontSize: 14, fontWeight: '600' },
    cartSheetItemMeta: { fontSize: 12, marginTop: 2 },
    cartSheetItemPrice: { fontSize: 14, fontWeight: '700' },
    cartSheetTotalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    cartSheetTotalLabel: { fontSize: 13, fontWeight: '600' },
    cartSheetTotalValue: { fontSize: 17, fontWeight: '800' },
    cartSheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    cartSheetSecondary: {
        flex: 1,
        borderWidth: 1.2,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cartSheetSecondaryText: { fontWeight: '600', fontSize: 14 },
    cartSheetPrimary: {
        flex: 1,
        flexDirection: 'row',
        gap: 6,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cartSheetPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    cartCtaRow: { marginTop: 4, gap: 8 },
    inlineActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1.2,
        borderRadius: 10,
        paddingVertical: 9,
        paddingHorizontal: 10,
    },
    inlineActionBtnPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    inlineActionText: { fontSize: 12.5, fontWeight: '700' },
    inlineActionPrimaryText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
    suggestCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 },
    suggestTitle: { fontSize: 16, fontWeight: '700' },
    suggestSub: { fontSize: 13, lineHeight: 20, marginTop: 6 },
    suggestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    suggestChip: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
    suggestChipText: { fontSize: 13 },
    thinkingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
    thinkingBubble: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
    composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8 },
    voiceLangScroll: { marginBottom: 6 },
    voiceLangRow: { gap: 8, paddingHorizontal: 4 },
    voiceLangChip: {
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    voiceLangChipText: { fontSize: 11, fontWeight: '600' },
    composerHint: { fontSize: 11, marginBottom: 6, marginHorizontal: 4 },
    composerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderWidth: 1,
        borderRadius: 16,
        paddingLeft: 12,
        paddingVertical: 6,
    },
    composerInput: { flex: 1, minHeight: 44, maxHeight: 160, fontSize: 15, lineHeight: 20, paddingVertical: 8 },
    voiceFab: {
        width: 40,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
        marginLeft: 4,
    },
    sendFab: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', margin: 4 },
});
