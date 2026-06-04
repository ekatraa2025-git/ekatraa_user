import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Image,
    TouchableOpacity, TextInput, ActivityIndicator,
    Dimensions, Animated, LayoutAnimation, Platform,
    Modal, Linking, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useEventForm } from '../../context/EventFormContext';
import { api, useBackendApi } from '../../services/api';
import { supabase, resolveStorageUrl } from '../../services/supabase';
import { StorageVideoCover } from '../../components/StorageVideoCover';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import BottomTabBar from '../../components/BottomTabBar';
import { TIER_SUB_KEYS } from '../../utils/lineItemDisplay';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';


const { width } = Dimensions.get('window');
const TIER_KEYS = ['price_basic', 'price_classic_value', 'price_signature', 'price_prestige', 'price_royal', 'price_imperial'];
const TIER_LABELS = ['Basic', 'Classic Value', 'Signature', 'Prestige', 'Royal', 'Imperial'];
const TIER_QTY_KEYS = ['qty_label_basic', 'qty_label_classic_value', 'qty_label_signature', 'qty_label_prestige', 'qty_label_royal', 'qty_label_imperial'];
const TIER_GUESTS_DEFAULT = ['Upto 100', 'Upto 300', 'Upto 500', '500-1000', '1000+', '1500+'];
const TIER_COLORS = ['#10B981', '#3B82F6', '#FF7A00', '#8B5CF6', '#F59E0B', '#EC4899'];
const BUDGET_OPTIONS = [
    '6-10 Lakhs', '11-15 Lakhs', '16-20 Lakhs',
    '21-30 Lakhs', '30 Lakhs+', '50 Lakhs+',
];
const SECTION_COLORS = ['#FF7A00', '#1E3A8A', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#14B8A6'];

/** LayoutAnimation is unreliable on Android (Fabric / new arch) and can native-crash; keep for iOS only. */
function runLayoutAnimation() {
    if (Platform.OS !== 'ios') return;
    try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (_) {
        /* ignore */
    }
}

/** At least 10 digits (handles spaces / +91). */
function isValidPhoneDigits(mobile) {
    const d = String(mobile || '').replace(/\D/g, '');
    return d.length >= 10;
}

export default function CategoryServices({ route, navigation }) {
    const { theme, isDarkMode } = useTheme();
    const insets = useSafeAreaInsets();
    const { isAuthenticated, user, session } = useAuth();
    const { eventForm } = useEventForm();
    const { cartId: globalCartId, cartOwnerAnonSession, setCartId: setGlobalCartId, refreshCartCount } = useCart();
    const { showToast } = useToast();

    const {
        categoryIds = [],
        categoryNames = [],
        categoryId: singleCategoryId,
        categoryName: singleCategoryName,
        occasionId, occasionName,
    } = route.params || {};

    const rawIds = categoryIds.length > 0 ? categoryIds : (singleCategoryId != null ? [singleCategoryId] : []);
    const resolvedCategoryIds = rawIds
        .map((id) => (id != null ? String(id).trim() : ''))
        .filter((id) => id.length > 0);
    const rawNames = categoryNames.length > 0 ? categoryNames : (singleCategoryName != null ? [singleCategoryName] : []);
    const resolvedCategoryNames = resolvedCategoryIds.map((_, i) => {
        const n = rawNames[i];
        return n != null && String(n).trim() ? String(n).trim() : `Category ${i + 1}`;
    });

    const [servicesByCategory, setServicesByCategory] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedServices, setSelectedServices] = useState(new Map());
    const [cartId, setCartId] = useState(globalCartId || null);
    const [adding, setAdding] = useState(false);
    const [expandedServiceId, setExpandedServiceId] = useState(null);
    /** categoryId -> expanded; initially all collapsed */
    const [expandedCategoryIds, setExpandedCategoryIds] = useState({});
    const [showContactModal, setShowContactModal] = useState(false);
    const [contactModalForm, setContactModalForm] = useState({
        contact_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
        contact_mobile: user?.phone || '',
    });

    useEffect(() => {
        fetchAllServices();
    }, []);

    useEffect(() => {
        setContactModalForm({
            contact_name: user?.user_metadata?.full_name || user?.user_metadata?.name || eventForm?.contact_name || '',
            contact_mobile: user?.phone || eventForm?.contact_mobile || '',
        });
    }, [user?.id, eventForm?.contact_name, eventForm?.contact_mobile]);

    const useApi = useBackendApi();
    const tabBarOffset = 56 + Math.max(insets.bottom, 6);

    const fetchServicesForCategory = async (catId) => {
        if (catId == null || String(catId).trim() === '') return [];
        if (useApi) {
            const { data } = await api.getServices({ occasion_id: occasionId, category_id: catId });
            if (Array.isArray(data) && data.length > 0) return data;
            const { data: d2 } = await api.getServices({ category_id: catId });
            if (Array.isArray(d2) && d2.length > 0) return d2;
        }
        try {
            let query = supabase
                .from('offerable_services')
                .select('id, category_id, name, description, image_url, video_url, display_order, price_min, price_max, price_unit, price_basic, price_classic_value, price_signature, price_prestige, price_royal, price_imperial, qty_label_basic, qty_label_classic_value, qty_label_signature, qty_label_prestige, qty_label_royal, qty_label_imperial, sub_variety_basic, sub_variety_classic_value, sub_variety_signature, sub_variety_prestige, sub_variety_royal, sub_variety_imperial, tag_new, tag_most_booked, city')
                .eq('is_active', true)
                .eq('category_id', catId)
                .order('display_order', { ascending: true });
            const { data: sbData } = await query;
            if (Array.isArray(sbData) && sbData.length > 0) return sbData;
        } catch (e) {
            console.log('[SB fallback error]', e);
        }
        return [];
    };

    const fetchAllServices = async () => {
        setLoading(true);
        if (!resolvedCategoryIds.length) {
            setServicesByCategory({});
            setLoading(false);
            return;
        }
        try {
            const results = {};
            const fetches = resolvedCategoryIds.map(async (catId, i) => {
                const catName = resolvedCategoryNames[i] || `Category ${i + 1}`;
                const rawServices = await fetchServicesForCategory(catId);
                const services = await Promise.all(
                    (rawServices || []).map(async (svc) => {
                        if (!svc || typeof svc !== 'object') return null;
                        let imageUrl = null;
                        let videoUrl = null;
                        try {
                            imageUrl = await resolveStorageUrl(svc.image_url);
                        } catch (_) {
                            imageUrl = svc.image_url || null;
                        }
                        try {
                            videoUrl = svc.video_url ? await resolveStorageUrl(svc.video_url) : null;
                        } catch (_) {
                            videoUrl = svc.video_url || null;
                        }
                        return { ...svc, image_url: imageUrl, video_url: videoUrl };
                    })
                );
                return { catId, catName, services: services.filter(Boolean) };
            });
            const allResults = await Promise.all(fetches);
            for (const { catId, catName, services } of allResults) {
                results[String(catId)] = { name: catName, services };
            }
            setServicesByCategory(results);
        } catch (e) {
            console.warn('[CategoryServices] fetchAllServices', e?.message || e);
            setServicesByCategory({});
        }
        setLoading(false);
    };

    const getServiceTierPrices = (item) => {
        const out = [];
        if (!item || typeof item !== 'object') return out;
        TIER_KEYS.forEach((key, i) => {
            const v = item[key];
            if (v != null && v !== '') {
                const qtyLabel = item[TIER_QTY_KEYS[i]] || TIER_GUESTS_DEFAULT[i];
                out.push({
                    label: TIER_LABELS[i],
                    value: Number(v),
                    key,
                    guests: qtyLabel,
                    subVariety: item[TIER_SUB_KEYS[i]] || null,
                    color: TIER_COLORS[i],
                });
            }
        });
        return out;
    };

    const toggleService = (service) => {
        if (!service || service.id == null) return;
        const sid = service.id;
        runLayoutAnimation();
        setSelectedServices(prev => {
            const next = new Map(prev);
            if (next.has(sid)) {
                next.delete(sid);
                if (expandedServiceId === sid) setExpandedServiceId(null);
            } else {
                const tiers = getServiceTierPrices(service);
                next.set(sid, {
                    service,
                    selectedTier: tiers.length > 0 ? tiers[0].key : null,
                    price: tiers.length > 0 ? tiers[0].value : 0,
                });
                setExpandedServiceId(sid);
            }
            return next;
        });
    };

    const selectTier = (serviceId, tierKey, tierPrice) => {
        setSelectedServices(prev => {
            const next = new Map(prev);
            const entry = next.get(serviceId);
            if (entry) {
                next.set(serviceId, { ...entry, selectedTier: tierKey, price: tierPrice });
            }
            return next;
        });
    };

    const getEffectiveForm = () => {
        const fromContext = eventForm && typeof eventForm === 'object' ? eventForm : {};
        return {
            contact_name: String(fromContext.contact_name ?? contactModalForm.contact_name ?? '').trim() || '',
            contact_mobile: String(fromContext.contact_mobile ?? contactModalForm.contact_mobile ?? '').trim() || '',
            contact_email: fromContext.contact_email || null,
            event_date: fromContext.event_date || null,
            guest_count: fromContext.guest_count || null,
            location_preference: fromContext.location_preference || null,
            venue_preference: fromContext.venue_preference || null,
            planned_budget: fromContext.planned_budget || null,
            role: fromContext.role || null,
        };
    };

    const handleAddToCart = async () => {
        if (selectedServices.size === 0) {
            showToast({
                variant: 'info',
                title: 'Select services',
                message: 'Please select at least one service to add to your cart.',
            });
            return;
        }
        if (!occasionName || !String(occasionName).trim()) {
            showToast({
                variant: 'error',
                title: 'Occasion required',
                message: 'Go back to Home, select an occasion, then open categories again.',
            });
            return;
        }
        const effectiveForm = getEffectiveForm();
        if (!effectiveForm.contact_name.trim() || !isValidPhoneDigits(effectiveForm.contact_mobile)) {
            setShowContactModal(true);
            return;
        }

        setAdding(true);
        let cid = cartId;
        let anonOwnerProof = cartOwnerAnonSession;
        if (!cid) {
            const { data: cartData, error: cartErr } = await api.createCart({
                session_id: 'app-' + Date.now(),
                user_id: isAuthenticated && user?.id ? user.id : null,
            });
            if (cartErr) {
                showToast({ variant: 'error', title: 'Cart error', message: cartErr.message });
                setAdding(false);
                return;
            }
            cid = cartData?.id;
            if (cid) {
                setCartId(cid);
                await setGlobalCartId(cid, cartData?.session_id ?? undefined);
            }
            anonOwnerProof = cartData?.session_id ?? cartOwnerAnonSession;
        }
        if (!cid) { setAdding(false); return; }

        const cartPayload = {
            event_name: String(occasionName).trim(),
            event_role: effectiveForm.role || null,
            contact_name: effectiveForm.contact_name.trim(),
            contact_mobile: effectiveForm.contact_mobile.trim(),
            contact_email: effectiveForm.contact_email || null,
            event_date: effectiveForm.event_date || null,
            guest_count: effectiveForm.guest_count || null,
            location_preference: effectiveForm.location_preference || null,
            venue_preference: effectiveForm.venue_preference || null,
            planned_budget: effectiveForm.planned_budget || null,
        };
        const patchOpts = { cartOwnerSession: anonOwnerProof };
        if (isAuthenticated && session?.access_token) patchOpts.accessToken = session.access_token;
        await api.updateCart(cid, cartPayload, patchOpts);

        for (const [, entry] of selectedServices) {
            if (!entry?.service || entry.service.id == null) continue;
            const ti = TIER_KEYS.indexOf(entry.selectedTier);
            const qtyLabel = ti >= 0 ? entry.service[TIER_QTY_KEYS[ti]] : null;
            const subVariety = ti >= 0 ? entry.service[TIER_SUB_KEYS[ti]] : null;
            await api.addCartItem({
                cart_id: cid,
                service_id: entry.service.id,
                quantity: 1,
                unit_price: entry.price || 0,
                options: {
                    tier: entry.selectedTier,
                    occasion: occasionName,
                    category: resolvedCategoryNames.join(', '),
                    role: effectiveForm.role,
                    ...(qtyLabel ? { qty_label: qtyLabel } : {}),
                    ...(subVariety ? { sub_variety: subVariety } : {}),
                },
            });
        }

        setAdding(false);
        setShowContactModal(false);
        refreshCartCount(cid);
        const n = selectedServices.size;
        showToast({
            variant: 'success',
            title: 'Added to cart',
            message: `${n} service${n === 1 ? '' : 's'} saved. Continue browsing or open your cart.`,
            action: { label: 'View cart', onPress: () => navigation.navigate('Cart') },
        });
    };

    const handleContactModalSubmit = () => {
        if (!occasionName || !String(occasionName).trim()) {
            showToast({
                variant: 'error',
                title: 'Occasion required',
                message: 'Go back to Home and select an occasion first.',
            });
            return;
        }
        if (!contactModalForm.contact_name.trim()) {
            showToast({ variant: 'error', title: 'Name required', message: 'Please enter your name.' });
            return;
        }
        if (!isValidPhoneDigits(contactModalForm.contact_mobile)) {
            showToast({
                variant: 'error',
                title: 'Valid phone required',
                message: 'Enter a mobile number with at least 10 digits.',
            });
            return;
        }
        handleAddToCart();
    };

    const totalAmount = Array.from(selectedServices.values()).reduce((sum, e) => sum + (e.price || 0), 0);
    const allServices = Object.values(servicesByCategory).flatMap(cat => cat.services);

    const headerTitle = resolvedCategoryNames.length === 1
        ? resolvedCategoryNames[0]
        : `${resolvedCategoryNames.length} Categories`;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <View style={[styles.backBtnCircle, { backgroundColor: isDarkMode ? '#2D3142' : '#F3F4F6' }]}>
                        <Ionicons name="arrow-back" size={20} color={theme.text} />
                    </View>
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                        {headerTitle || 'Services'}
                    </Text>
                    {occasionName && (
                        <View style={styles.headerTagRow}>
                            <View style={[styles.headerTag, { backgroundColor: colors.primary + '12' }]}>
                                <Text style={[styles.headerTagText, { color: colors.primary }]}>{occasionName}</Text>
                            </View>
                        </View>
                    )}
                </View>
                {selectedServices.size > 0 && (
                    <View style={[styles.headerBadge, { backgroundColor: colors.primary }]}>
                        <Ionicons name="cart" size={14} color="#FFF" />
                        <Text style={styles.headerBadgeText}>{selectedServices.size}</Text>
                    </View>
                )}
            </View>

            {loading ? (
                <View style={styles.loadingWrap}>
                    <View style={styles.loadingList}>
                        {[0, 1, 2].map((idx) => (
                            <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.card }}>
                                <View style={styles.loadingCardHeader}>
                                    <SkeletonBlock theme={theme} width={86} height={86} radius={16} />
                                    <View style={{ flex: 1 }}>
                                        <SkeletonBlock theme={theme} width="65%" height={16} />
                                        <View style={{ height: 8 }} />
                                        <SkeletonBlock theme={theme} width="100%" height={12} />
                                        <View style={{ height: 6 }} />
                                        <SkeletonBlock theme={theme} width="80%" height={12} />
                                    </View>
                                </View>
                                <View style={{ height: 12 }} />
                                <SkeletonBlock theme={theme} width="40%" height={14} />
                            </SkeletonCard>
                        ))}
                    </View>
                </View>
            ) : allServices.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <View style={[styles.emptyIcon, { backgroundColor: isDarkMode ? '#1A1D27' : '#FFF8F0' }]}>
                        <Ionicons name="search-outline" size={40} color={colors.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No services available</Text>
                    <Text style={[styles.emptyDesc, { color: theme.textLight }]}>
                        We haven't added services for this selection yet. Check back soon!
                    </Text>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
                        <LinearGradient colors={[colors.primary, '#FFA040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBtnGradient}>
                            <Ionicons name="arrow-back" size={18} color="#FFF" />
                            <Text style={styles.emptyBtnText}>Go Back</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                    >
                        {/* Contact modal - shown when adding to cart without event form */}
                        <Modal visible={showContactModal} animationType="slide" transparent>
                            <View style={styles.contactModalOverlay}>
                                <View style={[styles.contactModalContent, { backgroundColor: theme.card }]}>
                                    <Text style={[styles.contactModalTitle, { color: theme.text }]}>Contact Details Required</Text>
                                    <Text style={[styles.contactModalSubtitle, { color: theme.textLight }]}>
                                        Occasion is set from your selection. Enter your name and phone to add items to cart.
                                    </Text>
                                    <View style={[styles.contactModalInputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                        <Ionicons name="sparkles-outline" size={16} color={theme.textLight} />
                                        <View style={{ flex: 1, paddingVertical: 10 }}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textLight, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                                Occasion
                                            </Text>
                                            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text, marginTop: 2 }} numberOfLines={2}>
                                                {occasionName || '—'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.contactModalInputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                        <Ionicons name="person-outline" size={16} color={theme.textLight} />
                                        <TextInput
                                            style={[styles.contactModalInput, { color: theme.text }]}
                                            placeholder="Your name"
                                            placeholderTextColor={theme.textLight}
                                            value={contactModalForm.contact_name ?? ''}
                                            onChangeText={t => setContactModalForm(p => ({ ...p, contact_name: t }))}
                                        />
                                    </View>
                                    <View style={[styles.contactModalInputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                        <Ionicons name="call-outline" size={16} color={theme.textLight} />
                                        <TextInput
                                            style={[styles.contactModalInput, { color: theme.text }]}
                                            placeholder="Mobile number"
                                            placeholderTextColor={theme.textLight}
                                            value={contactModalForm.contact_mobile ?? ''}
                                            onChangeText={t => setContactModalForm(p => ({ ...p, contact_mobile: t }))}
                                            keyboardType="phone-pad"
                                        />
                                    </View>
                                    <View style={styles.contactModalActions}>
                                        <TouchableOpacity
                                            style={[styles.contactModalCancelBtn, { borderColor: theme.border }]}
                                            onPress={() => setShowContactModal(false)}
                                        >
                                            <Text style={[styles.contactModalCancelText, { color: theme.text }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.contactModalSubmitBtn}
                                            onPress={handleContactModalSubmit}
                                        >
                                            <LinearGradient colors={[colors.primary, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.contactModalSubmitGradient}>
                                                <Text style={styles.contactModalSubmitText}>Add to Cart</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>

                        {/* Services grouped by category */}
                        {Object.entries(servicesByCategory).map(([catId, catData], catIdx) => {
                            const sectionColor = SECTION_COLORS[catIdx % SECTION_COLORS.length];
                            const svcs = Array.isArray(catData?.services) ? catData.services : [];
                            if (!catData || svcs.length === 0) return null;
                            const catExpanded = expandedCategoryIds[catId] === true;
                            return (
                                <View key={catId} style={styles.categoryGroup}>
                                    <TouchableOpacity
                                        style={[
                                            styles.catSectionHeader,
                                            {
                                                backgroundColor: sectionColor + '18',
                                                borderColor: sectionColor + '30',
                                            },
                                        ]}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                            runLayoutAnimation();
                                            setExpandedCategoryIds((p) => ({ ...p, [catId]: !catExpanded }));
                                        }}
                                    >
                                        <View style={styles.catSectionLeft}>
                                            <Ionicons
                                                name={catExpanded ? 'chevron-down' : 'chevron-forward'}
                                                size={20}
                                                color={sectionColor}
                                            />
                                            <View style={styles.catSectionTitleWrap}>
                                                <Text style={[styles.catSectionTitle, { color: theme.text }]}>
                                                    {catData?.name || 'Category'}
                                                </Text>
                                                <Text style={[styles.catSectionCount, { color: theme.textLight }]}>
                                                    {svcs.length} {svcs.length === 1 ? 'service' : 'services'}
                                                    {!catExpanded ? ' · tap to expand' : ''}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={[styles.catSectionThumbWrap, { borderColor: sectionColor + '40' }]}>
                                            {svcs[0]?.video_url ? (
                                                <StorageVideoCover
                                                    uri={svcs[0].video_url}
                                                    fallbackImageUri={svcs[0].image_url}
                                                    style={styles.catSectionThumb}
                                                    resizeMode="cover"
                                                />
                                            ) : svcs[0]?.image_url ? (
                                                <Image source={{ uri: svcs[0].image_url }} style={styles.catSectionThumb} />
                                            ) : (
                                                <Ionicons name="images-outline" size={16} color={sectionColor} />
                                            )}
                                        </View>
                                    </TouchableOpacity>

                                    {catExpanded && svcs.filter((s) => s && s.id != null).map((item) => {
                                        const tierPrices = getServiceTierPrices(item);
                                        const isSelected = selectedServices.has(item.id);
                                        const selected = selectedServices.get(item.id);
                                        const isExpanded = expandedServiceId === item.id;

                                        return (
                                            <View
                                                key={String(item.id)}
                                                style={[
                                                    styles.serviceCard,
                                                    { backgroundColor: theme.card, borderColor: isSelected ? colors.primary : theme.border },
                                                    isSelected && styles.serviceCardSelected,
                                                ]}
                                            >
                                                {/* Service Header */}
                                                <TouchableOpacity
                                                    style={styles.serviceCardHeader}
                                                    onPress={() => toggleService(item)}
                                                    activeOpacity={0.7}
                                                >
                                                    {/* Thumbnail */}
                                                    {item.video_url ? (
                                                        <StorageVideoCover
                                                            uri={item.video_url}
                                                            fallbackImageUri={item.image_url}
                                                            style={styles.serviceThumb}
                                                            resizeMode="cover"
                                                        />
                                                    ) : item.image_url ? (
                                                        <Image source={{ uri: item.image_url }} style={styles.serviceThumb} />
                                                    ) : (
                                                        <View style={[styles.serviceThumbPlaceholder, { backgroundColor: sectionColor + '15' }]}>
                                                            <Text style={{ fontSize: 24 }}>{item.icon || '🎯'}</Text>
                                                        </View>
                                                    )}

                                                    <View style={styles.serviceTextWrap}>
                                                        <Text style={[styles.serviceName, { color: theme.text }]} numberOfLines={2}>
                                                            {item.name}
                                                        </Text>
                                                        {item.description ? (
                                                            <Text style={[styles.serviceDesc, { color: theme.textLight }]} numberOfLines={isExpanded ? 4 : 2}>
                                                                {item.description}
                                                            </Text>
                                                        ) : null}
                                                        {tierPrices.length > 0 && !isSelected && (
                                                            <Text style={[styles.serviceStartPrice, { color: colors.primary }]}>
                                                                From ₹{(Number(tierPrices[0]?.value) || 0).toLocaleString()}
                                                            </Text>
                                                        )}
                                                    </View>

                                                    {/* Selection indicator */}
                                                    <View style={[
                                                        styles.selectCircle,
                                                        { borderColor: isSelected ? colors.primary : (isDarkMode ? '#4B5563' : '#D1D5DB') },
                                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}>
                                                        {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                                                    </View>
                                                </TouchableOpacity>

                                                {/* Tier Selection (shown when selected) */}
                                                {isSelected && tierPrices.length > 0 && (
                                                    <View style={[styles.tierSection, { borderTopColor: theme.border }]}>
                                                        <Text style={[styles.tierSectionTitle, { color: theme.textLight }]}>Choose your package</Text>
                                                        {tierPrices.map((tier, i) => {
                                                            const isTierSelected = selected?.selectedTier === tier.key;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={tier.key}
                                                                    style={[
                                                                        styles.tierOption,
                                                                        { backgroundColor: isDarkMode ? '#1A1D27' : '#FAFAFA', borderColor: isDarkMode ? '#2D3142' : '#E5E7EB' },
                                                                        isTierSelected && { backgroundColor: colors.primary + '0A', borderColor: colors.primary },
                                                                    ]}
                                                                    onPress={() => selectTier(item.id, tier.key, tier.value)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <View style={[
                                                                        styles.tierRadioOuter,
                                                                        { borderColor: isTierSelected ? colors.primary : (isDarkMode ? '#4B5563' : '#D1D5DB') },
                                                                    ]}>
                                                                        {isTierSelected && <View style={[styles.tierRadioInner, { backgroundColor: colors.primary }]} />}
                                                                    </View>
                                                                    <View style={styles.tierContent}>
                                                                        <Text style={[
                                                                            styles.tierLabel,
                                                                            { color: theme.text },
                                                                            isTierSelected && { color: colors.primary, fontWeight: '700' },
                                                                        ]}>
                                                                            {tier.label}
                                                                        </Text>
                                                                        {tier.guests ? (
                                                                            <View style={[styles.tierGuestBadge, { backgroundColor: tier.color + '18' }]}>
                                                                                <Ionicons name="people-outline" size={11} color={tier.color} />
                                                                                <Text style={[styles.tierGuestText, { color: tier.color }]}>{tier.guests}</Text>
                                                                            </View>
                                                                        ) : null}
                                                                        {tier.subVariety ? (
                                                                            <Text style={[styles.tierSubText, { color: theme.textLight }]} numberOfLines={3}>
                                                                                {tier.subVariety}
                                                                            </Text>
                                                                        ) : null}
                                                                    </View>
                                                                    <Text style={[
                                                                        styles.tierPrice,
                                                                        { color: isTierSelected ? colors.primary : theme.text },
                                                                    ]}>
                                                                        ₹{tier.value.toLocaleString()}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            );
                        })}

                        <View style={{ height: 200 }} />
                    </ScrollView>

                    {/* Bottom Bar - positioned above BottomTabBar */}
                    <View
                        style={[
                            styles.bottomBar,
                            {
                                backgroundColor: theme.card,
                                borderColor: theme.border,
                                bottom: tabBarOffset + 8,
                            },
                        ]}
                    >
                        <View style={styles.bottomLeft}>
                            <Text style={[styles.bottomTotal, { color: theme.text }]}>
                                {selectedServices.size > 0 ? `₹${totalAmount.toLocaleString()}` : 'No selection'}
                            </Text>
                            <Text style={[styles.bottomCount, { color: theme.textLight }]}>
                                {selectedServices.size} service{selectedServices.size !== 1 ? 's' : ''} selected
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[
                                styles.addToCartBtn,
                                selectedServices.size === 0 && styles.addToCartBtnDisabled,
                            ]}
                            onPress={handleAddToCart}
                            disabled={adding || selectedServices.size === 0}
                            activeOpacity={0.85}
                        >
                            {adding ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <LinearGradient
                                    colors={selectedServices.size > 0 ? [colors.primary, '#FFA040'] : ['#9CA3AF', '#6B7280']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.addToCartGradient}
                                >
                                    <Ionicons name="cart" size={22} color="#FFF" />
                                    <Text style={styles.addToCartText}>Add to Cart</Text>
                                    <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.9)" />
                                </LinearGradient>
                            )}
                        </TouchableOpacity>
                    </View>
                </>
            )}
            <BottomTabBar navigation={navigation} activeRoute="CategoryServices" />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: { marginRight: 10 },
    backBtnCircle: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: { flex: 1 },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    headerTagRow: { flexDirection: 'row', marginTop: 3 },
    headerTag: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 6,
    },
    headerTagText: { fontSize: 12, fontWeight: '600' },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 4,
    },
    headerBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingList: {
        width: '100%',
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 10,
    },
    loadingCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    loadingSpinner: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    loadingText: { fontSize: 15, fontWeight: '500' },

    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
    emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28, maxWidth: 280 },
    emptyBtn: { borderRadius: 14, overflow: 'hidden' },
    emptyBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        gap: 8,
    },
    emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

    scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

    contactModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    contactModalContent: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 20,
        padding: 24,
    },
    contactModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    contactModalSubtitle: { fontSize: 14, marginBottom: 20 },
    contactModalInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        gap: 10,
        marginBottom: 14,
    },
    contactModalInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
    contactModalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    contactModalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    contactModalCancelText: { fontSize: 16, fontWeight: '700' },
    contactModalSubmitBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
    contactModalSubmitGradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    contactModalSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

    // Form toggle (legacy - kept for reference, form moved to Home)
    detailsToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1.5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    detailsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    detailsIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailsToggleTitle: { fontSize: 15, fontWeight: '700' },
    detailsToggleHint: { fontSize: 12, marginTop: 2 },
    chevronWrap: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    formCard: {
        borderRadius: 16,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderWidth: 1.5,
        borderTopWidth: 0,
        padding: 16,
        marginBottom: 8,
    },
    formGroup: { marginBottom: 14 },
    formLabel: { fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
    formRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    formCol: { flex: 1 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    roleText: { fontSize: 13, fontWeight: '600' },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        gap: 8,
    },
    input: {
        flex: 1,
        paddingVertical: 10,
        fontSize: 14,
    },
    budgetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    budgetChip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    budgetText: { fontSize: 12, fontWeight: '600' },
    locationBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    locationActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        gap: 6,
    },
    locationActionText: { fontSize: 13, fontWeight: '600' },
    mapModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    mapModalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' },
    mapModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    mapModalTitle: { fontSize: 18, fontWeight: '700' },
    mapSearchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 12,
        gap: 8,
    },
    mapSearchInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
    mapSearchBtn: { padding: 4 },
    mapContainer: { position: 'relative', height: 280, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
    mapView: { height: 280, borderRadius: 12, width: '100%' },
    mapLoadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.92)',
        zIndex: 10,
    },
    mapLoadingText: { marginTop: 8, fontSize: 14 },
    mapFallback: { justifyContent: 'center', alignItems: 'center', padding: 24 },
    mapFallbackText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
    mapFallbackHint: { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
    mapConfirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    mapConfirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

    // Category groups
    categoryGroup: { marginTop: 20 },
    catSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    catSectionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    catSectionTitleWrap: { flexShrink: 1 },
    catSectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
    catSectionCount: { fontSize: 12, marginTop: 2 },
    catSectionThumbWrap: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
    },
    catSectionThumb: {
        width: '100%',
        height: '100%',
    },

    // Service cards
    serviceCard: {
        borderRadius: 16,
        borderWidth: 1.5,
        marginBottom: 12,
        overflow: 'hidden',
    },
    serviceCardSelected: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 5,
    },
    serviceCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    serviceThumb: { width: 78, height: 78, borderRadius: 14, marginRight: 12 },
    serviceThumbPlaceholder: {
        width: 78,
        height: 78,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    serviceTextWrap: { flex: 1, marginRight: 10 },
    serviceName: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
    serviceDesc: { fontSize: 12, marginTop: 4, lineHeight: 17 },
    serviceStartPrice: { fontSize: 13, fontWeight: '700', marginTop: 4 },
    selectCircle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Tiers
    tierSection: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        paddingTop: 10,
        borderTopWidth: 1,
    },
    tierSectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    tierOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        marginBottom: 6,
    },
    tierRadioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    tierRadioInner: { width: 10, height: 10, borderRadius: 5 },
    tierContent: { flex: 1, minWidth: 0 },
    tierLabel: { fontSize: 14, fontWeight: '600' },
    tierGuestBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        gap: 4,
        marginTop: 5,
        alignSelf: 'flex-start',
        maxWidth: '100%',
    },
    tierGuestText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
    tierSubText: { marginTop: 6, fontSize: 11, lineHeight: 16, fontWeight: '500' },
    tierPrice: { marginLeft: 10, flexShrink: 0, fontSize: 16, fontWeight: '800' },

    // Bottom bar - prominent above footer
    bottomBar: {
        position: 'absolute',
        left: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderRadius: 20,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 12,
    },
    bottomLeft: {},
    bottomTotal: { fontSize: 22, fontWeight: '800' },
    bottomCount: { fontSize: 13, marginTop: 2 },
    addToCartBtn: {
        borderRadius: 16,
        overflow: 'hidden',
        minWidth: 160,
    },
    addToCartBtnDisabled: { opacity: 0.5 },
    addToCartGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        gap: 10,
    },
    addToCartText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});
