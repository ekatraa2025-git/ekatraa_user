import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, FlatList, Modal, Share, ActivityIndicator,
    Platform, Linking, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useVideoPlayer, VideoView } from 'expo-video';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import { useRazorpay } from '@codearcade/expo-razorpay';
import * as ImagePicker from 'expo-image-picker';

const TABS_LIST = ['Guests', 'Gifts', 'Invite'];

function formatInviteDate(d) {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatInviteTime(d) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Looped muted autoplay for MP4 e-invites via expo-video; PNG/GIF use Image. */
function EInviteLoopVideo({ uri, style, resizeMode = 'cover' }) {
    const player = useVideoPlayer(uri, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });
    return (
        <VideoView
            player={player}
            style={style}
            contentFit={resizeMode === 'cover' ? 'cover' : 'contain'}
            nativeControls={false}
        />
    );
}

function EInviteMediaPreview({ uri, outputMime, style, resizeMode = 'cover' }) {
    const u = String(uri || '');
    const isVideo =
        String(outputMime || '').startsWith('video/') || /\.mp4(\?|$)/i.test(u);
    if (isVideo && u) {
        return <EInviteLoopVideo uri={u} style={style} resizeMode={resizeMode} />;
    }
    return <Image source={{ uri: u }} style={style} resizeMode={resizeMode} />;
}
function sanitizePhoneForWa(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10) return `91${d}`;
    if (d.length >= 12 && d.startsWith('91')) return d;
    if (d.length >= 10) return d;
    return '';
}
function chunkArr(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function pickInviteCharacterPhoto(showToast) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        showToast({
            variant: 'info',
            title: 'Photos access',
            message: 'Allow photo library access to add bride, groom, or main character images.',
        });
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
        base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    if (!asset.base64) {
        showToast({ variant: 'error', title: 'Photo', message: 'Could not read the selected image.' });
        return null;
    }
    return `data:${mime};base64,${asset.base64}`;
}

const COLOR_KEYS = ['rose', 'gold', 'navy', 'emerald', 'royal'];
const VARIATION_KEYS = ['classic', 'modern', 'festive', 'minimal'];
const INVITE_FONT_CHOICES = [
    { id: 'classic_serif', label: 'Classic serif' },
    { id: 'elegant_script', label: 'Elegant script' },
    { id: 'bold_modern_sans', label: 'Bold modern' },
    { id: 'indian_calligraphy', label: 'Festive calligraphy' },
];
const INVITE_STICKER_CHOICES = [
    { id: 'floral_mogra', label: 'Floral · mogra' },
    { id: 'kalash_diya', label: 'Kalash & diya' },
    { id: 'peacock_elephant', label: 'Peacock & elephant' },
    { id: 'confetti_sparkle', label: 'Confetti sparkle' },
    { id: 'minimal_none', label: 'Minimal accents' },
];
const EINVITE_OCCASIONS = ['Wedding', 'Birthday', 'Shradh', 'Janeyu', 'Puja', 'Corporate Event'];
const SAVED_EINVITES_KEY = 'ekatraa.saved.einvites.v1';
const EINVITE_MAX_ITERATIONS = 3;
const EINVITE_MAX_DESIGN_REDESIGNS = 3;
const INVITE_LANGS = [
    { key: 'en', label: 'English' },
    { key: 'hi', label: 'Hindi' },
    { key: 'or', label: 'Odia' },
];
const GEN_STAGES_STATIC = [
    'Preparing prompt…',
    'Generating image…',
    'Uploading to cloud…',
    'Saving invite record…',
];
const GEN_STAGES_ANIMATED = [
    'Preparing prompts…',
    'Refining video direction…',
    'Generating character video…',
    'Uploading to cloud…',
    'Saving invite record…',
];
const FALLBACK_EINVITE_FAQS = [
    {
        id: 'faq-1',
        question: 'How are the wedding cards delivered to recipients?',
        answer: 'Static e-invites are available for download immediately after payment. We also share WhatsApp-ready and shareable links.',
    },
    {
        id: 'faq-2',
        question: 'Can I create a wedding card through my phone as well?',
        answer: 'Yes. Use the AI studio to generate your card, pay once to unlock sharing, and send from your phone.',
    },
    {
        id: 'faq-3',
        question: 'Where can I reach out if I face trouble creating or accessing my wedding card?',
        answer: 'Please contact help@ekatraa.in or use WhatsApp support from the app.',
    },
];

export default function GuestManage({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { theme, isDarkMode } = useTheme();
    const { t } = useLocale();
    const { showToast, showConfirm } = useToast();
    const { openCheckout, closeCheckout, RazorpayUI } = useRazorpay();
    const { user, isAuthenticated, refreshSession } = useAuth();
    const { cartId: globalCartId, setCartId, refreshCartCount } = useCart();
    const userId = user?.id;

    /** Always refresh JWT before API calls — stale session.access_token causes "Invalid or expired token". */
    const resolveAccessToken = useCallback(async () => {
        const s = await refreshSession();
        return s?.access_token ?? null;
    }, [refreshSession]);
    const [activeTab, setActiveTab] = useState('Guests');
    const [guests, setGuests] = useState([]);
    const [gifts, setGifts] = useState([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddGuest, setShowAddGuest] = useState(false);
    const [showAddGift, setShowAddGift] = useState(false);
    const [showImportContacts, setShowImportContacts] = useState(false);
    const [showInviteDesigner, setShowInviteDesigner] = useState(false);
    const [guestForm, setGuestForm] = useState({ name: '', phone: '', relation: '', group: '', notes: '' });
    const [giftForm, setGiftForm] = useState({ guest_id: '', type: 'cash', amount: '', description: '' });
    const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
    const [guestDropdownSearch, setGuestDropdownSearch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [phoneContacts, setPhoneContacts] = useState([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [selectedContacts, setSelectedContacts] = useState(new Set());
    const [contactSearch, setContactSearch] = useState('');
    const [inviteForm, setInviteForm] = useState({
        eventName: '',
        eventDate: '',
        eventTime: '',
        venueName: '',
        venueAddress: '',
        hostNames: '',
        message: '',
    });
    const [inviteDateValue, setInviteDateValue] = useState(() => new Date());
    const [inviteTimeValue, setInviteTimeValue] = useState(() => {
        const x = new Date();
        x.setHours(19, 0, 0, 0);
        return x;
    });
    const [showInviteDatePicker, setShowInviteDatePicker] = useState(false);
    const [showInviteTimePicker, setShowInviteTimePicker] = useState(false);
    const [inviteColorTheme, setInviteColorTheme] = useState('gold');
    const [inviteVariation, setInviteVariation] = useState('classic');
    const [inviteFontStyle, setInviteFontStyle] = useState('classic_serif');
    const [inviteStickerPack, setInviteStickerPack] = useState('floral_mogra');
    const [eInvitePricing, setEInvitePricing] = useState({ static_inr: 300, animated_inr: 500 });
    const [currentUserEInviteId, setCurrentUserEInviteId] = useState(null);
    const [eInvitePaid, setEInvitePaid] = useState(false);
    const [eInvitePayBusy, setEInvitePayBusy] = useState(false);
    const [inviteAiLoadingText, setInviteAiLoadingText] = useState(false);
    const [inviteFaqs, setInviteFaqs] = useState([]);
    const [inviteCatalogLoading, setInviteCatalogLoading] = useState(false);
    const [openFaqId, setOpenFaqId] = useState(null);
    const [waModalVisible, setWaModalVisible] = useState(false);
    const [waChunkIdx, setWaChunkIdx] = useState(0);
    const [inviteOccasion, setInviteOccasion] = useState('Wedding');
    const [inviteMediaType, setInviteMediaType] = useState('image');
    const [invitePrompt, setInvitePrompt] = useState('');
    const [inviteTextLanguage, setInviteTextLanguage] = useState('en');
    const [inviteTexts, setInviteTexts] = useState({ en: '', hi: '', or: '' });
    const [inviteChat, setInviteChat] = useState([
        {
            id: 'welcome',
            sender: 'bot',
            text: 'Fill invitation details below, add invitation wording (or tap AI text). Then describe colours, mood, and art style here to generate the card image.',
        },
    ]);
    const [generatedInvite, setGeneratedInvite] = useState(null);
    const [inviteGeneratingImage, setInviteGeneratingImage] = useState(false);
    const [savedInvites, setSavedInvites] = useState([]);
    const savedInvitesRef = useRef(savedInvites);
    savedInvitesRef.current = savedInvites;
    const [inviteIterationMeta, setInviteIterationMeta] = useState({
        max: EINVITE_MAX_ITERATIONS,
        used: 0,
        remaining: EINVITE_MAX_ITERATIONS,
    });
    const [designRedesignMeta, setDesignRedesignMeta] = useState({
        max: EINVITE_MAX_DESIGN_REDESIGNS,
        used: 0,
        remaining: EINVITE_MAX_DESIGN_REDESIGNS,
    });
    const [inviteGenElapsedSec, setInviteGenElapsedSec] = useState(0);
    const [inviteGenStageIdx, setInviteGenStageIdx] = useState(0);
    const [inviteBrideImage, setInviteBrideImage] = useState(null);
    const [inviteGroomImage, setInviteGroomImage] = useState(null);
    const [inviteMainCharacterImage, setInviteMainCharacterImage] = useState(null);
    const [lastGenerationApiCostUsd, setLastGenerationApiCostUsd] = useState(null);

    useEffect(() => {
        setInviteForm(p => ({
            ...p,
            eventDate: formatInviteDate(inviteDateValue),
            eventTime: formatInviteTime(inviteTimeValue),
        }));
    }, [inviteDateValue, inviteTimeValue]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(SAVED_EINVITES_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                if (!cancelled && Array.isArray(parsed)) setSavedInvites(parsed.slice(0, EINVITE_MAX_ITERATIONS));
            } catch {
                if (!cancelled) setSavedInvites([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!inviteGeneratingImage) {
            setInviteGenElapsedSec(0);
            setInviteGenStageIdx(0);
            return undefined;
        }
        const t = setInterval(() => {
            setInviteGenElapsedSec((s) => s + 1);
            setInviteGenStageIdx((s) => s + 1);
        }, 1000);
        return () => clearInterval(t);
    }, [inviteGeneratingImage]);

    const activeInviteMessage = useMemo(() => {
        return String(inviteTexts[inviteTextLanguage] || inviteForm.message || '').trim();
    }, [inviteTexts, inviteTextLanguage, inviteForm.message]);
    const generationEstimateSec = useMemo(() => (inviteMediaType === 'animated' ? 130 : 80), [inviteMediaType]);
    const generationStages = useMemo(
        () => (inviteMediaType === 'animated' ? GEN_STAGES_ANIMATED : GEN_STAGES_STATIC),
        [inviteMediaType]
    );
    const generationStageText = useMemo(
        () => generationStages[Math.min(inviteGenStageIdx, generationStages.length - 1)] || 'Generating…',
        [generationStages, inviteGenStageIdx]
    );
    const updateInviteTextByLanguage = useCallback((language, text) => {
        setInviteTexts((prev) => ({ ...prev, [language]: text }));
        setInviteForm((p) => ({ ...p, message: text }));
    }, []);

    const guestsWithPhoneList = useMemo(
        () => guests.filter(g => sanitizePhoneForWa(g.phone)),
        [guests]
    );
    const waChunks = useMemo(() => chunkArr(guestsWithPhoneList, 5), [guestsWithPhoneList]);
    const visibleFaqs = useMemo(
        () => (inviteFaqs.length > 0 ? inviteFaqs : FALLBACK_EINVITE_FAQS),
        [inviteFaqs]
    );
    const eInviteUnitPrice = useMemo(
        () => (inviteMediaType === 'animated' ? eInvitePricing.animated_inr : eInvitePricing.static_inr),
        [inviteMediaType, eInvitePricing]
    );

    const loadInviteCatalog = useCallback(async () => {
        setInviteCatalogLoading(true);
        try {
            const [faqsRes, pricingRes] = await Promise.all([
                api.getEInviteFaqs({ limit: 30 }),
                api.getEInvitePricing(),
            ]);
            if (Array.isArray(faqsRes.data)) {
                setInviteFaqs(faqsRes.data);
            } else {
                setInviteFaqs([]);
            }
            if (pricingRes.data?.static_inr != null) {
                setEInvitePricing({
                    static_inr: Number(pricingRes.data.static_inr) || 300,
                    animated_inr: Number(pricingRes.data.animated_inr) || 500,
                });
            }
        } catch {
            setInviteFaqs([]);
        } finally {
            setInviteCatalogLoading(false);
        }
    }, []);

    const loadMyEInvites = useCallback(async () => {
        if (!isAuthenticated) return;
        const token = await resolveAccessToken();
        if (!token) return;
        try {
            const { data, error } = await api.getMyEInvites(token, { limit: 30 });
            if (error) return;
            const serverInvites = Array.isArray(data?.invites)
                ? data.invites.map((it) => {
                    const payload = it?.form_payload || {};
                    return {
                        id: it.id,
                        user_e_invite_id: it.id,
                        payment_status: it.payment_status || 'unpaid',
                        price_inr: it.price_inr,
                        eventName: payload.event_name || payload.eventName || '',
                        occasion: payload.occasion || inviteOccasion,
                        mediaType: it.media_kind === 'animated' ? 'animated' : 'image',
                        output_mime: payload.output_mime || (it.media_kind === 'animated' ? 'video/mp4' : 'image/png'),
                        media_url: it.preview_url || '',
                        prompt: payload.prompt || '',
                        texts: payload.invitation_texts || null,
                        createdAt: it.created_at || new Date().toISOString(),
                        design_redesign_count: Number(payload.design_redesign_count || 0),
                    };
                })
                : [];
            if (serverInvites.length > 0) {
                let localInvites = [];
                try {
                    const localRaw = await AsyncStorage.getItem(SAVED_EINVITES_KEY);
                    const parsed = localRaw ? JSON.parse(localRaw) : [];
                    localInvites = Array.isArray(parsed) ? parsed : [];
                } catch {
                    localInvites = Array.isArray(savedInvitesRef.current) ? savedInvitesRef.current : [];
                }
                const serverIds = new Set(
                    serverInvites.map((x) => String(x?.user_e_invite_id || x?.id || ''))
                );
                // Keep local-only drafts (temp ids like invite-*) so server sync doesn't wipe unpaid local work.
                const localDrafts = localInvites.filter((x) => {
                    const sid = String(x?.user_e_invite_id || x?.id || '');
                    if (!sid) return true;
                    if (sid.startsWith('invite-')) return true;
                    return !serverIds.has(sid);
                });
                await persistSavedInvites([...serverInvites, ...localDrafts]);
            }
            const used = Number(data?.used_iterations ?? serverInvites.length ?? 0);
            const max = Number(data?.max_iterations ?? EINVITE_MAX_ITERATIONS);
            setInviteIterationMeta({
                used,
                max,
                remaining: Math.max(0, max - used),
            });
        } catch {
        }
    }, [isAuthenticated, resolveAccessToken, inviteOccasion]);

    const loadData = useCallback(async () => {
        if (!userId) {
            setDataLoading(false);
            return;
        }
        setDataLoading(true);
        try {
            const token = await resolveAccessToken();
            if (!token) {
                setDataLoading(false);
                return;
            }
            const [guestRes, giftRes] = await Promise.all([
                api.getGuests(token),
                api.getGifts(token),
            ]);
            if (Array.isArray(guestRes.data)) setGuests(guestRes.data);
            if (Array.isArray(giftRes.data)) setGifts(giftRes.data);
        } catch (e) {
            console.log('[GUEST LOAD ERROR]', e);
        } finally {
            setDataLoading(false);
        }
    }, [userId, resolveAccessToken]);

    useFocusEffect(
        useCallback(() => {
            loadData();
            loadInviteCatalog();
            loadMyEInvites();
            if (route?.params?.activeTab === 'Invite') {
                setActiveTab('Invite');
            }
        }, [loadData, loadInviteCatalog, loadMyEInvites, route?.params?.activeTab])
    );

    useEffect(() => {
        const focusId = route?.params?.userEInviteId;
        if (!focusId) return;
        setActiveTab('Invite');
        const sid = String(focusId);
        const fromSaved = savedInvites.find(
            (it) => String(it.user_e_invite_id || it.id) === sid
        );
        if (fromSaved) {
            setGeneratedInvite(fromSaved);
            setCurrentUserEInviteId(fromSaved.user_e_invite_id || fromSaved.id || null);
            setEInvitePaid(String(fromSaved.payment_status || '') === 'paid');
            const usedRedesigns = Number(fromSaved.design_redesign_count || 0);
            setDesignRedesignMeta({
                max: EINVITE_MAX_DESIGN_REDESIGNS,
                used: usedRedesigns,
                remaining: Math.max(0, EINVITE_MAX_DESIGN_REDESIGNS - usedRedesigns),
            });
        }
    }, [route?.params?.userEInviteId, savedInvites]);

    const GUEST_LIMITS = { name: 100, phone: 20, relation: 50, group: 50, notes: 500 };

    const addGuest = async () => {
        const trimmedName = guestForm.name.trim();
        if (!trimmedName) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter guest name.' });
            return;
        }
        if (trimmedName.length > GUEST_LIMITS.name) {
            showToast({ variant: 'info', title: 'Too long', message: `Name must be under ${GUEST_LIMITS.name} characters.` });
            return;
        }
        const phoneDigits = guestForm.phone.replace(/\D/g, '');
        if (guestForm.phone && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
            showToast({ variant: 'info', title: 'Invalid phone', message: 'Please enter a valid phone number.' });
            return;
        }
        if (!userId) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please login to manage guests.' });
            navigation.navigate('Login');
            return;
        }
        setSaving(true);
        try {
            const token = await resolveAccessToken();
            if (!token) {
                showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again to manage guests.' });
                navigation.navigate('Login');
                return;
            }
            const { data, error } = await api.addGuest(
                {
                    name: trimmedName.substring(0, GUEST_LIMITS.name),
                    phone: guestForm.phone ? guestForm.phone.substring(0, GUEST_LIMITS.phone) : null,
                    relation: guestForm.relation ? guestForm.relation.substring(0, GUEST_LIMITS.relation) : null,
                    group_name: guestForm.group ? guestForm.group.substring(0, GUEST_LIMITS.group) : null,
                    notes: guestForm.notes ? guestForm.notes.substring(0, GUEST_LIMITS.notes) : null,
                    invited: true,
                    rsvp: 'pending',
                },
                token
            );
            if (error) {
                showToast({ variant: 'error', title: 'Error', message: error.message || 'Failed to add guest.' });
            } else if (data) {
                setGuests(prev => [data, ...prev]);
            }
        } catch (e) {
            showToast({ variant: 'error', title: 'Error', message: 'Failed to add guest.' });
        } finally {
            setSaving(false);
            setGuestForm({ name: '', phone: '', relation: '', group: '', notes: '' });
            setShowAddGuest(false);
        }
    };

    const addGift = async () => {
        if (!giftForm.guest_id) {
            showToast({ variant: 'info', title: 'Required', message: 'Please select a guest.' });
            return;
        }
        if (!userId) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please login to manage gifts.' });
            navigation.navigate('Login');
            return;
        }
        setSaving(true);
        try {
            const token = await resolveAccessToken();
            if (!token) {
                showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again to manage gifts.' });
                navigation.navigate('Login');
                return;
            }
            const { data, error } = await api.addGift(
                {
                    guest_id: giftForm.guest_id,
                    type: giftForm.type || 'cash',
                    amount: giftForm.amount || '0',
                    description: giftForm.description || null,
                },
                token
            );
            if (error) {
                showToast({ variant: 'error', title: 'Error', message: error.message || 'Failed to save gift.' });
            } else if (data) {
                setGifts(prev => [data, ...prev]);
            }
        } catch (e) {
            showToast({ variant: 'error', title: 'Error', message: 'Failed to save gift.' });
        } finally {
            setSaving(false);
            setGiftForm({ guest_id: '', type: 'cash', amount: '', description: '' });
            setGuestDropdownSearch('');
            setShowAddGift(false);
        }
    };

    const removeGuest = (id) => {
        showConfirm({
            title: 'Remove guest',
            message: 'Are you sure? Associated gifts will also be removed.',
            cancelLabel: 'Cancel',
            confirmLabel: 'Remove',
            destructive: true,
            onConfirm: async () => {
                const token = await resolveAccessToken();
                if (!token) {
                    showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again.' });
                    return;
                }
                const { error } = await api.deleteGuest(id, token);
                if (!error) {
                    setGuests(prev => prev.filter(g => g.id !== id));
                    setGifts(prev => prev.filter(g => g.guest_id !== id));
                } else {
                    showToast({ variant: 'error', title: 'Error', message: 'Failed to remove guest.' });
                }
            },
        });
    };

    const removeGift = (id) => {
        showConfirm({
            title: 'Remove gift',
            message: 'Are you sure?',
            cancelLabel: 'Cancel',
            confirmLabel: 'Remove',
            destructive: true,
            onConfirm: async () => {
                const token = await resolveAccessToken();
                if (!token) {
                    showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again.' });
                    return;
                }
                const { error } = await api.deleteGift(id, token);
                if (!error) {
                    setGifts(prev => prev.filter(g => g.id !== id));
                } else {
                    showToast({ variant: 'error', title: 'Error', message: 'Failed to remove gift.' });
                }
            },
        });
    };

    const toggleRsvp = async (id) => {
        const guest = guests.find(g => g.id === id);
        if (!guest) return;
        const next = guest.rsvp === 'pending' ? 'confirmed' : guest.rsvp === 'confirmed' ? 'declined' : 'pending';
        setGuests(prev => prev.map(g => g.id === id ? { ...g, rsvp: next } : g));
        const token = await resolveAccessToken();
        if (token) {
            await api.updateGuest(id, { rsvp: next }, token);
        }
    };

    const loadPhoneContacts = async () => {
        setContactsLoading(true);
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== 'granted') {
                showToast({
                    variant: 'info',
                    title: 'Permission required',
                    message: 'Please allow access to contacts to import your guest list.',
                });
                setContactsLoading(false);
                return;
            }
            const contactOpts = {
                fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
            };
            if (Contacts.SortTypes?.FirstName) {
                contactOpts.sort = Contacts.SortTypes.FirstName;
            }
            const { data } = await Contacts.getContactsAsync(contactOpts);
            let idx = 0;
            const validContacts = (data || [])
                .filter(c => c.name)
                .map(c => ({
                    id: c.id || `contact_${idx++}`,
                    name: c.name,
                    phone: c.phoneNumbers?.[0]?.number || '',
                }));
            setPhoneContacts(validContacts);
            setSelectedContacts(new Set());
            setShowImportContacts(true);
        } catch (e) {
            console.log('[CONTACTS ERROR]', e?.message || e);
            showToast({
                variant: 'error',
                title: 'Error',
                message: `Could not load contacts: ${e?.message || 'Unknown error'}. Please try again.`,
            });
        } finally {
            setContactsLoading(false);
        }
    };

    const toggleContactSelection = (contactId) => {
        setSelectedContacts(prev => {
            const next = new Set(prev);
            if (next.has(contactId)) next.delete(contactId);
            else next.add(contactId);
            return next;
        });
    };

    const importSelectedContacts = async () => {
        if (!userId) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please login to import contacts.' });
            navigation.navigate('Login');
            return;
        }
        const toImport = phoneContacts.filter(c => selectedContacts.has(c.id));
        if (toImport.length === 0) {
            showToast({ variant: 'info', title: 'No selection', message: 'Please select at least one contact to import.' });
            return;
        }
        const existingNames = new Set(guests.map(g => (g.name || '').toLowerCase().trim()));
        const existingPhones = new Set(
            guests.map(g => (g.phone || '').replace(/\D/g, '')).filter(p => p.length > 0)
        );
        const newContacts = toImport
            .filter(c => {
                const cleanPhone = (c.phone || '').replace(/\D/g, '');
                if (cleanPhone && existingPhones.has(cleanPhone)) return false;
                if (!cleanPhone && existingNames.has((c.name || '').toLowerCase().trim())) return false;
                return true;
            })
            .map(c => ({
                name: c.name,
                phone: c.phone || null,
                group_name: 'Contacts',
            }));
        const skipped = toImport.length - newContacts.length;
        if (newContacts.length === 0) {
            setShowImportContacts(false);
            setSelectedContacts(new Set());
            showToast({
                variant: 'info',
                title: 'No new contacts',
                message: `All ${toImport.length} selected contacts already exist in your guest list.`,
            });
            return;
        }
        setSaving(true);
        try {
            const token = await resolveAccessToken();
            if (!token) {
                showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again to import contacts.' });
                setSaving(false);
                return;
            }
            const result = await api.bulkImportGuests({ guests: newContacts }, token);
            console.log('[IMPORT RESULT]', JSON.stringify(result));
            if (result.error) {
                showToast({
                    variant: 'error',
                    title: 'Import error',
                    message: result.error.message || 'Server returned an error. Please try again.',
                });
            } else {
                const imported = result.data?.imported || newContacts.length;
                if (result.data?.guests?.length) {
                    setGuests(prev => [...result.data.guests, ...prev]);
                } else {
                    await loadData();
                }
                setShowImportContacts(false);
                setSelectedContacts(new Set());
                showToast({
                    variant: 'success',
                    title: 'Imported',
                    message: `${imported} contact${imported !== 1 ? 's' : ''} added.${skipped > 0 ? ` ${skipped} skipped (already exist).` : ''}`,
                });
            }
        } catch (e) {
            console.log('[IMPORT ERROR]', e?.message || e);
            showToast({
                variant: 'error',
                title: 'Import error',
                message: `Something went wrong: ${e?.message || 'Unknown error'}. Please try again.`,
            });
        } finally {
            setSaving(false);
        }
    };

    const buildInvitationText = () => {
        const f = inviteForm;
        const lines = [];
        lines.push(`✨ ${inviteOccasion} E-Invite ✨`);
        lines.push('');
        if (f.eventName) lines.push(`🎉 ${f.eventName}`);
        if (f.hostNames) lines.push(`Hosted by: ${f.hostNames}`);
        lines.push('');
        if (f.eventDate) lines.push(`📅 Date: ${f.eventDate}`);
        if (f.eventTime) lines.push(`🕐 Time: ${f.eventTime}`);
        if (f.venueName) lines.push(`📍 Venue: ${f.venueName}`);
        if (f.venueAddress) lines.push(`   ${f.venueAddress}`);
        lines.push('');
        if (inviteTexts.en) {
            lines.push('English:');
            lines.push(inviteTexts.en);
            lines.push('');
        }
        if (inviteTexts.hi) {
            lines.push('Hindi:');
            lines.push(inviteTexts.hi);
            lines.push('');
        }
        if (inviteTexts.or) {
            lines.push('Odia:');
            lines.push(inviteTexts.or);
            lines.push('');
        }
        if (!inviteTexts.en && !inviteTexts.hi && !inviteTexts.or && f.message) {
            lines.push(f.message);
            lines.push('');
        }
        if (generatedInvite?.media_url && eInvitePaid) {
            lines.push(`${inviteMediaType === 'animated' ? '🎬 Animated invite' : '🖼️ Invite image'}: ${generatedInvite.media_url}`);
            lines.push('');
        } else if (generatedInvite?.media_url && !eInvitePaid) {
            lines.push('🖼️ Your AI invite artwork is ready — complete payment in the app to unlock the download and sharing link.');
            lines.push('');
        }
        lines.push('We look forward to your gracious presence!');
        lines.push('');
        lines.push('— Powered by Ekatraa');
        return lines.join('\n');
    };

    const persistSavedInvites = async (next) => {
        setSavedInvites(next);
        try {
            await AsyncStorage.setItem(SAVED_EINVITES_KEY, JSON.stringify(next.slice(0, EINVITE_MAX_ITERATIONS)));
        } catch { }
    };

    const removeSavedInviteEntry = async (it) => {
        const sid = it.user_e_invite_id || it.id;
        const isLocalOnly = !sid || String(sid).startsWith('invite-');
        if (isLocalOnly) {
            const next = savedInvites.filter((x) => x.id !== it.id);
            await persistSavedInvites(next);
            if (generatedInvite?.id === it.id) {
                setGeneratedInvite(null);
                setCurrentUserEInviteId(null);
                setEInvitePaid(false);
            }
            showToast({
                variant: 'success',
                title: 'Removed',
                message: 'Invite removed from this device.',
            });
            return;
        }
        const token = await resolveAccessToken();
        if (!token) {
            showToast({ variant: 'info', title: 'Sign in', message: 'Sign in to delete saved invites.' });
            return;
        }
        const { error } = await api.deleteMyEInvite(sid, token);
        if (error) {
            showToast({
                variant: 'error',
                title: 'Delete failed',
                message: error.message || 'Could not delete invite.',
            });
            return;
        }
        const next = savedInvites.filter(
            (x) => x.id !== it.id && String(x.user_e_invite_id || x.id) !== String(sid),
        );
        await persistSavedInvites(next);
        const genId = generatedInvite?.user_e_invite_id || generatedInvite?.id;
        if (generatedInvite?.id === it.id || String(genId) === String(sid)) {
            setGeneratedInvite(null);
            setCurrentUserEInviteId(null);
            setEInvitePaid(false);
        }
        showToast({
            variant: 'success',
            title: 'Deleted',
            message: 'Invite removed from your account. Your generation limit is unchanged.',
        });
    };

    const confirmDeleteSavedInvite = (it) => {
        showConfirm({
            title: 'Delete invite',
            message: 'Remove this invite from your account? This cannot be undone. Your generation quota stays the same.',
            cancelLabel: 'Cancel',
            confirmLabel: 'Delete',
            onConfirm: () => {
                void removeSavedInviteEntry(it);
            },
        });
    };

    const runGenerateInviteMedia = async () => {
        const stylePrompt = invitePrompt.trim();
        const inviteBody = activeInviteMessage;
        if (!inviteForm.eventName.trim() && !(generatedInvite?.user_e_invite_id && invitePrompt.trim())) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter event name.' });
            return;
        }
        const isDesignRedesign = Boolean(
            generatedInvite?.user_e_invite_id && generatedInvite?.media_url && stylePrompt
        );
        if (isDesignRedesign) {
            if (designRedesignMeta.remaining <= 0) {
                showToast({
                    variant: 'info',
                    title: 'Redesign limit reached',
                    message: `You can refine this design up to ${designRedesignMeta.max} times via chat.`,
                });
                return;
            }
        } else if (inviteIterationMeta.remaining <= 0) {
            showToast({
                variant: 'info',
                title: 'Iteration limit reached',
                message: `You can generate up to ${inviteIterationMeta.max} invites total (static + animated).`,
            });
            return;
        }
        if (!isAuthenticated) {
            showToast({ variant: 'info', title: 'Sign in', message: 'Sign in to generate and save your AI e-invite.' });
            return;
        }
        if (!inviteBody && !stylePrompt) {
            showToast({
                variant: 'info',
                title: 'Text or style needed',
                message: 'Add invitation wording (or generate it with AI), and/or describe the card look in the chat box.',
            });
            return;
        }
        const token = await resolveAccessToken();
        if (!token) {
            showToast({ variant: 'error', title: 'Session', message: 'Could not refresh your session. Sign in again.' });
            return;
        }
        const combinedPrompt = [stylePrompt, inviteBody ? `Invitation wording to reflect on the card: ${inviteBody}` : '']
            .filter(Boolean)
            .join('\n\n');
        const userMsg = {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: [stylePrompt, inviteBody].filter(Boolean).join(' — ') || combinedPrompt,
        };
        setInviteChat((prev) => [...prev, userMsg, { id: `bot-loading-${Date.now()}`, sender: 'bot', text: inviteMediaType === 'animated' ? 'Creating your animated invite video…' : 'Designing your invite image…' }]);
        setInviteGeneratingImage(true);
        try {
            const mediaBody = {
                occasion: inviteOccasion,
                media_type: inviteMediaType,
                prompt: combinedPrompt,
                event_name: inviteForm.eventName,
                host_names: inviteForm.hostNames,
                event_date: inviteForm.eventDate,
                event_time: inviteForm.eventTime,
                venue: [inviteForm.venueName, inviteForm.venueAddress].filter(Boolean).join(', '),
                design: {
                    color_theme: inviteColorTheme,
                    variation: inviteVariation,
                    font_style: inviteFontStyle,
                    sticker_pack: inviteStickerPack,
                },
                invitation_texts: inviteTexts,
                preferred_language: inviteTextLanguage,
                chat_history: inviteChat.slice(-8),
            };
            if (inviteMediaType === 'animated') {
                if (inviteBrideImage) mediaBody.bride_image = inviteBrideImage;
                if (inviteGroomImage) mediaBody.groom_image = inviteGroomImage;
                if (inviteMainCharacterImage) mediaBody.main_character_image = inviteMainCharacterImage;
            }
            if (isDesignRedesign) {
                mediaBody.redesign = true;
                mediaBody.user_e_invite_id = generatedInvite.user_e_invite_id;
            }
            const { data, error } = await api.generateEInviteMedia(mediaBody, token);
            if (error) {
                const errMsg = String(error?.message || '').trim();
                showToast({
                    variant: 'error',
                    title: 'Generation failed',
                    message: errMsg && errMsg !== 'null' ? errMsg : 'Could not generate invite image. Check OpenRouter API key and admin image model in backend settings.',
                });
                setInviteChat((prev) => prev.filter((m) => !String(m.id).startsWith('bot-loading-')));
                return;
            }
            if (!data?.media_url) {
                showToast({
                    variant: 'error',
                    title: 'Generation failed',
                    message: 'No image URL returned. Check Supabase storage permissions.',
                });
                setInviteChat((prev) => prev.filter((m) => !String(m.id).startsWith('bot-loading-')));
                return;
            }
            const uid = data.user_e_invite_id || `invite-${Date.now()}`;
            const paid = String(data.payment_status || '') === 'paid';
            const apiCostUsd =
                data?.api_cost_usd != null && Number.isFinite(Number(data.api_cost_usd))
                    ? Number(data.api_cost_usd)
                    : data?.openrouter_cost_usd != null && Number.isFinite(Number(data.openrouter_cost_usd))
                      ? Number(data.openrouter_cost_usd)
                      : null;
            setLastGenerationApiCostUsd(apiCostUsd);
            const nextInvite = {
                id: uid,
                user_e_invite_id: data.user_e_invite_id,
                payment_status: data.payment_status || 'unpaid',
                price_inr: data.price_inr ?? eInviteUnitPrice,
                eventName: inviteForm.eventName,
                occasion: inviteOccasion,
                mediaType: inviteMediaType,
                output_mime: data.output_mime || (inviteMediaType === 'animated' ? 'video/mp4' : 'image/png'),
                media_url: data.media_url,
                storage_path: data?.storage_path,
                prompt: data?.prompt || combinedPrompt,
                texts: inviteTexts,
                api_cost_usd: apiCostUsd,
                design_redesign_count: Number(data?.used_design_redesigns ?? designRedesignMeta.used),
                createdAt: new Date().toISOString(),
            };
            setGeneratedInvite(nextInvite);
            setCurrentUserEInviteId(data.user_e_invite_id || null);
            setEInvitePaid(paid);
            setInviteIterationMeta({
                used: Number(data?.used_iterations ?? inviteIterationMeta.used + (isDesignRedesign ? 0 : 1)),
                max: Number(data?.max_iterations ?? inviteIterationMeta.max),
                remaining: Number(
                    data?.remaining_iterations ??
                    Math.max(
                        0,
                        (inviteIterationMeta.max || EINVITE_MAX_ITERATIONS) -
                            (inviteIterationMeta.used + (isDesignRedesign ? 0 : 1))
                    )
                ),
            });
            if (data?.used_design_redesigns != null) {
                setDesignRedesignMeta({
                    max: Number(data?.max_design_redesigns ?? EINVITE_MAX_DESIGN_REDESIGNS),
                    used: Number(data.used_design_redesigns),
                    remaining: Number(
                        data?.remaining_design_redesigns ??
                        Math.max(0, EINVITE_MAX_DESIGN_REDESIGNS - Number(data.used_design_redesigns))
                    ),
                });
            }
            await persistSavedInvites([
                nextInvite,
                ...savedInvites.filter((it) => it.id !== nextInvite.id),
            ]);
            setInviteChat((prev) => [
                ...prev.filter((m) => !String(m.id).startsWith('bot-loading-')),
                {
                    id: `bot-${Date.now()}`,
                    sender: 'bot',
                    text: paid
                        ? 'Your invite design is ready. You can download, share, or edit the wording in the designer.'
                        : isDesignRedesign
                          ? `Design updated (${Number(data?.used_design_redesigns ?? 0)}/${EINVITE_MAX_DESIGN_REDESIGNS} chat refinements used). Pay ₹${Number(data.price_inr || eInviteUnitPrice).toLocaleString('en-IN')} to unlock download and sharing.`
                          : `Your invite preview is ready. Pay ₹${Number(data.price_inr || eInviteUnitPrice).toLocaleString('en-IN')} to unlock download and sharing.${
                              apiCostUsd != null ? ` OpenRouter API cost: $${apiCostUsd.toFixed(4)}.` : ''
                          }`,
                },
            ]);
            setInvitePrompt('');
            showToast({ variant: 'success', title: 'Saved', message: 'Invite generated and saved to your list.' });
        } finally {
            setInviteGeneratingImage(false);
        }
    };

    const payForCurrentEInvite = useCallback(async (inviteIdInput) => {
        const inviteId = inviteIdInput || currentUserEInviteId || generatedInvite?.user_e_invite_id;
        if (!inviteId) return { ok: false };
        if (eInvitePaid) return { ok: true, alreadyPaid: true };
        if (!isAuthenticated) {
            showToast({ variant: 'info', title: 'Sign in', message: 'Sign in to complete e-invite payment.' });
            return { ok: false };
        }
        const token = await resolveAccessToken();
        if (!token) {
            showToast({ variant: 'error', title: 'Session', message: 'Could not refresh your session.' });
            return { ok: false };
        }
        setEInvitePayBusy(true);
        try {
            const { data, error } = await api.createEInvitePaymentOrder({ user_e_invite_id: inviteId }, token);
            setEInvitePayBusy(false);
            if (error || !data?.razorpay_order_id) {
                showToast({
                    variant: 'error',
                    title: 'Payment',
                    message: error?.message || data?.error || 'Could not start payment.',
                });
                return { ok: false };
            }
            const amountInr = data.amount_inr != null ? Number(data.amount_inr) : eInviteUnitPrice;
            const paymentResult = await new Promise((resolve) => {
                openCheckout(
                    {
                        key: data.key,
                        amount: data.amount,
                        currency: 'INR',
                        order_id: data.razorpay_order_id,
                        name: 'Ekatraa',
                        description: `E-invite unlock — ₹${amountInr.toLocaleString('en-IN')}`,
                        prefill: {
                            name: user?.name || user?.email || '',
                            email: user?.email || '',
                            contact: user?.phone || '',
                        },
                        theme: { color: colors.primary },
                    },
                    {
                        onSuccess: async (pay) => {
                            closeCheckout();
                            const verifyTok = (await refreshSession())?.access_token;
                            if (!verifyTok) {
                                showToast({ variant: 'error', title: 'Session expired', message: 'Sign in again to verify payment.' });
                                resolve({ ok: false });
                                return;
                            }
                            const { data: v, error: vErr } = await api.verifyEInvitePayment(
                                {
                                    user_e_invite_id: inviteId,
                                    razorpay_payment_id: pay.razorpay_payment_id,
                                    razorpay_order_id: pay.razorpay_order_id,
                                    razorpay_signature: pay.razorpay_signature,
                                    user_id: userId,
                                },
                                verifyTok
                            );
                            if (vErr || !v?.ok) {
                                showToast({
                                    variant: 'error',
                                    title: 'Verification failed',
                                    message: vErr?.message || 'Payment could not be verified.',
                                });
                                resolve({ ok: false });
                                return;
                            }
                            setEInvitePaid(true);
                            setGeneratedInvite((prev) =>
                                prev
                                    ? {
                                        ...prev,
                                        payment_status: 'paid',
                                        media_url: v.download_url || prev.media_url,
                                    }
                                    : prev
                            );
                            const nextSaved = savedInvites.map((it) =>
                                it.user_e_invite_id === inviteId || it.id === inviteId
                                    ? { ...it, payment_status: 'paid', media_url: v.download_url || it.media_url }
                                    : it
                            );
                            await persistSavedInvites(nextSaved);
                            showToast({
                                variant: 'success',
                                title: 'Paid',
                                message: 'Your e-invite is ready to download and share.',
                            });
                            resolve({ ok: true, download_url: v.download_url || null });
                        },
                        onFailure: (err) => {
                            showToast({
                                variant: 'error',
                                title: 'Payment failed',
                                message: err?.description || 'Payment could not be completed.',
                            });
                            resolve({ ok: false });
                        },
                        onClose: () => resolve({ ok: false }),
                    }
                );
            });
            return paymentResult;
        } catch (e) {
            setEInvitePayBusy(false);
            showToast({ variant: 'error', title: 'Payment', message: e?.message || 'Unexpected error.' });
            return { ok: false };
        }
    }, [
        currentUserEInviteId,
        generatedInvite?.user_e_invite_id,
        eInvitePaid,
        isAuthenticated,
        resolveAccessToken,
        eInviteUnitPrice,
        openCheckout,
        closeCheckout,
        refreshSession,
        userId,
        user,
        showToast,
        savedInvites,
    ]);

    const saveGeneratedInvite = async () => {
        if (!generatedInvite?.media_url) {
            showToast({ variant: 'info', title: 'Generate first', message: 'Create an invite before saving.' });
            return;
        }
        const next = [
            {
                ...generatedInvite,
                eventName: inviteForm.eventName,
                message: inviteForm.message,
                hostNames: inviteForm.hostNames,
                texts: inviteTexts,
            },
            ...savedInvites.filter((it) => it.id !== generatedInvite.id),
        ].slice(0, EINVITE_MAX_ITERATIONS);
        await persistSavedInvites(next);
        showToast({ variant: 'success', title: 'Saved', message: 'Invite saved on this device.' });
    };

    const openGeneratedInvite = async () => {
        if (!generatedInvite?.media_url) {
            showToast({ variant: 'info', title: 'Generate first', message: 'Create an invite before opening.' });
            return;
        }
        const inviteId = generatedInvite?.user_e_invite_id || currentUserEInviteId;
        if (!eInvitePaid) {
            const paid = await payForCurrentEInvite(inviteId);
            if (!paid?.ok) return;
        }
        if (!inviteId) {
            const can = await Linking.canOpenURL(generatedInvite.media_url);
            if (can) await Linking.openURL(generatedInvite.media_url);
            else showToast({ variant: 'error', title: 'Download', message: 'Could not open the invite link.' });
            return;
        }
        const token = await resolveAccessToken();
        if (!token) return;
        const { data, error } = await api.getEInviteDownloadUrl(inviteId, token);
        const url = data?.url || generatedInvite.media_url;
        if (error && !url) {
            showToast({ variant: 'error', title: 'Download', message: error?.message || 'Could not refresh download link.' });
            return;
        }
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) await Linking.openURL(url);
        else showToast({ variant: 'error', title: 'Download', message: 'Could not open the generated invite link.' });
    };

    const openWhatsAppToNumber = async (digits, body) => {
        const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
        const can = await Linking.canOpenURL(url);
        if (can) await Linking.openURL(url);
        else showToast({ variant: 'error', title: 'WhatsApp', message: 'Could not open WhatsApp for this number.' });
    };

    const runGenerateInviteText = async () => {
        if (!inviteForm.eventName.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter event name.' });
            return;
        }
        setInviteAiLoadingText(true);
        try {
            const { data, error } = await api.generateInvitation({
                mode: 'final',
                eventName: inviteForm.eventName,
                eventDate: inviteForm.eventDate,
                eventTime: inviteForm.eventTime,
                venueName: inviteForm.venueName,
                venueAddress: inviteForm.venueAddress,
                hostNames: inviteForm.hostNames,
                message: activeInviteMessage,
                colorTheme: inviteColorTheme,
                variation: inviteVariation,
                templateType: inviteMediaType === 'animated' ? 'video' : 'image',
                session_id: `invite-editor-${Date.now()}`,
            });
            if (error) {
                showToast({ variant: 'error', title: 'Error', message: error.message || 'Could not generate invite text.' });
                return;
            }
            const generatedMulti = data?.final_multilingual || null;
            const generated = String(data?.final || '').trim();
            if (generatedMulti && (generatedMulti.en || generatedMulti.hi || generatedMulti.or)) {
                const nextTexts = {
                    en: String(generatedMulti.en || '').trim(),
                    hi: String(generatedMulti.hi || '').trim(),
                    or: String(generatedMulti.or || '').trim(),
                };
                setInviteTexts(nextTexts);
                setInviteTextLanguage('en');
                setInviteForm((p) => ({ ...p, message: nextTexts.en || generated }));
            } else if (generated) {
                setInviteTexts((prev) => ({ ...prev, [inviteTextLanguage]: generated }));
                setInviteForm((p) => ({ ...p, message: generated }));
            } else {
                showToast({ variant: 'info', title: 'AI text', message: 'No text returned. Try again.' });
            }
        } finally {
            setInviteAiLoadingText(false);
        }
    };

    const startWhatsappBatches = () => {
        if (!inviteForm.eventName.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter event name.' });
            return;
        }
        if (!guestsWithPhoneList.length) {
            showToast({ variant: 'info', title: 'WhatsApp', message: t('invite_wa_no_phone') });
            return;
        }
        if (generatedInvite?.media_url && generatedInvite?.user_e_invite_id && !eInvitePaid) {
            payForCurrentEInvite(generatedInvite.user_e_invite_id).then((paid) => {
                if (!paid?.ok) return;
                setWaChunkIdx(0);
                setWaModalVisible(true);
            });
            return;
        }
        setWaChunkIdx(0);
        setWaModalVisible(true);
    };

    const goToCartAndCheckoutForEInvite = async () => {
        const inviteId = generatedInvite?.user_e_invite_id || currentUserEInviteId;
        if (!inviteId) {
            showToast({ variant: 'info', title: 'Generate first', message: 'Generate an invite before checkout.' });
            return;
        }
        if (!isAuthenticated || !user?.id) {
            showToast({
                variant: 'info',
                title: 'Sign in',
                message: 'Sign in to add your e-invite to the cart and pay at checkout.',
            });
            return;
        }
        if (eInvitePaid) {
            navigation.navigate('Cart');
            return;
        }
        const token = await resolveAccessToken();
        if (!token) {
            showToast({
                variant: 'error',
                title: 'Session',
                message: 'Could not refresh your session. Try signing in again.',
            });
            return;
        }
        let cid = globalCartId;
        try {
            if (!cid) {
                const { data: created, error: cartErr } = await api.createCartWithAuth(
                    {
                        user_id: user.id,
                        event_name:
                            (inviteForm.eventName && String(inviteForm.eventName).trim()) ||
                            generatedInvite?.eventName ||
                            null,
                    },
                    token
                );
                if (cartErr) {
                    showToast({
                        variant: 'error',
                        title: 'Cart',
                        message: cartErr.message || 'Could not create cart.',
                    });
                    return;
                }
                cid = created?.id;
                if (cid) await setCartId(cid, created?.session_id ?? undefined);
            }
            if (!cid) {
                showToast({ variant: 'error', title: 'Cart', message: 'No cart available.' });
                return;
            }
            const { error: itemErr } = await api.addCartItemWithAuth(
                { cart_id: cid, user_e_invite_id: inviteId, quantity: 1 },
                token
            );
            if (itemErr) {
                showToast({
                    variant: 'error',
                    title: 'Cart',
                    message: itemErr.message || 'Could not add e-invite to cart.',
                });
                return;
            }
            await refreshCartCount(cid);
            navigation.navigate('Cart');
            showToast({
                variant: 'success',
                title: 'Added to cart',
                message: 'Your e-invite and price are in the cart. Proceed to checkout when ready.',
            });
        } catch (e) {
            showToast({
                variant: 'error',
                title: 'Cart',
                message: e?.message || 'Something went wrong.',
            });
        }
    };

    const shareInvitation = async () => {
        if (!inviteForm.eventName.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter event name.' });
            return;
        }
        if (generatedInvite?.media_url && generatedInvite?.user_e_invite_id && !eInvitePaid) {
            const paid = await payForCurrentEInvite(generatedInvite.user_e_invite_id);
            if (!paid?.ok) return;
        }
        const text = buildInvitationText();
        try {
            await Share.share({ message: text, title: inviteForm.eventName });
        } catch (e) { }
    };

    const shareToSpecificGuest = async (guest) => {
        if (!inviteForm.eventName.trim()) {
            showToast({
                variant: 'info',
                title: 'Fill invitation',
                message: 'Please fill the invitation details first, then share.',
            });
            return;
        }
        if (generatedInvite?.media_url && generatedInvite?.user_e_invite_id && !eInvitePaid) {
            const paid = await payForCurrentEInvite(generatedInvite.user_e_invite_id);
            if (!paid?.ok) return;
        }
        const personalText = `Dear ${guest.name},\n\n${buildInvitationText()}`;
        try {
            await Share.share({ message: personalText, title: inviteForm.eventName });
        } catch (e) { }
    };

    const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredGifts = gifts.filter(g => (g.guest_name || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const totalGiftAmount = gifts.filter(g => g.type === 'cash').reduce((s, g) => s + (g.amount || 0), 0);
    const filteredPhoneContacts = phoneContacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.phone || '').includes(contactSearch)
    );
    const dropdownGuests = guests.filter(g =>
        g.name.toLowerCase().includes(guestDropdownSearch.toLowerCase())
    );
    const selectedGiftGuest = guests.find(g => g.id === giftForm.guest_id);

    const rsvpColor = (status) => {
        if (status === 'confirmed') return '#22C55E';
        if (status === 'declined') return '#EF4444';
        return '#F59E0B';
    };

    const renderGuest = ({ item }) => (
        <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.listName, { color: theme.text }]}>{item.name}</Text>
                <View style={styles.listMeta}>
                    {item.relation ? <Text style={[styles.listTag, { color: theme.textLight }]}>{item.relation}</Text> : null}
                    {(item.group_name || item.group) ? <Text style={[styles.listTag, { color: theme.textLight }]}>• {item.group_name || item.group}</Text> : null}
                    {item.phone ? <Text style={[styles.listTag, { color: theme.textLight }]}>• {item.phone}</Text> : null}
                </View>
            </View>
            <TouchableOpacity
                style={[styles.rsvpBadge, { backgroundColor: rsvpColor(item.rsvp) + '18' }]}
                onPress={() => toggleRsvp(item.id)}
            >
                <Text style={[styles.rsvpText, { color: rsvpColor(item.rsvp) }]}>{item.rsvp}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeGuest(item.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
        </View>
    );

    const renderGift = ({ item }) => (
        <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.listName, { color: theme.text }]}>{item.guest_name}</Text>
                <View style={styles.listMeta}>
                    <Text style={[styles.listTag, { color: theme.textLight }]}>
                        {item.type === 'cash' ? `₹${(item.amount || 0).toLocaleString()}` : item.description || 'Gift item'}
                    </Text>
                </View>
            </View>
            <View style={[styles.giftTypeBadge, { backgroundColor: item.type === 'cash' ? '#22C55E18' : colors.primary + '15' }]}>
                <Ionicons name={item.type === 'cash' ? 'cash-outline' : 'gift-outline'} size={16} color={item.type === 'cash' ? '#22C55E' : colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: item.type === 'cash' ? '#22C55E' : colors.primary, marginLeft: 4 }}>
                    {item.type === 'cash' ? 'Cash' : 'Gift'}
                </Text>
            </View>
            <TouchableOpacity onPress={() => removeGift(item.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
        </View>
    );

    const renderInviteTab = () => (
        <ScrollView contentContainerStyle={styles.inviteScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.eInviteShell, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.eInviteTopRow}>
                    <Text style={[styles.eInviteTitle, { color: theme.text }]}>AI E-Invite Studio</Text>
                    <TouchableOpacity
                        style={styles.eInviteYourCardsBtn}
                        onPress={() => showToast({ variant: 'info', title: 'Saved invites', message: `${savedInvites.length} invite${savedInvites.length === 1 ? '' : 's'} saved on this device.` })}
                    >
                        <Ionicons name="albums-outline" size={14} color={theme.textLight} />
                        <Text style={[styles.eInviteYourCardsText, { color: theme.textLight }]}>Saved ({savedInvites.length})</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.eInvitePricingBanner, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.eInvitePricingTitle, { color: theme.text }]}>Simple pricing</Text>
                        <Text style={[styles.eInvitePricingSub, { color: theme.textLight }]}>
                            Static image · ₹{eInvitePricing.static_inr} · Animated MP4 · ₹{eInvitePricing.animated_inr}. Pay after you generate to unlock download & sharing.
                        </Text>
                        <Text style={[styles.eInvitePricingSub, { color: theme.textLight, marginTop: 4 }]}>
                            Generations: {inviteIterationMeta.used}/{inviteIterationMeta.max} · Chat redesigns: {designRedesignMeta.used}/{designRedesignMeta.max}
                        </Text>
                    </View>
                </View>

                {inviteCatalogLoading ? (
                    <View style={styles.inviteCatalogLoading}>
                        <ActivityIndicator color={colors.primary} />
                    </View>
                ) : null}
            </View>

            <View style={[styles.aiInviteStudio, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <LinearGradient
                    colors={isDarkMode ? ['#1F2937', '#111827'] : ['#FFF7ED', '#FDF2F8']}
                    style={styles.aiInviteHero}
                >
                    <View style={styles.aiInviteHeroIcon}>
                        <Ionicons name="sparkles" size={22} color="#FFF" />
                    </View>
                    <Text style={[styles.aiInviteHeroTitle, { color: theme.text }]}>Chat to create your invite</Text>
                    <Text style={[styles.aiInviteHeroText, { color: theme.textLight }]}>
                        Enter your event details, then describe the look in the chat box. Generate wording with AI if you like, then create the image.
                    </Text>
                </LinearGradient>

                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Occasion</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {EINVITE_OCCASIONS.map((occasion) => (
                        <TouchableOpacity
                            key={occasion}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteOccasion === occasion && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteOccasion(occasion)}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: inviteOccasion === occasion ? colors.primary : theme.text }}>
                                {occasion}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Output type</Text>
                <View style={styles.inviteTypeRow}>
                    {[
                        { key: 'image', label: 'Image', icon: 'image-outline' },
                        { key: 'animated', label: 'Animated video', icon: 'film-outline' },
                    ].map((type) => (
                        <TouchableOpacity
                            key={type.key}
                            style={[
                                styles.inviteTypeBtn,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteMediaType === type.key && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteMediaType(type.key)}
                        >
                            <Ionicons name={type.icon} size={17} color={inviteMediaType === type.key ? colors.primary : theme.textLight} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: inviteMediaType === type.key ? colors.primary : theme.text, fontWeight: '700' }}>
                                    {type.label}
                                </Text>
                                <Text style={{ color: theme.textLight, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                                    {type.key === 'animated' ? `₹${eInvitePricing.animated_inr}` : `₹${eInvitePricing.static_inr}`} · pay after generate
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {inviteMediaType === 'animated' ? (
                    <>
                        <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Character photos (optional)</Text>
                        <Text style={[styles.eInviteCharacterHint, { color: theme.textLight }]}>
                            Add bride, groom, or main character photos for OpenRouter AI video. Without photos, a frame-based animation is used.
                        </Text>
                        <View style={styles.inviteCharacterRow}>
                            {[
                                { key: 'bride', label: 'Bride', uri: inviteBrideImage, set: setInviteBrideImage },
                                { key: 'groom', label: 'Groom', uri: inviteGroomImage, set: setInviteGroomImage },
                                { key: 'main', label: 'Main character', uri: inviteMainCharacterImage, set: setInviteMainCharacterImage },
                            ].map((slot) => (
                                <View key={slot.key} style={styles.inviteCharacterSlot}>
                                    <TouchableOpacity
                                        style={[styles.inviteCharacterBtn, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}
                                        onPress={async () => {
                                            const picked = await pickInviteCharacterPhoto(showToast);
                                            if (picked) slot.set(picked);
                                        }}
                                    >
                                        {slot.uri ? (
                                            <Image source={{ uri: slot.uri }} style={styles.inviteCharacterThumb} resizeMode="cover" />
                                        ) : (
                                            <Ionicons name="person-add-outline" size={22} color={theme.textLight} />
                                        )}
                                    </TouchableOpacity>
                                    <Text style={[styles.inviteCharacterLabel, { color: theme.text }]}>{slot.label}</Text>
                                    {slot.uri ? (
                                        <TouchableOpacity onPress={() => slot.set(null)}>
                                            <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>Remove</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    </>
                ) : null}

                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Invitation details</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder={t('invite_event_name_ph')}
                    placeholderTextColor={theme.textLight}
                    value={inviteForm.eventName}
                    onChangeText={(txt) => setInviteForm((p) => ({ ...p, eventName: txt }))}
                />
                <View style={styles.inviteRow}>
                    <TouchableOpacity
                        style={[styles.input, styles.halfInput, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                        onPress={() => setShowInviteDatePicker(true)}
                    >
                        <Ionicons name="calendar-outline" size={18} color={theme.textLight} />
                        <Text style={{ color: theme.text, flex: 1, fontSize: 15 }}>{formatInviteDate(inviteDateValue)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.input, styles.halfInput, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                        onPress={() => setShowInviteTimePicker(true)}
                    >
                        <Ionicons name="time-outline" size={18} color={theme.textLight} />
                        <Text style={{ color: theme.text, flex: 1, fontSize: 15 }}>{formatInviteTime(inviteTimeValue)}</Text>
                    </TouchableOpacity>
                </View>
                {showInviteDatePicker ? (
                    <DateTimePicker
                        value={inviteDateValue}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(e, d) => {
                            setShowInviteDatePicker(false);
                            if (d) setInviteDateValue(d);
                        }}
                    />
                ) : null}
                {showInviteTimePicker ? (
                    <DateTimePicker
                        value={inviteTimeValue}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(e, d) => {
                            setShowInviteTimePicker(false);
                            if (d) setInviteTimeValue(d);
                        }}
                    />
                ) : null}

                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>{t('invite_color_label')}</Text>
                <View style={styles.chipRow}>
                    {COLOR_KEYS.map((c) => (
                        <TouchableOpacity
                            key={c}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteColorTheme === c && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteColorTheme(c)}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: inviteColorTheme === c ? colors.primary : theme.text }}>{c}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>{t('invite_variation_label')}</Text>
                <View style={styles.chipRow}>
                    {VARIATION_KEYS.map((v) => (
                        <TouchableOpacity
                            key={v}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteVariation === v && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteVariation(v)}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: inviteVariation === v ? colors.primary : theme.text }}>{v}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Typography style</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {INVITE_FONT_CHOICES.map((f) => (
                        <TouchableOpacity
                            key={f.id}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteFontStyle === f.id && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteFontStyle(f.id)}
                        >
                            <Text
                                style={{ fontSize: 11, fontWeight: '700', color: inviteFontStyle === f.id ? colors.primary : theme.text }}
                                numberOfLines={2}
                            >
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Sticker & motif accents</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {INVITE_STICKER_CHOICES.map((s) => (
                        <TouchableOpacity
                            key={s.id}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteStickerPack === s.id && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => setInviteStickerPack(s.id)}
                        >
                            <Text
                                style={{ fontSize: 11, fontWeight: '700', color: inviteStickerPack === s.id ? colors.primary : theme.text }}
                                numberOfLines={2}
                            >
                                {s.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder={t('invite_venue_name')}
                    placeholderTextColor={theme.textLight}
                    value={inviteForm.venueName}
                    onChangeText={(txt) => setInviteForm((p) => ({ ...p, venueName: txt }))}
                />
                <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder={t('invite_venue_address')}
                    placeholderTextColor={theme.textLight}
                    value={inviteForm.venueAddress}
                    onChangeText={(txt) => setInviteForm((p) => ({ ...p, venueAddress: txt }))}
                />
                <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder={t('invite_hosts_ph')}
                    placeholderTextColor={theme.textLight}
                    value={inviteForm.hostNames}
                    onChangeText={(txt) => setInviteForm((p) => ({ ...p, hostNames: txt }))}
                />
                <Text style={[styles.chipsLabel, { color: theme.textLight }]}>Invitation text language</Text>
                <View style={styles.chipRow}>
                    {INVITE_LANGS.map((lang) => (
                        <TouchableOpacity
                            key={lang.key}
                            style={[
                                styles.chip,
                                { borderColor: theme.border, backgroundColor: theme.inputBackground },
                                inviteTextLanguage === lang.key && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                            ]}
                            onPress={() => {
                                setInviteTextLanguage(lang.key);
                                setInviteForm((p) => ({ ...p, message: inviteTexts[lang.key] || '' }));
                            }}
                        >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: inviteTextLanguage === lang.key ? colors.primary : theme.text }}>
                                {lang.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TextInput
                    style={[styles.input, styles.multilineInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder={`Invitation text (${INVITE_LANGS.find((x) => x.key === inviteTextLanguage)?.label || 'Language'})`}
                    placeholderTextColor={theme.textLight}
                    value={inviteTexts[inviteTextLanguage] || ''}
                    onChangeText={(txt) => updateInviteTextByLanguage(inviteTextLanguage, txt)}
                    multiline
                    numberOfLines={3}
                />

                <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '50' }]}
                    onPress={runGenerateInviteText}
                    disabled={inviteAiLoadingText}
                >
                    {inviteAiLoadingText ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="sparkles" size={18} color={colors.primary} />}
                    <Text style={[styles.aiBtnText, { color: colors.primary }]}>Generate invite text with AI</Text>
                </TouchableOpacity>

                <View style={styles.inviteChatBox}>
                    {inviteChat.slice(-4).map((msg) => (
                        <View
                            key={msg.id}
                            style={[
                                styles.inviteChatBubble,
                                msg.sender === 'user' ? styles.inviteChatUser : styles.inviteChatBot,
                                { backgroundColor: msg.sender === 'user' ? colors.primary : theme.inputBackground },
                            ]}
                        >
                            <Text style={{ color: msg.sender === 'user' ? '#FFF' : theme.text, fontSize: 13, lineHeight: 19 }}>{msg.text}</Text>
                        </View>
                    ))}
                </View>

                <TextInput
                    style={[styles.input, styles.multilineInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="Colours, motifs, layout, art style (e.g. maroon gold mandap, jasmine, soft lights)…"
                    placeholderTextColor={theme.textLight}
                    value={invitePrompt}
                    onChangeText={setInvitePrompt}
                    multiline
                    numberOfLines={4}
                />
                {activeInviteMessage ? (
                    <View style={[styles.eInviteGenerationMeta, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                        <Text style={[styles.eInviteGenerationText, { color: theme.text }]}>Selected invitation text ({inviteTextLanguage.toUpperCase()})</Text>
                        <Text style={[styles.eInviteGenerationSub, { color: theme.textLight }]} numberOfLines={3}>
                            {activeInviteMessage}
                        </Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={[styles.aiInviteGenerateBtn, { backgroundColor: colors.primary }]}
                    onPress={runGenerateInviteMedia}
                    disabled={
                        inviteGeneratingImage ||
                        (generatedInvite?.media_url && invitePrompt.trim()
                            ? designRedesignMeta.remaining <= 0
                            : inviteIterationMeta.remaining <= 0)
                    }
                >
                    {inviteGeneratingImage ? <ActivityIndicator color="#FFF" /> : <Ionicons name="color-wand-outline" size={20} color="#FFF" />}
                    <Text style={styles.aiInviteGenerateText}>
                        {inviteGeneratingImage
                            ? 'Generating invite…'
                            : generatedInvite?.media_url && invitePrompt.trim()
                              ? designRedesignMeta.remaining <= 0
                                  ? 'Redesign limit reached'
                                  : 'Refine design with chat'
                              : inviteIterationMeta.remaining <= 0
                                ? 'Iteration limit reached'
                                : `Generate ${inviteMediaType === 'animated' ? 'animated invite' : 'invite image'}`}
                    </Text>
                </TouchableOpacity>
                {inviteGeneratingImage ? (
                    <View style={[styles.eInviteGenerationMeta, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                        <Text style={[styles.eInviteGenerationText, { color: theme.text }]}>
                            {generationStageText}
                        </Text>
                        <Text style={[styles.eInviteGenerationSub, { color: theme.textLight }]}>
                            Streaming status · Elapsed {inviteGenElapsedSec}s · ETA ~{Math.max(0, generationEstimateSec - inviteGenElapsedSec)}s
                        </Text>
                    </View>
                ) : null}
            </View>

            {generatedInvite?.media_url ? (
                <View style={[styles.generatedInviteCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.generatedInviteHeader}>
                        <View>
                            <Text style={[styles.previewLabel, { color: theme.textLight }]}>Generated design</Text>
                            <Text style={[styles.generatedInviteTitle, { color: theme.text }]}>
                                {generatedInvite.occasion} · {generatedInvite.mediaType === 'animated' ? 'Animated' : 'Image'}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.generatedInviteEditBtn} onPress={() => setShowInviteDesigner(true)}>
                            <Ionicons name="create-outline" size={16} color={colors.primary} />
                            <Text style={[styles.generatedInviteEditText, { color: colors.primary }]}>Edit text</Text>
                        </TouchableOpacity>
                    </View>
                    <EInviteMediaPreview
                        uri={generatedInvite.media_url}
                        outputMime={generatedInvite.output_mime}
                        style={styles.generatedInviteImage}
                        resizeMode="cover"
                    />
                    {(generatedInvite.api_cost_usd != null || lastGenerationApiCostUsd != null) ? (
                        <Text style={[styles.eInviteApiCostText, { color: theme.textLight }]}>
                            OpenRouter API cost: $
                            {Number(generatedInvite.api_cost_usd ?? lastGenerationApiCostUsd).toFixed(4)} USD
                        </Text>
                    ) : null}
                    {eInvitePaid ? (
                        <View style={styles.shareActions}>
                            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.primary }]} onPress={shareInvitation}>
                                <Ionicons name="share-social-outline" size={18} color="#FFF" />
                                <Text style={styles.shareBtnText}>Share</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.shareBtnOutline, { borderColor: '#25D366' }]} onPress={openGeneratedInvite}>
                                <Ionicons name="download-outline" size={18} color="#25D366" />
                                <Text style={[styles.shareBtnOutlineText, { color: '#25D366' }]}>Download</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.shareActions}>
                            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.primary }]} onPress={goToCartAndCheckoutForEInvite}>
                                <Ionicons name="cart-outline" size={18} color="#FFF" />
                                <Text style={styles.shareBtnText}>Go to Cart & Checkout</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            ) : null}

            {savedInvites.length > 0 ? (
                <View style={[styles.savedInviteStrip, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.savedInviteTitle, { color: theme.text }]}>Saved invites</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedInviteRow}>
                        {savedInvites.map((it) => (
                            <View key={it.id} style={styles.savedInviteThumbOuter}>
                                <TouchableOpacity
                                    style={[styles.savedInviteThumbWrap, { borderColor: theme.border }]}
                                    onPress={() => {
                                        setGeneratedInvite(it);
                                        const nextTexts = it.texts && typeof it.texts === 'object'
                                            ? {
                                                en: String(it.texts.en || ''),
                                                hi: String(it.texts.hi || ''),
                                                or: String(it.texts.or || ''),
                                            }
                                            : null;
                                        if (nextTexts) {
                                            setInviteTexts(nextTexts);
                                            setInviteTextLanguage('en');
                                        }
                                        setInviteForm((p) => ({
                                            ...p,
                                            eventName: it.eventName || p.eventName,
                                            message: nextTexts?.en || it.message || p.message,
                                            hostNames: it.hostNames || p.hostNames,
                                        }));
                                        setInviteOccasion(it.occasion || inviteOccasion);
                                        setInviteMediaType(it.mediaType || inviteMediaType);
                                        setCurrentUserEInviteId(it.user_e_invite_id || it.id || null);
                                        setEInvitePaid(String(it.payment_status || '') === 'paid');
                                    }}
                                >
                                    <EInviteMediaPreview
                                        uri={it.media_url}
                                        outputMime={it.output_mime}
                                        style={styles.savedInviteThumb}
                                        resizeMode="cover"
                                    />
                                    <Text style={[styles.savedInviteName, { color: theme.text }]} numberOfLines={1}>{it.eventName || it.occasion}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.savedInviteDeleteBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                                    onPress={() => confirmDeleteSavedInvite(it)}
                                    accessibilityLabel="Delete saved invite"
                                >
                                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            ) : null}

            {/* Text-only invite preview removed: image invite output is now the primary preview. */}

            {eInvitePaid ? (
                <>
                    <View style={styles.shareActions}>
                        <TouchableOpacity
                            style={[styles.shareBtn, { backgroundColor: colors.primary }]}
                            onPress={shareInvitation}
                        >
                            <Ionicons name="share-outline" size={20} color="#FFF" />
                            <Text style={styles.shareBtnText}>{t('invite_share')}</Text>
                        </TouchableOpacity>
                        {guests.length > 0 && inviteForm.eventName.trim() ? (
                            <TouchableOpacity
                                style={[styles.shareBtnOutline, { borderColor: colors.primary }]}
                                onPress={() => {
                                    showConfirm({
                                        title: t('invite_send_all'),
                                        message: `Share personalized invitations with ${guests.length} guest${guests.length !== 1 ? 's' : ''}?`,
                                        cancelLabel: 'Cancel',
                                        confirmLabel: 'Share',
                                        onConfirm: () => shareInvitation(),
                                    });
                                }}
                            >
                                <Ionicons name="people-outline" size={20} color={colors.primary} />
                                <Text style={[styles.shareBtnOutlineText, { color: colors.primary }]}>{t('invite_send_all')} ({guests.length})</Text>
                            </TouchableOpacity>
                        ) : null}
                        {guestsWithPhoneList.length > 0 && inviteForm.eventName.trim() ? (
                            <TouchableOpacity
                                style={[styles.shareBtnOutline, { borderColor: '#25D366' }]}
                                onPress={startWhatsappBatches}
                            >
                                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                                <Text style={[styles.shareBtnOutlineText, { color: '#25D366' }]}>
                                    {t('invite_whatsapp_batches')} ({guestsWithPhoneList.length})
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {guests.length > 0 && inviteForm.eventName.trim() ? (
                        <View style={[styles.guestShareList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.guestShareTitle, { color: theme.text }]}>Send to Individual Guest</Text>
                            {guests.map(g => (
                                <TouchableOpacity
                                    key={g.id}
                                    style={[styles.guestShareRow, { borderBottomColor: theme.border }]}
                                    onPress={() => shareToSpecificGuest(g)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.guestShareName, { color: theme.text }]}>{g.name}</Text>
                                        {g.phone ? <Text style={[styles.guestSharePhone, { color: theme.textLight }]}>{g.phone}</Text> : null}
                                    </View>
                                    <Ionicons name="send-outline" size={18} color={colors.primary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}
                </>
            ) : null}

            <View style={[styles.eInviteFaqCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.eInviteFaqTitle, { color: theme.text }]}>Frequently asked question.</Text>
                {visibleFaqs.map((faq, idx) => {
                    const expanded = openFaqId === faq.id;
                    return (
                        <View
                            key={faq.id || `faq-${idx}`}
                            style={[
                                styles.eInviteFaqItem,
                                idx < visibleFaqs.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 },
                            ]}
                        >
                            <TouchableOpacity
                                style={styles.eInviteFaqQuestionRow}
                                onPress={() => setOpenFaqId((prev) => (prev === faq.id ? null : faq.id))}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.eInviteFaqQuestion, { color: theme.text }]}>{faq.question}</Text>
                                <Ionicons
                                    name={expanded ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color={theme.textLight}
                                />
                            </TouchableOpacity>
                            {expanded ? (
                                <Text style={[styles.eInviteFaqAnswer, { color: theme.textLight }]}>{faq.answer}</Text>
                            ) : null}
                        </View>
                    );
                })}
            </View>

            <View style={{ height: 40 }} />
        </ScrollView>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{t('guest_manager_title')}</Text>
                <View style={{ width: 96 }} />
            </View>

            <View style={styles.statsRow}>
                <View style={[styles.statBox, { backgroundColor: colors.primary + '12' }]}>
                    <Text style={[styles.statNum, { color: colors.primary }]}>{guests.length}</Text>
                    <Text style={[styles.statLabel, { color: theme.textLight }]}>{t('guest_stat_guests')}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#22C55E18' }]}>
                    <Text style={[styles.statNum, { color: '#22C55E' }]}>{guests.filter(g => g.rsvp === 'confirmed').length}</Text>
                    <Text style={[styles.statLabel, { color: theme.textLight }]}>{t('guest_stat_confirmed')}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#F59E0B18' }]}>
                    <Text style={[styles.statNum, { color: '#F59E0B' }]}>{gifts.length}</Text>
                    <Text style={[styles.statLabel, { color: theme.textLight }]}>{t('guest_stat_gifts')}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#8B5CF618' }]}>
                    <Text style={[styles.statNum, { color: '#8B5CF6' }]}>₹{totalGiftAmount.toLocaleString()}</Text>
                    <Text style={[styles.statLabel, { color: theme.textLight }]}>{t('guest_stat_cash')}</Text>
                </View>
            </View>

            <View style={styles.tabRow}>
                {TABS_LIST.map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                        onPress={() => { setActiveTab(tab); setSearchQuery(''); }}
                    >
                        <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : theme.textLight }]}>
                            {tab === 'Guests' ? t('guest_tab_guests') : tab === 'Gifts' ? t('guest_tab_gifts') : t('guest_tab_invite')}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {activeTab !== 'Invite' && (
                <View style={[styles.searchRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                    <Ionicons name="search-outline" size={18} color={theme.textLight} />
                    <TextInput
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder={activeTab === 'Guests' ? t('guest_search_guests') : t('guest_search_gifts')}
                        placeholderTextColor={theme.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            )}

            {dataLoading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: theme.textLight }]}>{t('invite_loading_guests')}</Text>
                </View>
            ) : !isAuthenticated ? (
                <View style={styles.emptyWrap}>
                    <Ionicons name="lock-closed-outline" size={48} color={theme.textLight} />
                    <Text style={[styles.emptyText, { color: theme.textLight }]}>{t('invite_login_required')}</Text>
                    <Text style={[styles.emptyHint, { color: theme.textLight }]}>{t('invite_login_hint')}</Text>
                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 16, paddingHorizontal: 32 }]}
                        onPress={() => navigation.navigate('Login')}
                    >
                        <Text style={styles.saveBtnText}>Login</Text>
                    </TouchableOpacity>
                </View>
            ) : activeTab === 'Guests' ? (
                <View style={{ flex: 1 }}>
                    <View style={styles.importRow}>
                        <TouchableOpacity
                            style={[styles.importBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}
                            onPress={loadPhoneContacts}
                            disabled={contactsLoading}
                        >
                            {contactsLoading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
                            )}
                            <Text style={[styles.importBtnText, { color: colors.primary }]}>Import Contacts</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.importBtn, { backgroundColor: '#25D366' + '12', borderColor: '#25D366' + '30' }]}
                            onPress={() => {
                                showConfirm({
                                    title: 'Import from WhatsApp',
                                    message:
                                        'To import WhatsApp group members:\n\n1. Open the WhatsApp group\n2. Tap group name → Members\n3. Long-press each contact → Add to Phone Contacts\n4. Then use "Import Contacts" here\n\nAlternatively, you can manually add guests using the + button.',
                                    cancelLabel: 'OK',
                                    confirmLabel: 'Import Contacts',
                                    onConfirm: () => loadPhoneContacts(),
                                });
                            }}
                        >
                            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                            <Text style={[styles.importBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={filteredGuests}
                        renderItem={renderGuest}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyWrap}>
                                <Ionicons name="people-outline" size={48} color={theme.textLight} />
                                <Text style={[styles.emptyText, { color: theme.textLight }]}>No guests added yet</Text>
                                <Text style={[styles.emptyHint, { color: theme.textLight }]}>Tap + to add or import contacts</Text>
                            </View>
                        }
                    />
                </View>
            ) : activeTab === 'Gifts' ? (
                <FlatList
                    data={filteredGifts}
                    renderItem={renderGift}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <Ionicons name="gift-outline" size={48} color={theme.textLight} />
                            <Text style={[styles.emptyText, { color: theme.textLight }]}>No gifts recorded yet</Text>
                            <Text style={[styles.emptyHint, { color: theme.textLight }]}>Tap + to record a gift</Text>
                        </View>
                    }
                />
            ) : (
                renderInviteTab()
            )}

            {/* Add Guest Modal */}
            <Modal visible={showAddGuest} animationType="slide" transparent>
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowAddGuest(false)} activeOpacity={1}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalHandle} />
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Add Guest</Text>
                        <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Name *" placeholderTextColor={theme.textLight} value={guestForm.name} onChangeText={t => setGuestForm(p => ({ ...p, name: t }))} maxLength={GUEST_LIMITS.name} />
                        <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Phone" placeholderTextColor={theme.textLight} value={guestForm.phone} onChangeText={t => setGuestForm(p => ({ ...p, phone: t }))} keyboardType="phone-pad" maxLength={GUEST_LIMITS.phone} />
                        <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Relation (e.g. Uncle, Friend)" placeholderTextColor={theme.textLight} value={guestForm.relation} onChangeText={t => setGuestForm(p => ({ ...p, relation: t }))} maxLength={GUEST_LIMITS.relation} />
                        <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Group (e.g. Family, Office)" placeholderTextColor={theme.textLight} value={guestForm.group} onChangeText={t => setGuestForm(p => ({ ...p, group: t }))} maxLength={GUEST_LIMITS.group} />
                        <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Notes" placeholderTextColor={theme.textLight} value={guestForm.notes} onChangeText={t => setGuestForm(p => ({ ...p, notes: t }))} maxLength={GUEST_LIMITS.notes} />
                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={addGuest}>
                            <Text style={styles.saveBtnText}>Add Guest</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Add Gift Modal — with guest dropdown */}
            <Modal visible={showAddGift} animationType="slide" transparent>
                <TouchableOpacity style={styles.modalOverlay} onPress={() => { setShowAddGift(false); setGuestDropdownOpen(false); }} activeOpacity={1}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalHandle} />
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Record Gift</Text>

                        {guests.length === 0 ? (
                            <View style={[styles.noGuestsBox, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                                <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
                                <Text style={{ color: '#92710C', fontSize: 13, flex: 1, marginLeft: 8 }}>
                                    Add guests first before recording gifts.
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <Text style={[styles.dropdownLabel, { color: theme.textLight }]}>Select Guest *</Text>
                                <TouchableOpacity
                                    style={[styles.dropdownTrigger, { backgroundColor: theme.inputBackground, borderColor: guestDropdownOpen ? colors.primary : theme.border }]}
                                    onPress={() => setGuestDropdownOpen(!guestDropdownOpen)}
                                >
                                    <Text style={[styles.dropdownTriggerText, { color: selectedGiftGuest ? theme.text : theme.textLight }]}>
                                        {selectedGiftGuest ? selectedGiftGuest.name : 'Choose a guest...'}
                                    </Text>
                                    <Ionicons name={guestDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textLight} />
                                </TouchableOpacity>

                                {guestDropdownOpen && (
                                    <View style={[styles.dropdownList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        <View style={[styles.dropdownSearchRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                                            <Ionicons name="search-outline" size={14} color={theme.textLight} />
                                            <TextInput
                                                style={[styles.dropdownSearchInput, { color: theme.text }]}
                                                placeholder="Search guests..."
                                                placeholderTextColor={theme.textLight}
                                                value={guestDropdownSearch}
                                                onChangeText={setGuestDropdownSearch}
                                                autoFocus
                                            />
                                        </View>
                                        <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                                            {dropdownGuests.length === 0 ? (
                                                <Text style={[styles.dropdownEmpty, { color: theme.textLight }]}>No guests found</Text>
                                            ) : (
                                                dropdownGuests.map(g => (
                                                    <TouchableOpacity
                                                        key={g.id}
                                                        style={[
                                                            styles.dropdownItem,
                                                            { borderBottomColor: theme.border },
                                                            giftForm.guest_id === g.id && { backgroundColor: colors.primary + '10' },
                                                        ]}
                                                        onPress={() => {
                                                            setGiftForm(p => ({ ...p, guest_id: g.id }));
                                                            setGuestDropdownOpen(false);
                                                            setGuestDropdownSearch('');
                                                        }}
                                                    >
                                                        <Text style={[styles.dropdownItemName, { color: theme.text }]}>{g.name}</Text>
                                                        {g.phone ? <Text style={[styles.dropdownItemPhone, { color: theme.textLight }]}>{g.phone}</Text> : null}
                                                        {giftForm.guest_id === g.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </ScrollView>
                                    </View>
                                )}

                                <View style={styles.typeRow}>
                                    {['cash', 'gift'].map(type => (
                                        <TouchableOpacity
                                            key={type}
                                            style={[styles.typeBtn, { borderColor: theme.border }, giftForm.type === type && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
                                            onPress={() => setGiftForm(p => ({ ...p, type }))}
                                        >
                                            <Ionicons name={type === 'cash' ? 'cash-outline' : 'gift-outline'} size={18} color={giftForm.type === type ? colors.primary : theme.textLight} />
                                            <Text style={[styles.typeText, { color: giftForm.type === type ? colors.primary : theme.text }]}>{type === 'cash' ? 'Cash' : 'Gift Item'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {giftForm.type === 'cash' ? (
                                    <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Amount (₹)" placeholderTextColor={theme.textLight} value={giftForm.amount} onChangeText={t => setGiftForm(p => ({ ...p, amount: t }))} keyboardType="numeric" />
                                ) : (
                                    <TextInput style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]} placeholder="Gift description" placeholderTextColor={theme.textLight} value={giftForm.description} onChangeText={t => setGiftForm(p => ({ ...p, description: t }))} />
                                )}
                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={addGift}>
                                    <Text style={styles.saveBtnText}>Save Gift</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Import Contacts Modal */}
            <Modal visible={showImportContacts} animationType="slide" transparent>
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowImportContacts(false)} activeOpacity={1}>
                    <View style={[styles.modalContent, styles.modalTall, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalHandle} />
                        <View style={styles.importHeader}>
                            <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>Import Contacts</Text>
                            <Text style={[styles.importCount, { color: theme.textLight }]}>{selectedContacts.size} selected</Text>
                        </View>
                        <View style={[styles.dropdownSearchRow, { backgroundColor: theme.inputBackground, borderColor: theme.border, marginBottom: 10 }]}>
                            <Ionicons name="search-outline" size={16} color={theme.textLight} />
                            <TextInput
                                style={[styles.dropdownSearchInput, { color: theme.text }]}
                                placeholder="Search contacts..."
                                placeholderTextColor={theme.textLight}
                                value={contactSearch}
                                onChangeText={setContactSearch}
                            />
                        </View>
                        <TouchableOpacity
                            style={styles.selectAllBtn}
                            onPress={() => {
                                if (selectedContacts.size === filteredPhoneContacts.length) {
                                    setSelectedContacts(new Set());
                                } else {
                                    setSelectedContacts(new Set(filteredPhoneContacts.map(c => c.id)));
                                }
                            }}
                        >
                            <Ionicons
                                name={selectedContacts.size === filteredPhoneContacts.length && filteredPhoneContacts.length > 0 ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={colors.primary}
                            />
                            <Text style={[styles.selectAllText, { color: colors.primary }]}>
                                {selectedContacts.size === filteredPhoneContacts.length && filteredPhoneContacts.length > 0 ? 'Deselect All' : 'Select All'}
                            </Text>
                        </TouchableOpacity>
                        <FlatList
                            data={filteredPhoneContacts}
                            keyExtractor={item => item.id}
                            style={{ flex: 1 }}
                            renderItem={({ item }) => {
                                const sel = selectedContacts.has(item.id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.contactItem, { borderBottomColor: theme.border }, sel && { backgroundColor: colors.primary + '08' }]}
                                        onPress={() => toggleContactSelection(item.id)}
                                    >
                                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? colors.primary : theme.textLight} />
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.contactName, { color: theme.text }]}>{item.name}</Text>
                                            {item.phone ? <Text style={[styles.contactPhone, { color: theme.textLight }]}>{item.phone}</Text> : null}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <Text style={[styles.dropdownEmpty, { color: theme.textLight }]}>No contacts found</Text>
                            }
                        />
                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }, selectedContacts.size === 0 && { opacity: 0.5 }]}
                            onPress={importSelectedContacts}
                            disabled={selectedContacts.size === 0}
                        >
                            <Text style={styles.saveBtnText}>Import {selectedContacts.size} Contact{selectedContacts.size !== 1 ? 's' : ''}</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={waModalVisible} animationType="slide" transparent>
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setWaModalVisible(false)} activeOpacity={1}>
                    <View style={[styles.modalContent, styles.modalTall, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalHandle} />
                        <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 8 }]}>
                            {t('invite_wa_batch_title')} ({waChunkIdx + 1}/{Math.max(waChunks.length, 1)})
                        </Text>
                        <Text style={[styles.waHint, { color: theme.textLight }]}>
                            {t('invite_wa_open')} — max 5 guests per batch
                        </Text>
                        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                            {(waChunks[waChunkIdx] || []).map(g => {
                                const digits = sanitizePhoneForWa(g.phone);
                                return (
                                    <TouchableOpacity
                                        key={g.id}
                                        style={[styles.waRow, { borderBottomColor: theme.border }]}
                                        onPress={() => {
                                            const msg = `Dear ${g.name},\n\n${buildInvitationText()}`;
                                            if (digits) openWhatsAppToNumber(digits, msg);
                                            else showToast({
                                                variant: 'info',
                                                title: 'No number',
                                                message: 'This guest has no valid phone number.',
                                            });
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.waName, { color: theme.text }]}>{g.name}</Text>
                                            {g.phone ? <Text style={[styles.waPhone, { color: theme.textLight }]}>{g.phone}</Text> : null}
                                        </View>
                                        <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <View style={styles.waFooter}>
                            <TouchableOpacity style={[styles.waSecondary, { borderColor: theme.border }]} onPress={() => setWaModalVisible(false)}>
                                <Text style={{ color: theme.text, fontWeight: '600' }}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: '#25D366', flex: 1, marginTop: 0 }]}
                                onPress={() => {
                                    if (waChunkIdx < waChunks.length - 1) setWaChunkIdx(waChunkIdx + 1);
                                    else setWaModalVisible(false);
                                }}
                            >
                                <Text style={styles.saveBtnText}>
                                    {waChunkIdx < waChunks.length - 1 ? t('invite_wa_next_batch') : t('invite_wa_done')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={showInviteDesigner} animationType="slide" transparent>
                <View style={[styles.fullEditorRoot, { backgroundColor: '#0B1020' }]}>
                    <View style={styles.fullEditorCanvas}>
                        {generatedInvite?.media_url ? (
                            <EInviteMediaPreview
                                uri={generatedInvite.media_url}
                                outputMime={generatedInvite.output_mime}
                                style={styles.fullEditorBgMedia}
                                resizeMode="cover"
                            />
                        ) : (
                            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.fullEditorBgMedia} />
                        )}
                        <View style={styles.fullEditorShade} />
                        <View style={styles.fullEditorHeader}>
                            <TouchableOpacity
                                style={styles.fullEditorIconBtn}
                                onPress={() => setShowInviteDesigner(false)}
                            >
                                <Ionicons name="chevron-back" size={22} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.fullEditorTitle} numberOfLines={1}>
                                {generatedInvite?.eventName || inviteForm.eventName || 'Invite editor'}
                            </Text>
                            <TouchableOpacity
                                style={styles.fullEditorIconBtn}
                                onPress={saveGeneratedInvite}
                            >
                                <Ionicons name="bookmark-outline" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.fullEditorPreviewTextWrap}>
                            <Text style={styles.fullEditorPreviewEvent}>{inviteForm.eventName || 'Your Event Name'}</Text>
                            <Text style={styles.fullEditorPreviewMsg} numberOfLines={5}>
                                {inviteForm.message || 'Your invitation message appears here. Edit below.'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.fullEditorPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder={t('invite_event_name_ph')}
                            placeholderTextColor={theme.textLight}
                            value={inviteForm.eventName}
                            onChangeText={(txt) => setInviteForm((p) => ({ ...p, eventName: txt }))}
                        />
                        <TextInput
                            style={[styles.input, styles.multilineInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder={`Invitation text (${INVITE_LANGS.find((x) => x.key === inviteTextLanguage)?.label || 'Language'})`}
                            placeholderTextColor={theme.textLight}
                            value={inviteTexts[inviteTextLanguage] || inviteForm.message}
                            onChangeText={(txt) => updateInviteTextByLanguage(inviteTextLanguage, txt)}
                            multiline
                            numberOfLines={3}
                        />
                        <View style={styles.fullEditorActions}>
                            <TouchableOpacity
                                style={[styles.fullEditorAiBtn, { borderColor: colors.primary }]}
                                onPress={runGenerateInviteText}
                                disabled={inviteAiLoadingText}
                            >
                                {inviteAiLoadingText ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                                )}
                                <Text style={[styles.fullEditorAiBtnText, { color: colors.primary }]}>AI text</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.fullEditorApplyBtn, { backgroundColor: colors.primary }]}
                                onPress={() => {
                                    setShowInviteDesigner(false);
                                    showToast({
                                        variant: 'success',
                                        title: 'Invite updated',
                                        message: 'Your wording changes are applied.',
                                    });
                                }}
                            >
                                <Text style={styles.fullEditorApplyBtnText}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <BottomTabBar navigation={navigation} activeRoute="Home" />

            {activeTab !== 'Invite' && (
                <TouchableOpacity
                    style={[
                        styles.fab,
                        {
                            bottom:
                                64 +
                                Math.max(insets.bottom, 6) +
                                12,
                            zIndex: 100,
                            ...(Platform.OS === 'android' ? { elevation: 16 } : {}),
                        },
                    ]}
                    onPress={() => activeTab === 'Guests' ? setShowAddGuest(true) : setShowAddGift(true)}
                >
                    <LinearGradient colors={[colors.primary, '#FFA040']} style={styles.fabGradient}>
                        <Ionicons name="add" size={28} color="#FFF" />
                    </LinearGradient>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
    statBox: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
    statNum: { fontSize: 16, fontWeight: '800' },
    statLabel: { fontSize: 10, marginTop: 2 },
    tabRow: { flexDirection: 'row', paddingHorizontal: 16 },
    tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabText: { fontSize: 15, fontWeight: '600' },
    searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, gap: 8 },
    searchInput: { flex: 1, height: 40, fontSize: 14 },
    importRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 6 },
    importBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
    importBtnText: { fontSize: 12, fontWeight: '600' },
    listContent: { paddingHorizontal: 16, paddingBottom: 100 },
    listCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8, gap: 10 },
    listName: { fontSize: 15, fontWeight: '600' },
    listMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    listTag: { fontSize: 12 },
    rsvpBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    rsvpText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    giftTypeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    deleteBtn: { padding: 6 },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14 },
    emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 16, fontWeight: '600' },
    emptyHint: { fontSize: 13 },
    fab: { position: 'absolute', right: 20, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
    fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12, maxHeight: '80%' },
    modalTall: { maxHeight: '90%', flex: 1, marginTop: '10%' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CCC', alignSelf: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15 },
    multilineInput: { minHeight: 72, textAlignVertical: 'top' },
    halfInput: { flex: 1 },
    typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12 },
    typeText: { fontSize: 14, fontWeight: '600' },
    saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    noGuestsBox: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
    dropdownLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    dropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dropdownTriggerText: { fontSize: 15 },
    dropdownList: { borderWidth: 1, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
    dropdownSearchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, gap: 6 },
    dropdownSearchInput: { flex: 1, height: 36, fontSize: 13 },
    dropdownScroll: { maxHeight: 180 },
    dropdownEmpty: { textAlign: 'center', paddingVertical: 16, fontSize: 13 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
    dropdownItemName: { flex: 1, fontSize: 14, fontWeight: '500' },
    dropdownItemPhone: { fontSize: 12, marginRight: 8 },
    importHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    importCount: { fontSize: 13 },
    selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    selectAllText: { fontSize: 13, fontWeight: '600' },
    contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1 },
    contactName: { fontSize: 14, fontWeight: '500' },
    contactPhone: { fontSize: 12, marginTop: 2 },
    inviteScroll: { padding: 16, paddingBottom: 40 },
    eInviteShell: {
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 12,
        marginBottom: 14,
    },
    eInviteTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    eInviteTitle: { fontSize: 22, fontWeight: '800' },
    eInviteYourCardsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(148,163,184,0.15)',
    },
    eInviteYourCardsText: { fontSize: 11, fontWeight: '600' },
    eInvitePricingBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 12,
    },
    eInvitePricingTitle: { fontSize: 14, fontWeight: '800' },
    eInvitePricingSub: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
    aiInviteStudio: { borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 14 },
    aiInviteHero: { borderRadius: 16, padding: 14, marginBottom: 14, overflow: 'hidden' },
    aiInviteHeroIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        marginBottom: 10,
    },
    aiInviteHeroTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    aiInviteHeroText: { fontSize: 13, lineHeight: 19 },
    inviteTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    inviteTypeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 7,
        borderWidth: 1.2,
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 10,
        minHeight: 62,
    },
    inviteChatBox: { gap: 8, marginBottom: 12 },
    inviteChatBubble: { maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
    inviteChatUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    inviteChatBot: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    aiInviteGenerateBtn: {
        borderRadius: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    aiInviteGenerateText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
    eInviteGenerationMeta: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 9,
        marginTop: 10,
    },
    eInviteGenerationText: { fontSize: 13, fontWeight: '700' },
    eInviteGenerationSub: { fontSize: 12, marginTop: 2 },
    generatedInviteCard: { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 14 },
    generatedInviteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
    generatedInviteTitle: { fontSize: 16, fontWeight: '800', marginTop: 2 },
    generatedInviteEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
    generatedInviteEditText: { fontSize: 12, fontWeight: '800' },
    generatedInviteImage: { width: '100%', height: 420, borderRadius: 16, backgroundColor: '#E5E7EB' },
    eInviteApiCostText: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
    eInviteCharacterHint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
    inviteCharacterRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    inviteCharacterSlot: { flex: 1, alignItems: 'center', gap: 6 },
    inviteCharacterBtn: {
        width: '100%',
        aspectRatio: 0.75,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    inviteCharacterThumb: { width: '100%', height: '100%' },
    inviteCharacterLabel: { fontSize: 11, fontWeight: '700' },
    savedInviteStrip: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 14 },
    savedInviteTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
    savedInviteRow: { gap: 10, paddingRight: 8 },
    savedInviteThumbOuter: { position: 'relative', width: 106 },
    savedInviteDeleteBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    savedInviteThumbWrap: { width: 106, borderWidth: 1, borderRadius: 12, padding: 6 },
    savedInviteThumb: { width: '100%', height: 120, borderRadius: 10, backgroundColor: '#E5E7EB' },
    savedInviteName: { fontSize: 11, fontWeight: '700', marginTop: 6 },
    inviteCatalogLoading: { paddingVertical: 8, alignItems: 'center' },
    eInviteSectionBlock: { marginTop: 4, marginBottom: 10 },
    eInviteSectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    eInviteSectionTitle: { fontSize: 18, fontWeight: '700' },
    eInviteViewAll: { fontSize: 13, fontWeight: '700' },
    eInviteCardsRow: { paddingHorizontal: 12, paddingRight: 20 },
    eInviteCard: {
        width: 120,
        borderRadius: 12,
        borderWidth: 1,
        padding: 7,
        marginRight: 10,
    },
    eInviteCardActive: {
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    eInviteThumbWrap: {
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 6,
        position: 'relative',
    },
    eInviteThumb: {
        width: '100%',
        height: 112,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E5E7EB',
    },
    eInviteDuration: {
        position: 'absolute',
        top: 6,
        left: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(15,23,42,0.8)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    eInviteDurationText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
    eInviteCardName: { fontSize: 12, fontWeight: '600', minHeight: 30 },
    eInviteCardSubtitle: { fontSize: 10.5, marginTop: 2, minHeight: 24 },
    eInvitePriceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    eInvitePrice: { fontSize: 13, fontWeight: '800' },
    eInviteListPrice: {
        fontSize: 11,
        textDecorationLine: 'line-through',
    },
    eInviteFaqCard: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingTop: 12,
        marginBottom: 16,
    },
    eInviteFaqTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
    eInviteFaqItem: { paddingVertical: 10 },
    eInviteFaqQuestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    eInviteFaqQuestion: { flex: 1, fontSize: 14, fontWeight: '600' },
    eInviteFaqAnswer: { marginTop: 6, fontSize: 13, lineHeight: 19 },
    selectedTemplateBanner: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    selectedTemplateLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    selectedTemplateTitle: { fontSize: 14, fontWeight: '700' },
    selectedTemplateSubtitle: { fontSize: 12, marginTop: 2 },
    selectedTemplateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1.2,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    selectedTemplateBtnText: { fontSize: 12, fontWeight: '700' },
    designerMediaCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    designerMediaThumb: {
        width: 72,
        height: 72,
        borderRadius: 10,
    },
    designerMediaFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
    },
    designerMediaTitle: { fontSize: 14, fontWeight: '700' },
    designerMediaSubtitle: { fontSize: 12, marginTop: 3 },
    designerPreviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    designerPreviewText: { fontSize: 12, fontWeight: '700' },
    fullEditorRoot: { flex: 1 },
    fullEditorCanvas: { flex: 1, position: 'relative' },
    fullEditorBgMedia: { ...StyleSheet.absoluteFillObject },
    fullEditorShade: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(2,6,23,0.42)',
    },
    fullEditorHeader: {
        position: 'absolute',
        top: 56,
        left: 14,
        right: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    fullEditorIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15,23,42,0.55)',
    },
    fullEditorTitle: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    fullEditorPreviewTextWrap: {
        position: 'absolute',
        left: 18,
        right: 18,
        bottom: 28,
        borderRadius: 14,
        padding: 14,
        backgroundColor: 'rgba(15,23,42,0.42)',
    },
    fullEditorPreviewEvent: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 8 },
    fullEditorPreviewMsg: { color: '#E2E8F0', fontSize: 14, lineHeight: 20 },
    fullEditorPanel: {
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderBottomWidth: 0,
        padding: 14,
        paddingBottom: 18,
    },
    fullEditorActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    fullEditorAiBtn: {
        flex: 1,
        borderWidth: 1.4,
        borderRadius: 12,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    fullEditorAiBtnText: { fontSize: 13, fontWeight: '700' },
    fullEditorApplyBtn: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullEditorApplyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    inviteLibraryRow: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        marginBottom: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inviteLibraryThumb: { width: 56, height: 56, borderRadius: 10 },
    inviteLibraryTitle: { fontSize: 14, fontWeight: '700' },
    inviteLibrarySubtitle: { fontSize: 12, marginTop: 2 },
    inviteLibraryMeta: { fontSize: 11, marginTop: 4, fontWeight: '700' },
    inviteCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
    inviteHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    inviteLogoWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    inviteLogoText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
    inviteCardTitle: { fontSize: 18, fontWeight: '800' },
    inviteDesc: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
    inviteRow: { flexDirection: 'row', gap: 10 },
    previewCard: { borderRadius: 16, borderWidth: 1, padding: 4, marginBottom: 16, overflow: 'hidden' },
    previewLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textAlign: 'center', paddingVertical: 6 },
    previewInner: { borderRadius: 14, padding: 24, alignItems: 'center' },
    previewStar: { fontSize: 24, marginBottom: 6 },
    previewTitle: { fontSize: 14, color: '#8B6914', fontWeight: '600', marginBottom: 4 },
    previewEvent: { fontSize: 22, fontWeight: '900', color: '#4A2800', textAlign: 'center', marginBottom: 4 },
    previewHost: { fontSize: 13, color: '#6B4E1D', fontStyle: 'italic', marginBottom: 6 },
    previewDivider: { width: 60, height: 1.5, backgroundColor: '#C8A85C', marginVertical: 12 },
    previewDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    previewDetail: { fontSize: 13, color: '#5C4318', lineHeight: 18 },
    previewMessage: { fontSize: 13, color: '#5C4318', fontStyle: 'italic', textAlign: 'center', marginTop: 10, lineHeight: 20 },
    previewFooter: { fontSize: 12, color: '#8B6914', marginTop: 14, fontWeight: '500' },
    previewBrand: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 },
    previewBrandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF7A00' },
    previewBrandText: { fontSize: 10, color: '#999', fontWeight: '600' },
    shareActions: { gap: 10, marginBottom: 16 },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
    shareBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    shareBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
    shareBtnOutlineText: { fontSize: 14, fontWeight: '600' },
    guestShareList: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
    guestShareTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
    guestShareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    guestShareName: { fontSize: 14, fontWeight: '500' },
    guestSharePhone: { fontSize: 12, marginTop: 2 },
    chipsLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
    aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
    aiBtnText: { fontSize: 14, fontWeight: '700' },
    samplesBox: { marginBottom: 12 },
    samplesTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
    sampleCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
    sampleText: { fontSize: 13, lineHeight: 20 },
    finalBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
    finalText: { fontSize: 13, lineHeight: 22 },
    previewAiBlock: { fontSize: 13, lineHeight: 22, textAlign: 'center', marginVertical: 8 },
    waHint: { fontSize: 12, marginBottom: 12 },
    waRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    waName: { fontSize: 15, fontWeight: '600' },
    waPhone: { fontSize: 12, marginTop: 2 },
    waFooter: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
    waSecondary: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1 },
});
