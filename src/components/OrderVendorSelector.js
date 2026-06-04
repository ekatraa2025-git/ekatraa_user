import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import VendorGallerySlider from './VendorGallerySlider';
import { api } from '../services/api';
import { getVendorImageUrl, resolveStorageUrl } from '../services/supabase';
import { useToast } from '../context/ToastContext';

/**
 * Order-confirmation vendor picker.
 *
 * Renders the customer's selected services grouped from `/api/public/vendors/match`,
 * with one card per matched vendor. Cards expose the "Recommended" highlight, a tappable
 * select state, an auto-scrolling gallery, and either real contact details (full payment)
 * or an Ekatraa fallback note (advance payment).
 *
 * `requireSelection=true` (full payment) disables the confirm button until every service
 * has a chosen vendor. `requireSelection=false` (advance) keeps it optional with a
 * "Skip — Ekatraa will allocate" affordance.
 *
 * On confirm, posts to `/api/public/orders/[id]/allocate` so the chosen vendors are
 * notified and the order moves to status=allocated.
 */
function OrderVendorSelector({
    orderId,
    accessToken,
    theme,
    onAllocated,
    initiallyOpen = true,
    navigation,
    selectionRequest,
    onSelectionApplied,
}) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [matchPayload, setMatchPayload] = useState(null);
    const [allocations, setAllocations] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState(null);
    const [open, setOpen] = useState(initiallyOpen);
    const allocatedNotified = useRef(false);
    const [aiRecommendation, setAiRecommendation] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);

    const load = useCallback(async () => {
        if (!orderId || !accessToken) return;
        setLoading(true);
        setLoadError(null);
        const [matchRes, allocRes] = await Promise.all([
            api.getOrderVendorMatches(orderId, accessToken),
            api.getOrderAllocations(orderId, accessToken),
        ]);
        setLoading(false);
        if (matchRes.error) {
            setLoadError(matchRes.error?.message || 'Could not load vendors for this order.');
            return;
        }
        setMatchPayload(matchRes.data || null);
        const seeded = {};
        const existing = Array.isArray(allocRes?.data?.allocations) ? allocRes.data.allocations : [];
        for (const row of existing) {
            if (row?.order_item_id && row?.vendor_id) {
                seeded[row.order_item_id] = row.vendor_id;
            }
        }
        setAllocations(seeded);
    }, [orderId, accessToken]);

    useEffect(() => {
        load();
    }, [load]);

    const paymentTier = matchPayload?.payment_tier || 'unpaid';
    const isFullPayment = paymentTier === 'full';
    const requireSelection = isFullPayment;
    const services = useMemo(
        () => (Array.isArray(matchPayload?.services) ? matchPayload.services : []),
        [matchPayload]
    );

    const allChosen = useMemo(() => {
        if (services.length === 0) return false;
        return services.every((s) => s?.order_item_id && allocations[s.order_item_id]);
    }, [services, allocations]);

    const handlePickVendor = useCallback((orderItemId, vendorId) => {
        if (!orderItemId || !vendorId) return;
        setAllocations((prev) => ({ ...prev, [orderItemId]: vendorId }));
        setSubmitMessage(null);
    }, []);

    // Selection arrives via route params when the user picks a vendor inside
    // VendorDetail. We apply it once (keyed on `ts`) and tell the parent to
    // clear the param so we don't re-fire on re-render.
    const lastAppliedSelectionRef = useRef(null);
    useEffect(() => {
        if (!selectionRequest || !selectionRequest.ts) return;
        if (lastAppliedSelectionRef.current === selectionRequest.ts) return;
        const { orderItemId, vendorId } = selectionRequest;
        if (orderItemId && vendorId) {
            handlePickVendor(orderItemId, vendorId);
            lastAppliedSelectionRef.current = selectionRequest.ts;
            onSelectionApplied?.();
            showToast({
                variant: 'success',
                title: 'Vendor selected',
                message: 'Tap "Confirm" below to notify them.',
                duration: 3500,
            });
        }
    }, [selectionRequest, handlePickVendor, onSelectionApplied, showToast]);

    const handleOpenVendorDetail = useCallback(
        (service, vendor) => {
            if (!navigation || !vendor?.id) return;
            // `navigation.getState()` can throw if this component is mounted
            // outside an active navigator (e.g. during teardown). Wrap defensively
            // so a stale render never tears the screen down with a crash.
            let parentRouteName = null;
            try {
                const state = navigation.getState?.();
                if (state && Array.isArray(state.routes) && typeof state.index === 'number') {
                    parentRouteName = state.routes[state.index]?.name ?? null;
                }
            } catch (e) {
                parentRouteName = null;
            }
            try {
                navigation.navigate('VendorDetail', {
                    vendorId: vendor.id,
                    vendor,
                    fromOrderId: orderId,
                    orderItemId: service?.order_item_id || null,
                    paymentTier,
                    parentRoute: parentRouteName,
                    serviceContext: {
                        service_id: service?.service_id || null,
                        service_name: service?.service_name || null,
                        category: service?.category || null,
                    },
                });
            } catch (e) {
                showToast?.({
                    variant: 'error',
                    title: 'Could not open vendor',
                    message: 'Please go back and try again.',
                    duration: 3500,
                });
            }
        },
        [navigation, orderId, paymentTier, showToast]
    );

    const aiNoteByService = useMemo(() => {
        const map = new Map();
        const list = Array.isArray(aiRecommendation?.recommendations)
            ? aiRecommendation.recommendations
            : [];
        for (const r of list) {
            if (r?.service_id && r?.ai_note) map.set(r.service_id, r.ai_note);
        }
        return map;
    }, [aiRecommendation]);

    const handleFetchAiTake = useCallback(async () => {
        if (!orderId || !accessToken || aiLoading) return;
        setAiLoading(true);
        setAiError(null);
        const { data, error } = await api.getOrderVendorRecommendation(orderId, accessToken);
        setAiLoading(false);
        if (error) {
            const msg = error?.message || 'Ekatraa AI is taking a moment — try again shortly.';
            setAiError(msg);
            showToast({
                variant: 'info',
                title: 'Could not load AI take',
                message: msg,
                duration: 4000,
            });
            return;
        }
        setAiRecommendation(data || null);
    }, [orderId, accessToken, aiLoading, showToast]);

    const handleConfirm = useCallback(async () => {
        if (!orderId || !accessToken) return;
        const rows = Object.entries(allocations)
            .filter(([orderItemId, vendorId]) => orderItemId && vendorId)
            .map(([order_item_id, vendor_id]) => ({ order_item_id, vendor_id }));
        if (rows.length === 0) {
            const msg = 'Pick a vendor for at least one service first.';
            setSubmitMessage(msg);
            showToast({ variant: 'info', title: 'Almost there', message: msg, duration: 4000 });
            return;
        }
        if (requireSelection && !allChosen) {
            const msg = 'Full-payment orders need a vendor chosen for every service.';
            setSubmitMessage(msg);
            showToast({ variant: 'info', title: 'One more step', message: msg, duration: 4500 });
            return;
        }
        setSubmitting(true);
        setSubmitMessage(null);
        const { error } = await api.allocateOrderVendors(orderId, rows, accessToken);
        setSubmitting(false);
        if (error) {
            const msg = error?.message || 'Could not save your vendor selection.';
            setSubmitMessage(msg);
            showToast({
                variant: 'error',
                title: 'Could not confirm vendors',
                message: msg,
                duration: 5000,
            });
            return;
        }
        const successMsg = 'Vendors notified. They will reach out shortly.';
        setSubmitMessage(successMsg);
        showToast({
            variant: 'success',
            title: isFullPayment ? 'Vendors confirmed' : 'Pre-selection saved',
            message: rows.length === 1
                ? '1 vendor notified for your order.'
                : `${rows.length} vendors notified for your order.`,
            duration: 4500,
        });
        if (!allocatedNotified.current) {
            allocatedNotified.current = true;
            onAllocated?.({ allocations: rows });
        }
    }, [orderId, accessToken, allocations, requireSelection, allChosen, isFullPayment, onAllocated, showToast]);

    if (!orderId || !accessToken) return null;

    return (
        <View style={[styles.wrapper, { backgroundColor: theme?.card || '#FFFFFF' }]}>
            <TouchableOpacity
                style={styles.headerRow}
                onPress={() => setOpen((v) => !v)}
                activeOpacity={0.85}
            >
                <View style={styles.headerLeft}>
                    <Ionicons name="people-outline" size={22} color={colors.primary} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.headerTitle, { color: theme?.text || '#111' }]}>
                            {isFullPayment ? 'Choose your vendors' : 'Suggested partners'}
                        </Text>
                        <Text style={[styles.headerSub, { color: theme?.textLight || '#666' }]} numberOfLines={2}>
                            {isFullPayment
                                ? 'Full payment confirmed. Tap to confirm the vendor for each service so they can begin coordination.'
                                : 'Preview your matched vendors. We will finalize after the balance is paid — or you can pre-select below.'}
                        </Text>
                    </View>
                </View>
                <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={theme?.textLight || '#666'}
                />
            </TouchableOpacity>

            {open ? (
                <View style={styles.body}>
                    {loading ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={colors.primary} />
                            <Text style={[styles.loadingText, { color: theme?.textLight || '#666' }]}>
                                Finding the best vendors near you…
                            </Text>
                        </View>
                    ) : loadError ? (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
                            <Text style={styles.errorText}>{loadError}</Text>
                            <TouchableOpacity onPress={load} style={styles.retryBtn}>
                                <Text style={styles.retryBtnText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : services.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Ionicons name="search-outline" size={20} color={theme?.textLight || '#666'} />
                            <Text style={[styles.emptyText, { color: theme?.textLight || '#666' }]}>
                                We could not match any active vendors in this area yet. Ekatraa will allocate manually and notify you.
                            </Text>
                        </View>
                    ) : (
                        <>
                            <AiTakeCard
                                theme={theme}
                                loading={aiLoading}
                                error={aiError}
                                recommendation={aiRecommendation}
                                onFetch={handleFetchAiTake}
                            />
                            {services.map((service) => (
                                <ServiceBlock
                                    key={service.order_item_id || service.service_id}
                                    service={service}
                                    theme={theme}
                                    isFullPayment={isFullPayment}
                                    selectedVendorId={allocations[service.order_item_id]}
                                    onPickVendor={handlePickVendor}
                                    onOpenVendorDetail={handleOpenVendorDetail}
                                    aiNote={aiNoteByService.get(service.service_id) || null}
                                />
                            ))}
                        </>
                    )}

                    {services.length > 0 ? (
                        <View style={styles.footer}>
                            {submitMessage ? (
                                <Text
                                    style={[
                                        styles.submitMessage,
                                        { color: submitMessage.startsWith('Vendors notified') ? '#16a34a' : '#b91c1c' },
                                    ]}
                                >
                                    {submitMessage}
                                </Text>
                            ) : null}
                            <TouchableOpacity
                                onPress={handleConfirm}
                                disabled={submitting}
                                style={[
                                    styles.confirmBtn,
                                    { opacity: submitting ? 0.7 : 1 },
                                ]}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.confirmBtnText}>
                                        {isFullPayment ? 'Confirm selected vendors' : 'Pre-select these vendors'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                            {!isFullPayment ? (
                                <Text style={[styles.skipNote, { color: theme?.textLight || '#666' }]}>
                                    Optional today. Ekatraa will reach out before final allocation.
                                </Text>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

function ServiceBlock({
    service,
    theme,
    isFullPayment,
    selectedVendorId,
    onPickVendor,
    onOpenVendorDetail,
    aiNote,
}) {
    const vendors = Array.isArray(service?.vendors) ? service.vendors : [];
    const isDefaultBlock = !!service?.is_default_block;
    const fallbackReason = service?.fallback_reason || null;
    const fallbackCopy = isDefaultBlock
        ? fallbackReason === 'curated_default'
            ? 'No vendor in your area matches this service yet. These are top-rated Ekatraa partners — Ekatraa will coordinate suitability.'
            : 'No exact portfolio match nearby, so we widened the search to similar Ekatraa partners.'
        : null;
    const countLabel = isDefaultBlock
        ? `${vendors.length} curated pick${vendors.length === 1 ? '' : 's'}`
        : `${vendors.length} match${vendors.length === 1 ? '' : 'es'}`;
    return (
        <View style={[styles.serviceBlock, { borderColor: theme?.border || '#E5E7EB' }]}>
            <View style={styles.serviceHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.serviceCat, { color: theme?.textLight || '#666' }]}>
                        {(service?.category || 'Service').toUpperCase()}
                    </Text>
                    <Text style={[styles.serviceName, { color: theme?.text || '#111' }]} numberOfLines={1}>
                        {service?.service_name || 'Selected service'}
                    </Text>
                </View>
                <View
                    style={[
                        styles.serviceCountPill,
                        isDefaultBlock
                            ? { backgroundColor: '#FEF3C7' }
                            : null,
                    ]}
                >
                    <Text
                        style={[
                            styles.serviceCountText,
                            isDefaultBlock ? { color: '#92400E' } : null,
                        ]}
                    >
                        {countLabel}
                    </Text>
                </View>
            </View>

            {fallbackCopy ? (
                <View style={styles.fallbackBanner}>
                    <Ionicons name="information-circle-outline" size={14} color="#92400E" />
                    <Text style={styles.fallbackBannerText}>{fallbackCopy}</Text>
                </View>
            ) : null}

            {aiNote ? (
                <View style={styles.aiNoteRow}>
                    <Ionicons name="sparkles" size={13} color={colors.primary} />
                    <Text style={[styles.aiNoteText, { color: theme?.text || '#111' }]}>
                        {aiNote}
                    </Text>
                </View>
            ) : null}

            {vendors.length === 0 ? (
                <View style={styles.serviceEmpty}>
                    <Ionicons name="people-outline" size={18} color={theme?.textLight || '#666'} />
                    <Text style={[styles.serviceEmptyText, { color: theme?.textLight || '#666' }]}>
                        No active vendors right now. Ekatraa will allocate manually.
                    </Text>
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardsRow}
                >
                    {vendors.map((vendor) => (
                        <VendorCard
                            key={vendor.id}
                            vendor={vendor}
                            theme={theme}
                            isFullPayment={isFullPayment}
                            selected={selectedVendorId === vendor.id}
                            onSelect={() => onPickVendor(service.order_item_id, vendor.id)}
                            onOpenDetail={
                                onOpenVendorDetail
                                    ? () => onOpenVendorDetail(service, vendor)
                                    : null
                            }
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function AiTakeCard({ theme, loading, error, recommendation, onFetch }) {
    const hasResult = !!recommendation && (recommendation.summary || (recommendation.recommendations?.length ?? 0) > 0);
    return (
        <View
            style={[
                styles.aiCard,
                {
                    backgroundColor: hasResult ? colors.primary + '0D' : 'transparent',
                    borderColor: hasResult ? colors.primary + '40' : theme?.border || '#E5E7EB',
                },
            ]}
        >
            {!hasResult ? (
                <TouchableOpacity
                    style={styles.aiButton}
                    onPress={onFetch}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.primary} />
                    ) : (
                        <Ionicons name="sparkles" size={16} color={colors.primary} />
                    )}
                    <Text style={[styles.aiButtonText, { color: colors.primary }]}>
                        {loading ? 'Ekatraa AI is thinking…' : 'Get Ekatraa AI take'}
                    </Text>
                </TouchableOpacity>
            ) : (
                <View>
                    <View style={styles.aiHeaderRow}>
                        <Ionicons name="sparkles" size={14} color={colors.primary} />
                        <Text style={[styles.aiHeaderText, { color: colors.primary }]}>
                            Ekatraa AI
                        </Text>
                        <TouchableOpacity
                            onPress={onFetch}
                            disabled={loading}
                            style={styles.aiRefreshBtn}
                            activeOpacity={0.7}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.primary} size="small" />
                            ) : (
                                <Ionicons name="refresh" size={14} color={colors.primary} />
                            )}
                        </TouchableOpacity>
                    </View>
                    {recommendation.summary ? (
                        <Text style={[styles.aiSummary, { color: theme?.text || '#111' }]}>
                            {recommendation.summary}
                        </Text>
                    ) : null}
                </View>
            )}
            {error && !hasResult ? (
                <Text style={styles.aiErrorText}>{error}</Text>
            ) : null}
        </View>
    );
}

function VendorCard({ vendor, theme, isFullPayment, selected, onSelect, onOpenDetail }) {
    // Build the raw candidate list once. Order: signed gallery_urls from the
    // backend → logo as fallback → generated avatar so the slider is never empty.
    const rawCandidates = useMemo(() => {
        const list = [];
        if (Array.isArray(vendor?.gallery_urls)) {
            for (const u of vendor.gallery_urls) {
                if (u && typeof u === 'string') list.push(u);
            }
        }
        if (vendor?.logo_url && typeof vendor.logo_url === 'string') {
            list.push(vendor.logo_url);
        }
        return list;
    }, [vendor]);

    const businessName = vendor?.business_name || vendor?.display_label || 'Vendor';
    const avatarFallback = useMemo(
        () => getVendorImageUrl(null, businessName),
        [businessName]
    );

    // Optimistic first paint: anything that already looks like a signed URL gets
    // shown immediately. Paths that need signing are filled in asynchronously
    // below — we never block the card render on network IO.
    const optimisticUris = useMemo(() => {
        if (rawCandidates.length === 0) return [avatarFallback];
        const out = [];
        for (const value of rawCandidates) {
            if (value.startsWith('http://') || value.startsWith('https://')) {
                out.push(value);
            }
        }
        return out.length > 0 ? out : [avatarFallback];
    }, [rawCandidates, avatarFallback]);

    const [sliderUris, setSliderUris] = useState(optimisticUris);

    useEffect(() => {
        let cancelled = false;
        const resolveAll = async () => {
            if (rawCandidates.length === 0) {
                if (!cancelled) setSliderUris([avatarFallback]);
                return;
            }
            const resolved = await Promise.all(
                rawCandidates.map(async (value) => {
                    if (value.startsWith('http://') || value.startsWith('https://')) {
                        return value;
                    }
                    try {
                        const signed = await resolveStorageUrl(value);
                        return signed || null;
                    } catch (_) {
                        return null;
                    }
                })
            );
            const clean = resolved.filter(Boolean);
            if (!cancelled) {
                setSliderUris(clean.length > 0 ? clean : [avatarFallback]);
            }
        };
        resolveAll();
        return () => {
            cancelled = true;
        };
    }, [rawCandidates, avatarFallback]);

    const contact = vendor?.contact || null;
    const contactUnlocked = isFullPayment && contact && !vendor?.contact_locked;

    // Card tap = open VendorDetail (richer info, reviews, services). Selection
    // is a separate, explicit action via the pill below so we don't trap users
    // in an accidental commit when they're still browsing.
    const handleCardPress = useCallback(() => {
        if (onOpenDetail) onOpenDetail();
        else onSelect?.();
    }, [onOpenDetail, onSelect]);

    return (
        <TouchableOpacity
            activeOpacity={0.92}
            onPress={handleCardPress}
            style={[
                styles.card,
                {
                    backgroundColor: theme?.card || '#FFFFFF',
                    borderColor: selected ? colors.primary : theme?.border || '#E5E7EB',
                    borderWidth: selected ? 2 : 1,
                },
            ]}
        >
            <View style={styles.cardImageWrap}>
                <VendorGallerySlider
                    imageUris={sliderUris}
                    height={140}
                    borderRadius={12}
                    autoSlide={sliderUris.length > 1}
                    showDots={sliderUris.length > 1}
                    placeholderColor={theme?.inputBackground || '#E5E7EB'}
                    placeholderIconColor={theme?.textLight || '#94A3B8'}
                    fallbackUri={avatarFallback}
                />
                {vendor?.recommended ? (
                    <View style={styles.recommendedPill}>
                        <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                        <Text style={styles.recommendedText}>
                            {vendor?.is_default ? 'Ekatraa pick' : 'Recommended'}
                        </Text>
                    </View>
                ) : vendor?.is_default ? (
                    <View style={styles.curatedPill}>
                        <Ionicons name="ribbon-outline" size={11} color="#92400E" />
                        <Text style={styles.curatedPillText}>Ekatraa pick</Text>
                    </View>
                ) : null}
                {selected ? (
                    <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    </View>
                ) : null}
            </View>

            <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme?.text || '#111' }]} numberOfLines={1}>
                    {vendor?.display_label || vendor?.business_name || 'Curated partner'}
                </Text>
                <View style={styles.metaRow}>
                    {vendor?.city ? (
                        <View style={styles.metaPill}>
                            <Ionicons name="location-outline" size={11} color={theme?.textLight || '#666'} />
                            <Text style={[styles.metaText, { color: theme?.textLight || '#666' }]} numberOfLines={1}>
                                {vendor.city}
                            </Text>
                        </View>
                    ) : null}
                    {typeof vendor?.distance_km === 'number' && Number.isFinite(vendor.distance_km) ? (
                        <View style={styles.metaPill}>
                            <Ionicons name="navigate-outline" size={11} color={theme?.textLight || '#666'} />
                            <Text style={[styles.metaText, { color: theme?.textLight || '#666' }]}>
                                {vendor.distance_km.toFixed(1)} km
                            </Text>
                        </View>
                    ) : null}
                </View>

                {contactUnlocked ? (
                    <View style={styles.contactBlock}>
                        {contact.phone ? (
                            <TouchableOpacity
                                style={styles.contactRow}
                                onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                            >
                                <Ionicons name="call-outline" size={14} color={colors.primary} />
                                <Text style={[styles.contactText, { color: colors.primary }]} numberOfLines={1}>
                                    {contact.phone}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                        {contact.address ? (
                            <Text
                                style={[styles.addressText, { color: theme?.textLight || '#666' }]}
                                numberOfLines={2}
                            >
                                {contact.address}
                            </Text>
                        ) : null}
                    </View>
                ) : (
                    <View style={styles.lockedBlock}>
                        <Ionicons name="lock-closed-outline" size={12} color={theme?.textLight || '#666'} />
                        <Text style={[styles.lockedText, { color: theme?.textLight || '#666' }]} numberOfLines={3}>
                            {vendor?.ekatraa_note || 'Contact unlocks after full payment. Ekatraa handles coordination until then.'}
                        </Text>
                    </View>
                )}

                <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                        onPress={onSelect}
                        activeOpacity={0.85}
                        style={[
                            styles.selectPill,
                            selected
                                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                : { backgroundColor: 'transparent', borderColor: colors.primary },
                        ]}
                    >
                        <Ionicons
                            name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                            size={14}
                            color={selected ? '#FFFFFF' : colors.primary}
                        />
                        <Text
                            style={[
                                styles.selectPillText,
                                { color: selected ? '#FFFFFF' : colors.primary },
                            ]}
                        >
                            {selected ? 'Selected' : 'Select'}
                        </Text>
                    </TouchableOpacity>
                    {onOpenDetail ? (
                        <TouchableOpacity
                            onPress={onOpenDetail}
                            activeOpacity={0.7}
                            style={styles.detailLinkBtn}
                        >
                            <Text style={[styles.detailLinkText, { color: theme?.textLight || '#666' }]}>
                                View details
                            </Text>
                            <Ionicons
                                name="chevron-forward"
                                size={13}
                                color={theme?.textLight || '#666'}
                            />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const CARD_WIDTH = 252;

const styles = StyleSheet.create({
    wrapper: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.primary + '20',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    body: { marginTop: 14 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
    loadingText: { fontSize: 13, marginLeft: 10 },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fef2f2',
        padding: 12,
        borderRadius: 10,
    },
    errorText: { color: '#b91c1c', fontSize: 12, marginLeft: 8, flex: 1 },
    retryBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#b91c1c', borderRadius: 8 },
    retryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
    emptyBox: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
    emptyText: { fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 16 },
    serviceBlock: {
        borderTopWidth: 1,
        paddingTop: 14,
        marginTop: 14,
    },
    serviceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    serviceCat: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
    serviceName: { fontSize: 15, fontWeight: '700' },
    serviceCountPill: {
        backgroundColor: colors.primary + '15',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    serviceCountText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    serviceEmpty: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    serviceEmptyText: { fontSize: 12, marginLeft: 8, flex: 1 },
    cardsRow: { paddingRight: 8, paddingBottom: 4 },
    card: {
        width: CARD_WIDTH,
        marginRight: 12,
        borderRadius: 14,
        overflow: 'hidden',
    },
    cardImageWrap: { position: 'relative' },
    recommendedPill: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    recommendedText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginLeft: 4 },
    selectedBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: colors.primary,
        borderRadius: 999,
        padding: 2,
    },
    cardBody: { padding: 12 },
    cardTitle: { fontSize: 14, fontWeight: '700' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    metaPill: { flexDirection: 'row', alignItems: 'center', marginRight: 10, marginTop: 2 },
    metaText: { fontSize: 11, marginLeft: 3 },
    contactBlock: { marginTop: 10 },
    contactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    contactText: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
    addressText: { fontSize: 11, lineHeight: 15 },
    lockedBlock: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
    lockedText: { fontSize: 11, marginLeft: 6, flex: 1, lineHeight: 15 },
    cardActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    selectPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    selectPillText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
    detailLinkBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
    detailLinkText: { fontSize: 11, fontWeight: '600', marginRight: 2 },
    footer: { marginTop: 18 },
    submitMessage: { fontSize: 12, marginBottom: 8 },
    confirmBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    confirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    skipNote: { fontSize: 11, marginTop: 8, textAlign: 'center' },

    aiCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        marginTop: 4,
    },
    aiButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    aiButtonText: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
    aiHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    aiHeaderText: { fontSize: 12, fontWeight: '700', marginLeft: 6, flex: 1 },
    aiRefreshBtn: { padding: 4 },
    aiSummary: { fontSize: 12.5, lineHeight: 18 },
    aiErrorText: { color: '#b91c1c', fontSize: 11, marginTop: 8 },

    fallbackBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFFBEB',
        borderRadius: 8,
        padding: 8,
        marginBottom: 10,
    },
    fallbackBannerText: { color: '#92400E', fontSize: 11.5, marginLeft: 6, flex: 1, lineHeight: 16 },

    aiNoteRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
        paddingHorizontal: 2,
    },
    aiNoteText: { fontSize: 12, marginLeft: 6, flex: 1, lineHeight: 17, fontStyle: 'italic' },

    curatedPill: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: '#FEF3C7',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    curatedPillText: { color: '#92400E', fontSize: 10, fontWeight: '700', marginLeft: 4 },
});

export default memo(OrderVendorSelector);
