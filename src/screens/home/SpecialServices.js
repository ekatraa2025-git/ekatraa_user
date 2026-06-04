import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    TextInput,
    Modal,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useEventForm } from '../../context/EventFormContext';
import { api, useBackendApi } from '../../services/api';
import { resolveStorageUrl } from '../../services/supabase';
import { StorageVideoCover } from '../../components/StorageVideoCover';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import BottomTabBar from '../../components/BottomTabBar';
import { getOfferableTierRows } from '../../utils/lineItemDisplay';

const { width } = Dimensions.get('window');

const E_INVITE_CATALOG_SERVICE_ID = 'e1000001-0000-4000-8000-000000000001';

function numPrice(v) {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

export default function SpecialServices({ route, navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();
    const insets = useSafeAreaInsets();
    const { isAuthenticated, user, session } = useAuth();
    const { cartId: globalCartId, cartOwnerAnonSession, setCartId: setGlobalCartId, refreshCartCount } = useCart();
    const { showToast } = useToast();
    const { setEventForm } = useEventForm();
    const { occasionId, occasionName, city, selectedServiceId = null, showAll = false } = route.params || {};

    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(new Map());
    const [cartId, setCartId] = useState(globalCartId || null);
    const [adding, setAdding] = useState(false);
    const [showAllServices, setShowAllServices] = useState(showAll || !selectedServiceId);
    const [expandedServiceId, setExpandedServiceId] = useState(selectedServiceId || null);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [detailsStep, setDetailsStep] = useState(0);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [cartMeta, setCartMeta] = useState({
        occasion_name: occasionName || 'Special add-ons',
        event_date: '',
        delivery_mode: 'venue',
        venue_selection: '',
        delivery_address: city || '',
        contact_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
        contact_mobile: user?.phone || '',
        contact_email: user?.email || '',
    });
    const useApi = useBackendApi();

    const load = useCallback(async () => {
        if (!useApi) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const { data, error } = await api.getSpecialServices();
        if (error) {
            showToast({ variant: 'error', title: 'Could not load', message: error.message || 'Try again later.' });
            setServices([]);
        } else {
            const resolved = await Promise.all(
                (data || []).map(async (s) => ({
                    ...s,
                    image_url: s.image_url ? await resolveStorageUrl(s.image_url) : null,
                    video_url: s.video_url ? await resolveStorageUrl(s.video_url) : null,
                }))
            );
            setServices(resolved.filter((s) => String(s.id || '') !== E_INVITE_CATALOG_SERVICE_ID && !/e-invite|e invite/i.test(String(s.name || ''))));
        }
        setLoading(false);
    }, [useApi, showToast]);

    useEffect(() => {
        load();
    }, [load]);

    const filteredServices = useMemo(() => {
        if (showAllServices || !selectedServiceId) return services;
        return services.filter((svc) => svc.id === selectedServiceId);
    }, [services, showAllServices, selectedServiceId]);

    const allVisibleSelected =
        filteredServices.length > 0 &&
        filteredServices.every((svc) => selected.has(svc.id));

    const total = useMemo(
        () => [...selected.values()].reduce((s, r) => s + (r.price || 0), 0),
        [selected]
    );

    const selectTier = (svc, tierRow) => {
        setSelected((prev) => {
            const next = new Map(prev);
            const price = tierRow.value;
            if (price <= 0) return prev;
            next.set(svc.id, {
                tierKey: tierRow.key,
                price,
                name: svc.name,
                label: tierRow.label,
                qtyLabel: tierRow.qtyLabel,
                subVariety: tierRow.subVariety,
            });
            return next;
        });
    };

    const toggleService = (svc) => {
        const rows = getOfferableTierRows(svc);
        if (!rows.length) return;
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(svc.id)) next.delete(svc.id);
            else {
                const r = rows[0];
                next.set(svc.id, {
                    tierKey: r.key,
                    price: r.value,
                    name: svc.name,
                    label: r.label,
                    qtyLabel: r.qtyLabel,
                    subVariety: r.subVariety,
                });
            }
            return next;
        });
    };

    const toggleSelectAllVisible = () => {
        if (!filteredServices.length) return;
        setSelected((prev) => {
            const next = new Map(prev);
            if (allVisibleSelected) {
                filteredServices.forEach((svc) => next.delete(svc.id));
                return next;
            }
            filteredServices.forEach((svc) => {
                const rows = getOfferableTierRows(svc);
                if (!rows.length) return;
                const r = rows[0];
                next.set(svc.id, {
                    tierKey: r.key,
                    price: r.value,
                    name: svc.name,
                    label: r.label,
                    qtyLabel: r.qtyLabel,
                    subVariety: r.subVariety,
                });
            });
            return next;
        });
    };

    useEffect(() => {
        if (detailsModalVisible) setDetailsStep(0);
    }, [detailsModalVisible]);

    const validateSpecialCheckoutStep = useCallback(
        (s) => {
            if (s === 0) {
                if (!cartMeta.occasion_name?.trim()) return tr('special_err_occasion');
                if (!cartMeta.event_date) return tr('special_err_date');
            }
            if (s === 1) {
                if (cartMeta.delivery_mode === 'venue' && !cartMeta.venue_selection?.trim()) {
                    return tr('special_err_venue');
                }
                if (cartMeta.delivery_mode === 'address' && !cartMeta.delivery_address?.trim()) {
                    return tr('special_err_address');
                }
            }
            if (s === 2) {
                if (!cartMeta.contact_name?.trim() || !cartMeta.contact_mobile?.trim()) {
                    return tr('special_err_contact');
                }
                const d = cartMeta.contact_mobile.replace(/\D/g, '');
                if (d.length < 10) return tr('userinfo_err_phone_len');
                if (cartMeta.contact_email?.trim()) {
                    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cartMeta.contact_email.trim());
                    if (!ok) return tr('userinfo_err_email');
                }
            }
            return null;
        },
        [cartMeta, tr]
    );

    const goSpecialCheckoutNext = () => {
        const err = validateSpecialCheckoutStep(detailsStep);
        if (err) {
            showToast({ variant: 'info', title: tr('userinfo_validation_title'), message: err });
            return;
        }
        if (detailsStep < 2) setDetailsStep((x) => x + 1);
    };

    const fillCurrentLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showToast({ variant: 'info', title: 'Permission needed', message: 'Allow location to use current address.' });
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [rev] = await Location.reverseGeocodeAsync({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
            const line = [rev?.name, rev?.street, rev?.city, rev?.region, rev?.postalCode]
                .filter(Boolean)
                .join(', ');
            if (line) {
                setCartMeta((p) => ({ ...p, delivery_mode: 'address', delivery_address: line }));
            }
        } catch (e) {
            showToast({ variant: 'error', title: 'Location', message: e?.message || 'Could not fetch current location.' });
        }
    };

    const proceedAddToCart = async () => {
        if (selected.size === 0) {
            showToast({ variant: 'info', title: 'Select items', message: 'Choose at least one special add-on.' });
            return;
        }
        if (!cartMeta.contact_name.trim() || !cartMeta.contact_mobile.trim()) {
            showToast({
                variant: 'info',
                title: 'Details needed',
                message: 'Please add name and mobile to continue.',
            });
            return;
        }
        const mobileDigits = cartMeta.contact_mobile.replace(/\D/g, '');
        if (mobileDigits.length < 10) {
            showToast({ variant: 'info', title: 'Invalid mobile', message: 'Enter a valid 10-digit mobile number.' });
            return;
        }
        if (!cartMeta.occasion_name.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter occasion name.' });
            return;
        }
        if (!cartMeta.event_date) {
            showToast({ variant: 'info', title: 'Required', message: 'Please select event date.' });
            return;
        }
        if (cartMeta.delivery_mode === 'venue' && !cartMeta.venue_selection.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter venue selection.' });
            return;
        }
        if (cartMeta.delivery_mode === 'address' && !cartMeta.delivery_address.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter delivery address.' });
            return;
        }
        if (cartMeta.contact_email?.trim()) {
            const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cartMeta.contact_email.trim());
            if (!okEmail) {
                showToast({ variant: 'info', title: 'Invalid email', message: 'Please enter a valid email address.' });
                return;
            }
        }
        setAdding(true);
        try {
            let cid = cartId;
            const accessToken = session?.access_token || null;
            if (!cid) {
                const createPayload = {
                    session_id: 'special-' + Date.now(),
                    user_id: isAuthenticated && user?.id ? user.id : null,
                    event_name: cartMeta.occasion_name?.trim() || 'Special add-ons',
                    contact_name: cartMeta.contact_name.trim(),
                    contact_mobile: mobileDigits,
                    contact_email: cartMeta.contact_email?.trim() || null,
                    event_date: cartMeta.event_date || null,
                    location_preference:
                        cartMeta.delivery_mode === 'address'
                            ? cartMeta.delivery_address?.trim() || null
                            : cartMeta.venue_selection?.trim() || null,
                    venue_preference:
                        cartMeta.delivery_mode === 'venue'
                            ? cartMeta.venue_selection?.trim() || null
                            : null,
                };
                const { data: created, error: e1 } = accessToken
                    ? await api.createCartWithAuth(createPayload, accessToken)
                    : await api.createCart(createPayload);
                if (e1) throw new Error(e1.message);
                cid = created?.id;
                if (cid) {
                    setCartId(cid);
                    await setGlobalCartId(cid, created?.session_id ?? undefined);
                }
            } else {
                const updatePayload = {
                    event_name: cartMeta.occasion_name?.trim() || 'Special add-ons',
                    contact_name: cartMeta.contact_name.trim(),
                    contact_mobile: mobileDigits,
                    contact_email: cartMeta.contact_email?.trim() || null,
                    event_date: cartMeta.event_date || null,
                    location_preference:
                        cartMeta.delivery_mode === 'address'
                            ? cartMeta.delivery_address?.trim() || null
                            : cartMeta.venue_selection?.trim() || null,
                    venue_preference:
                        cartMeta.delivery_mode === 'venue'
                            ? cartMeta.venue_selection?.trim() || null
                            : null,
                };
                const cartPatchOpts = { cartOwnerSession: cartOwnerAnonSession };
                const { error: eUp } = accessToken
                    ? await api.updateCartWithAuth(cid, updatePayload, accessToken, cartPatchOpts)
                    : await api.updateCart(cid, updatePayload, cartPatchOpts);
                if (eUp) throw new Error(eUp.message);
            }
            if (!cid) throw new Error('Could not create cart');

            for (const [serviceId, row] of selected) {
                const unit = numPrice(row.price);
                if (unit == null || unit <= 0) {
                    throw new Error('Invalid price for ' + row.name);
                }
                const addPayload = {
                    cart_id: cid,
                    service_id: serviceId,
                    quantity: 1,
                    unit_price: unit,
                    options: {
                        tier: row.tierKey || 'price_basic',
                        occasion: occasionName || 'Special add-ons',
                        category: 'Special add-ons (all occasions)',
                        special_catalog: true,
                        ...(row.qtyLabel ? { qty_label: row.qtyLabel } : {}),
                        ...(row.subVariety ? { sub_variety: row.subVariety } : {}),
                    },
                };
                const { error: e2 } = accessToken
                    ? await api.addCartItemWithAuth(addPayload, accessToken)
                    : await api.addCartItem(addPayload);
                if (e2) throw new Error(e2.message);
            }
            await refreshCartCount?.(cid);
            setEventForm({
                role: null,
                contact_name: cartMeta.contact_name.trim(),
                contact_mobile: mobileDigits,
                contact_email: cartMeta.contact_email?.trim() || null,
                event_date: cartMeta.event_date || null,
                guest_count: null,
                location_preference:
                    cartMeta.delivery_mode === 'address'
                        ? cartMeta.delivery_address?.trim() || null
                        : cartMeta.venue_selection?.trim() || null,
                venue_preference:
                    cartMeta.delivery_mode === 'venue'
                        ? cartMeta.venue_selection?.trim() || null
                        : null,
                planned_budget: null,
                location_kind: cartMeta.delivery_mode === 'venue' ? 'venue' : 'own_place',
                venue_detail:
                    cartMeta.delivery_mode === 'venue' ? cartMeta.venue_selection?.trim() || null : null,
            });
            showToast({
                variant: 'success',
                title: 'Added to cart',
                message: `${selected.size} item(s) added.`,
                action: { label: 'View cart', onPress: () => navigation.navigate('Cart') },
            });
        } catch (e) {
            showToast({ variant: 'error', title: 'Cart', message: e?.message || 'Could not add items.' });
        } finally {
            setAdding(false);
        }
        return true;
    };

    const addToCart = () => {
        if (selected.size === 0) {
            showToast({ variant: 'info', title: 'Select items', message: 'Choose at least one special add-on.' });
            return;
        }
        setDetailsModalVisible(true);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <View style={[styles.backCircle, { backgroundColor: isDarkMode ? '#2D3142' : '#F3F4F6' }]}>
                        <Ionicons name="arrow-back" size={20} color={theme.text} />
                    </View>
                </TouchableOpacity>
                <View style={styles.headerTextWrap}>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('special_catalog_title')}</Text>
                    <Text style={[styles.headerSub, { color: theme.textLight }]}>
                        {tr('special_catalog_header_sub')}
                    </Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: theme.textLight }]}>{tr('special_catalog_loading')}</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
                    showsVerticalScrollIndicator={false}
                >
                    <LinearGradient
                        colors={isDarkMode ? ['#4c1d95', '#1e1b4b'] : ['#5B21B6', '#C2410C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.hero}
                    >
                        <View style={styles.heroIconRow}>
                            <Ionicons name="gift" size={26} color="#FFF" />
                            <View style={styles.heroBadge}>
                                <Text style={styles.heroBadgeText}>{tr('special_catalog_badge')}</Text>
                            </View>
                        </View>
                        <Text style={styles.heroTitle}>{tr('special_catalog_hero_title')}</Text>
                        <Text style={styles.heroSub}>{tr('special_catalog_hero_sub')}</Text>
                    </LinearGradient>

                    <View style={styles.actionRow}>
                        {!showAllServices && selectedServiceId ? (
                            <Text style={[styles.actionHint, { color: theme.textLight }]}>
                                Showing selected add-on details
                            </Text>
                        ) : (
                            <Text style={[styles.actionHint, { color: theme.textLight }]}>
                                Tap any card to expand details
                            </Text>
                        )}
                        {!showAllServices && selectedServiceId ? (
                            <TouchableOpacity
                                style={[styles.actionPill, { borderColor: colors.primary + '4D', backgroundColor: colors.primary + '10' }]}
                                onPress={() => setShowAllServices(true)}
                                activeOpacity={0.86}
                            >
                                <Ionicons name="list" size={14} color={colors.primary} />
                                <Text style={[styles.actionPillText, { color: colors.primary }]}>Select all</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.actionPill, { borderColor: colors.primary + '4D', backgroundColor: colors.primary + '10' }]}
                                onPress={toggleSelectAllVisible}
                                activeOpacity={0.86}
                            >
                                <Ionicons
                                    name={allVisibleSelected ? 'close-circle' : 'checkmark-done-circle'}
                                    size={14}
                                    color={colors.primary}
                                />
                                <Text style={[styles.actionPillText, { color: colors.primary }]}>
                                    {allVisibleSelected ? 'Clear all' : 'Select all'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {filteredServices.length === 0 ? (
                        <Text style={[styles.empty, { color: theme.textLight }]}>{tr('special_catalog_empty')}</Text>
                    ) : (
                        <FlatList
                            data={filteredServices}
                            scrollEnabled={false}
                            keyExtractor={(s) => s.id}
                            renderItem={({ item: svc }) => {
                                const tiers = getOfferableTierRows(svc);
                                const isOn = selected.has(svc.id);
                                const sel = selected.get(svc.id);
                                const isExpanded = expandedServiceId === svc.id;
                                const tierPrices = tiers.map((t) => Number(t.value)).filter((v) => Number.isFinite(v) && v > 0);
                                const low = tierPrices.length ? Math.min(...tierPrices) : null;
                                return (
                                    <View
                                        style={[
                                            styles.gridCard,
                                            {
                                                width: '100%',
                                                backgroundColor: theme.card,
                                                borderColor: isOn ? colors.primary : theme.border,
                                            },
                                            isOn && { shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
                                        ]}
                                    >
                                        <TouchableOpacity
                                            onPress={() =>
                                                setExpandedServiceId((prev) => (prev === svc.id ? null : svc.id))
                                            }
                                            activeOpacity={0.92}
                                        >
                                            <View style={styles.cardImageWrap}>
                                                <View style={[styles.cardImageFrame, { backgroundColor: isDarkMode ? '#101826' : '#FFFFFF' }]}>
                                                    {svc.video_url ? (
                                                        <StorageVideoCover
                                                            uri={svc.video_url}
                                                            fallbackImageUri={svc.image_url}
                                                            style={styles.cardImage}
                                                            resizeMode="cover"
                                                        />
                                                    ) : svc.image_url ? (
                                                        <Image source={{ uri: svc.image_url }} style={styles.cardImage} resizeMode="cover" />
                                                    ) : (
                                                        <LinearGradient
                                                            colors={isDarkMode ? ['#334155', '#1e293b'] : ['#E2E8F0', '#F8FAFC']}
                                                            style={styles.cardImagePlaceholder}
                                                        >
                                                            <Ionicons name="sparkles" size={36} color={colors.primary} />
                                                        </LinearGradient>
                                                    )}
                                                </View>
                                                <View
                                                    style={[
                                                        styles.checkFloating,
                                                        {
                                                            borderColor: isOn ? '#FFF' : 'rgba(255,255,255,0.5)',
                                                            backgroundColor: isOn ? colors.primary : 'rgba(0,0,0,0.35)',
                                                        },
                                                    ]}
                                                >
                                                    {isOn ? <Ionicons name="checkmark" size={14} color="#FFF" /> : null}
                                                </View>
                                            </View>
                                            <View style={styles.cardBody}>
                                                <View style={styles.cardTitleRow}>
                                                    <Text style={[styles.svcName, { color: theme.text }]} numberOfLines={2}>
                                                        {svc.name}
                                                        {svc.price_unit ? (
                                                            <Text style={[styles.svcUnitInline, { color: theme.textLight }]}>
                                                                {` (${svc.price_unit})`}
                                                            </Text>
                                                        ) : null}
                                                    </Text>
                                                    <Ionicons
                                                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                        size={18}
                                                        color={theme.textLight}
                                                    />
                                                </View>
                                                {low != null ? (
                                                    <Text style={[styles.cardFromPrice, { color: colors.primary }]}>
                                                        from ₹{low.toLocaleString('en-IN')}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </TouchableOpacity>
                                        {isExpanded ? (
                                            <View style={[styles.expandedBody, { borderTopColor: theme.border }]}>
                                                {svc.description ? (
                                                    <Text style={[styles.svcDesc, { color: theme.textLight }]} numberOfLines={3}>
                                                        {svc.description}
                                                    </Text>
                                                ) : null}
                                                {tiers.length === 0 ? (
                                                    <Text style={[styles.tierHint, { color: theme.textLight }]}>No tiers priced</Text>
                                                ) : (
                                                    <View style={styles.tierStack}>
                                                        {tiers.map((t) => {
                                                            const active = sel?.tierKey === t.key;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={t.key}
                                                                    onPress={() => selectTier(svc, t)}
                                                                    style={[
                                                                        styles.tierChip,
                                                                        {
                                                                            borderColor: active ? t.color : theme.border,
                                                                            backgroundColor: active ? t.color + '22' : theme.background,
                                                                        },
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.tierChipLabel, { color: theme.text }]} numberOfLines={1}>
                                                                        {t.label}
                                                                    </Text>
                                                                    <Text style={[styles.tierChipPrice, { color: t.color }]}>
                                                                        ₹{t.value.toLocaleString('en-IN')}
                                                                    </Text>
                                                                    {t.subVariety ? (
                                                                        <Text style={[styles.tierSubVariety, { color: theme.textLight }]} numberOfLines={2}>
                                                                            {t.subVariety}
                                                                        </Text>
                                                                    ) : null}
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                )}
                                                <TouchableOpacity
                                                    style={[
                                                        styles.selectOneBtn,
                                                        {
                                                            borderColor: isOn ? colors.primary : theme.border,
                                                            backgroundColor: isOn ? colors.primary + '15' : theme.background,
                                                        },
                                                    ]}
                                                    onPress={() => toggleService(svc)}
                                                    activeOpacity={0.85}
                                                >
                                                    <Ionicons
                                                        name={isOn ? 'checkmark-circle' : 'add-circle-outline'}
                                                        size={16}
                                                        color={isOn ? colors.primary : theme.textLight}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.selectOneBtnText,
                                                            { color: isOn ? colors.primary : theme.text },
                                                        ]}
                                                    >
                                                        {isOn ? 'Selected' : 'Select add-on'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            }}
                        />
                    )}
                </ScrollView>
            )}

            <View
                style={[
                    styles.bottomBar,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        paddingBottom: Math.max(insets.bottom, 10),
                    },
                ]}
            >
                <View style={{ flex: 1 }}>
                    <Text style={[styles.totalLabel, { color: theme.textLight }]}>Estimated</Text>
                    <Text style={[styles.total, { color: theme.text }]}>₹{total.toLocaleString('en-IN')}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.cta, selected.size === 0 && styles.ctaDisabled]}
                    onPress={addToCart}
                    disabled={adding || selected.size === 0}
                >
                    {adding ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <LinearGradient
                            colors={selected.size > 0 ? [colors.primary, '#EA580C'] : ['#9CA3AF', '#6B7280']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.ctaGrad}
                        >
                            <Ionicons name="cart" size={22} color="#FFF" />
                            <Text style={styles.ctaText}>Add to cart</Text>
                        </LinearGradient>
                    )}
                </TouchableOpacity>
            </View>

            <BottomTabBar navigation={navigation} activeRoute="Home" />

            <Modal
                visible={detailsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailsModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={styles.modalWrap}
                    >
                        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.modalHeadRow}>
                                <TouchableOpacity
                                    onPress={() => {
                                        if (detailsStep > 0) setDetailsStep((s) => s - 1);
                                    }}
                                    style={styles.modalHeadIcon}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    disabled={detailsStep === 0}
                                >
                                    {detailsStep > 0 ? (
                                        <Ionicons name="chevron-back" size={24} color={theme.text} />
                                    ) : (
                                        <View style={{ width: 24 }} />
                                    )}
                                </TouchableOpacity>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                                        {tr('special_checkout_title')}
                                    </Text>
                                    <Text style={[styles.modalProgress, { color: theme.textLight }]}>
                                        {String(tr('userinfo_step_progress'))
                                            .replace('{current}', String(detailsStep + 1))
                                            .replace('{total}', '3')}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setDetailsModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Ionicons name="close" size={22} color={theme.textLight} />
                                </TouchableOpacity>
                            </View>
                            <Text style={[styles.modalSub, { color: theme.textLight }]}>{tr('special_checkout_sub')}</Text>
                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                                style={styles.modalScroll}
                                contentContainerStyle={styles.modalScrollContent}
                            >
                                {detailsStep === 0 ? (
                                    <>
                                        <Text style={[styles.modalStepTitle, { color: theme.text }]}>{tr('userinfo_special_step1')}</Text>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('special_occasion_label')}</Text>
                                            <TextInput
                                                style={[
                                                    styles.modalInput,
                                                    styles.modalInputTallText,
                                                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                ]}
                                                value={cartMeta.occasion_name}
                                                onChangeText={(occasion_name) => setCartMeta((p) => ({ ...p, occasion_name }))}
                                                placeholder={tr('userinfo_special_occasion_ph')}
                                                placeholderTextColor={theme.textLight}
                                            />
                                        </View>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('special_event_date_label')}</Text>
                                            <TouchableOpacity
                                                style={[
                                                    styles.modalInput,
                                                    styles.modalDateBtn,
                                                    { borderColor: theme.border, backgroundColor: theme.background },
                                                ]}
                                                onPress={() => setShowDatePicker(true)}
                                            >
                                                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                                <Text style={[styles.modalDateTextLg, { color: cartMeta.event_date ? theme.text : theme.textLight }]}>
                                                    {cartMeta.event_date
                                                        ? new Date(cartMeta.event_date).toLocaleDateString(undefined, {
                                                              day: 'numeric',
                                                              month: 'short',
                                                              year: 'numeric',
                                                          })
                                                        : tr('home_select_date')}
                                                </Text>
                                            </TouchableOpacity>
                                            {showDatePicker ? (
                                                <DateTimePicker
                                                    value={cartMeta.event_date ? new Date(cartMeta.event_date) : new Date()}
                                                    mode="date"
                                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                    minimumDate={new Date()}
                                                    onChange={(_, d) => {
                                                        setShowDatePicker(false);
                                                        if (d) setCartMeta((p) => ({ ...p, event_date: d.toISOString() }));
                                                    }}
                                                />
                                            ) : null}
                                        </View>
                                    </>
                                ) : null}
                                {detailsStep === 1 ? (
                                    <>
                                        <Text style={[styles.modalStepTitle, { color: theme.text }]}>{tr('userinfo_special_step2')}</Text>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('special_delivery_label')}</Text>
                                            <View style={styles.deliveryModeRow}>
                                                {[
                                                    { key: 'venue', label: tr('special_venue_mode') },
                                                    { key: 'address', label: tr('special_address_mode') },
                                                ].map((opt) => (
                                                    <TouchableOpacity
                                                        key={opt.key}
                                                        style={[
                                                            styles.deliveryModeChip,
                                                            styles.deliveryModeChipLg,
                                                            { borderColor: theme.border, backgroundColor: theme.background },
                                                            cartMeta.delivery_mode === opt.key && {
                                                                borderColor: colors.primary,
                                                                backgroundColor: colors.primary + '10',
                                                            },
                                                        ]}
                                                        onPress={() => setCartMeta((p) => ({ ...p, delivery_mode: opt.key }))}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.deliveryModeText,
                                                                styles.deliveryModeTextLg,
                                                                { color: cartMeta.delivery_mode === opt.key ? colors.primary : theme.text },
                                                            ]}
                                                        >
                                                            {opt.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                        {cartMeta.delivery_mode === 'venue' ? (
                                            <View style={styles.modalInputGroup}>
                                                <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('special_venue_field')}</Text>
                                                <TextInput
                                                    style={[
                                                        styles.modalInput,
                                                        styles.modalInputTallText,
                                                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                    ]}
                                                    value={cartMeta.venue_selection}
                                                    onChangeText={(venue_selection) => setCartMeta((p) => ({ ...p, venue_selection }))}
                                                    placeholder={tr('home_venue_ph')}
                                                    placeholderTextColor={theme.textLight}
                                                />
                                            </View>
                                        ) : (
                                            <View style={styles.modalInputGroup}>
                                                <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('special_address_field')}</Text>
                                                <TextInput
                                                    style={[
                                                        styles.modalInput,
                                                        styles.modalInputTall,
                                                        styles.modalInputTallText,
                                                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                    ]}
                                                    value={cartMeta.delivery_address}
                                                    onChangeText={(delivery_address) => setCartMeta((p) => ({ ...p, delivery_address }))}
                                                    placeholder={tr('special_address_field')}
                                                    placeholderTextColor={theme.textLight}
                                                    multiline
                                                />
                                                <TouchableOpacity
                                                    style={[styles.useCurrentLocBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                                                    onPress={fillCurrentLocation}
                                                >
                                                    <Ionicons name="navigate" size={18} color={colors.primary} />
                                                    <Text style={[styles.useCurrentLocText, { color: theme.text }]}>{tr('home_use_current_location')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </>
                                ) : null}
                                {detailsStep === 2 ? (
                                    <>
                                        <Text style={[styles.modalStepTitle, { color: theme.text }]}>{tr('userinfo_special_step3')}</Text>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('home_name')}</Text>
                                            <TextInput
                                                style={[
                                                    styles.modalInput,
                                                    styles.modalInputTallText,
                                                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                ]}
                                                value={cartMeta.contact_name}
                                                onChangeText={(contact_name) => setCartMeta((p) => ({ ...p, contact_name }))}
                                                placeholder={tr('userinfo_ph_name')}
                                                placeholderTextColor={theme.textLight}
                                            />
                                        </View>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('home_phone')}</Text>
                                            <TextInput
                                                style={[
                                                    styles.modalInput,
                                                    styles.modalInputTallText,
                                                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                ]}
                                                value={cartMeta.contact_mobile}
                                                onChangeText={(contact_mobile) => setCartMeta((p) => ({ ...p, contact_mobile }))}
                                                keyboardType="phone-pad"
                                                placeholder={tr('userinfo_ph_phone')}
                                                placeholderTextColor={theme.textLight}
                                            />
                                        </View>
                                        <View style={styles.modalInputGroup}>
                                            <Text style={[styles.modalLabel, { color: theme.textLight }]}>{tr('home_email')}</Text>
                                            <TextInput
                                                style={[
                                                    styles.modalInput,
                                                    styles.modalInputTallText,
                                                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                                                ]}
                                                value={cartMeta.contact_email}
                                                onChangeText={(contact_email) => setCartMeta((p) => ({ ...p, contact_email }))}
                                                keyboardType="email-address"
                                                placeholder={tr('userinfo_ph_email')}
                                                placeholderTextColor={theme.textLight}
                                            />
                                        </View>
                                    </>
                                ) : null}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.modalCta, { backgroundColor: colors.primary }]}
                                onPress={async () => {
                                    if (detailsStep < 2) {
                                        goSpecialCheckoutNext();
                                        return;
                                    }
                                    const ok = await proceedAddToCart();
                                    if (ok) setDetailsModalVisible(false);
                                }}
                                disabled={adding}
                            >
                                {adding ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.modalCtaText}>
                                        {detailsStep < 2 ? tr('special_step_next') : tr('special_save_add')}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    backBtn: { marginRight: 8 },
    backCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextWrap: { flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12, flexShrink: 1, lineHeight: 18 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    scroll: { paddingHorizontal: 16, paddingTop: 12 },
    hero: {
        borderRadius: 16,
        padding: 18,
        marginBottom: 18,
    },
    heroIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    heroBadge: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    heroBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
    heroTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 10 },
    heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 19, marginTop: 6 },
    empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
    actionRow: {
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    actionHint: {
        flex: 1,
        fontSize: 12,
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    actionPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    gridCard: {
        borderRadius: 12,
        borderWidth: 1.5,
        padding: 0,
        overflow: 'hidden',
        marginBottom: 12,
    },
    cardImageWrap: {
        width: '100%',
        height: 196,
        position: 'relative',
        padding: 10,
        backgroundColor: 'transparent',
    },
    cardImageFrame: {
        width: '100%',
        height: '100%',
        borderRadius: 11,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(124,58,237,0.22)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.09,
        shadowRadius: 7,
        elevation: 3,
    },
    cardImage: { width: '100%', height: '100%' },
    cardImagePlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkFloating: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 26,
        height: 26,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
    cardTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    cardFromPrice: {
        marginTop: 6,
        fontSize: 15,
        fontWeight: '800',
    },
    expandedBody: {
        borderTopWidth: 1,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 10,
    },
    gridCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    tierStack: { marginTop: 6, gap: 8 },
    tierChip: {
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 96,
    },
    tierChipLabel: { fontSize: 12, fontWeight: '700' },
    tierChipPrice: { fontSize: 16, fontWeight: '800', marginTop: 2 },
    tierSubVariety: { fontSize: 11, marginTop: 4, lineHeight: 15 },
    tierHint: { fontSize: 13, marginTop: 6 },
    selectOneBtn: {
        marginTop: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    selectOneBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    card: {
        flexDirection: 'row',
        borderRadius: 16,
        borderWidth: 1.5,
        padding: 14,
        marginBottom: 12,
        overflow: 'hidden',
        alignItems: 'flex-start',
    },
    check: {
        width: 28,
        height: 28,
        borderRadius: 8,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    svcName: { fontSize: 17, fontWeight: '800' },
    svcUnitInline: { fontSize: 12, fontWeight: '600' },
    svcDesc: { fontSize: 14, lineHeight: 21, marginTop: 4 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10, flexWrap: 'wrap' },
    price: { fontSize: 18, fontWeight: '800' },
    unit: { fontSize: 12 },
    city: { fontSize: 12 },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 72,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        gap: 12,
    },
    totalLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
    total: { fontSize: 22, fontWeight: '800' },
    cta: { borderRadius: 14, overflow: 'hidden', minWidth: width * 0.42 },
    ctaDisabled: { opacity: 0.7 },
    ctaGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    ctaText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalWrap: {
        width: '100%',
    },
    modalCard: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 24,
    },
    modalHeadRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    modalHeadIcon: {
        width: 36,
        paddingTop: 2,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
    },
    modalProgress: {
        fontSize: 14,
        marginTop: 4,
        fontWeight: '600',
    },
    modalScroll: {
        maxHeight: Dimensions.get('window').height * 0.5,
    },
    modalScrollContent: {
        paddingBottom: 12,
    },
    modalStepTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 8,
        marginTop: 4,
    },
    modalInputTallText: {
        fontSize: 18,
        minHeight: 52,
        paddingVertical: 12,
    },
    modalDateTextLg: {
        fontSize: 18,
        flex: 1,
    },
    deliveryModeChipLg: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
    },
    deliveryModeTextLg: {
        fontSize: 16,
    },
    modalSub: {
        fontSize: 14,
        marginTop: 6,
        marginBottom: 12,
        lineHeight: 20,
    },
    modalInputGroup: {
        marginTop: 8,
    },
    modalLabel: {
        fontSize: 15,
        marginBottom: 8,
        fontWeight: '700',
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 12,
        minHeight: 48,
        paddingHorizontal: 14,
        fontSize: 14,
    },
    modalInputTall: {
        minHeight: 80,
        height: 80,
        paddingTop: 10,
        textAlignVertical: 'top',
    },
    modalDateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalDateText: {
        fontSize: 14,
    },
    deliveryModeRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    deliveryModeChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    deliveryModeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    useCurrentLocBtn: {
        marginTop: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    useCurrentLocText: {
        fontSize: 13,
        fontWeight: '600',
    },
    modalCta: {
        marginTop: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
    },
    modalCtaText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '700',
    },
});
