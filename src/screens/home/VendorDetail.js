import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, Modal, TextInput, Platform, ActivityIndicator, Animated } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { dbService, getVendorImageUrl, resolveStorageUrl } from '../../services/supabase';
import { api } from '../../services/api';
import { EKATRAA_SUPPORT_TEL, EKATRAA_SUPPORT_WHATSAPP_URL } from '../../constants/support';
import { Button } from '../../components/Button';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';
import VendorGallerySlider from '../../components/VendorGallerySlider';
import { useCart } from '../../context/CartContext';
import { getOfferableTierRows } from '../../utils/lineItemDisplay';

function normalizeGalleryUrls(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p.filter(Boolean) : [];
        } catch {
            return [];
        }
    }
    return [];
}

/** Logo first (if not already present), then gallery — de-duplicated so every image appears once. */
function mergeLogoIntoGalleryUrls(logoUrl, galleryArr) {
    const g = [...galleryArr];
    if (logoUrl && !g.some((u) => u === logoUrl)) g.unshift(logoUrl);
    const seen = new Set();
    return g.filter((u) => {
        if (!u || seen.has(u)) return false;
        seen.add(u);
        return true;
    });
}

function isServiceVisibleInCatalog(svc) {
    if (!svc) return false;
    if (svc.archived === true) return false;
    if (svc.is_active === false) return false;
    return true;
}

export default function VendorDetail({ route, navigation }) {
    const {
        vendor: vendorParam,
        city,
        openEnquiry,
        contactLocked: contactLockedParam,
        // Order-context params populated when the user came from an order
        // confirmation / detail page and is picking a vendor for one of their
        // line items. Used to show a contextual Select CTA that posts back to
        // the originating screen.
        orderItemId,
        fromOrderId,
        paymentTier,
        parentRoute,
        serviceContext,
    } = route.params || {};
    const insets = useSafeAreaInsets();
    const ctaBottomInset = Math.max(insets.bottom, 8);
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();
    const { showToast, showConfirm } = useToast();
    const { user, isAuthenticated, session } = useAuth();
    const { cartId, setCartId, refreshCartCount } = useCart();
    // Advance-payment orders keep contact gated; full-payment unlocks contact.
    const contactLockedFromOrder = !!fromOrderId && paymentTier !== 'full';
    const contactLocked = contactLockedParam === true || contactLockedFromOrder;
    const inOrderSelectionMode = !!(fromOrderId && orderItemId);

    // Full vendor data (fetched by id); fallback to params
    const [vendorData, setVendorData] = useState(vendorParam || null);
    const [fetchLoading, setFetchLoading] = useState(!!vendorParam?.id);

    useEffect(() => {
        if (!vendorParam?.id) {
            setFetchLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data, error } = await dbService.getVendorById(vendorParam.id);
            if (cancelled) return;
            setFetchLoading(false);
            if (!error && data) setVendorData(data);
            else if (vendorParam) setVendorData(vendorParam);
        })();
        return () => { cancelled = true; };
    }, [vendorParam?.id]);

    const vendor = vendorData;

    const galleryListRaw = useMemo(() => normalizeGalleryUrls(vendor?.gallery_urls), [vendor?.gallery_urls]);
    const galleryListMerged = useMemo(
        () => mergeLogoIntoGalleryUrls(vendor?.logo_url, galleryListRaw),
        [vendor?.logo_url, galleryListRaw]
    );

    const visibleServices = useMemo(() => {
        const list = vendor?.services || [];
        const filtered = list.filter(isServiceVisibleInCatalog);
        return [...filtered].sort((a, b) => {
            const occA = String(a?.occasion_name || a?.occasion_id || '').toLowerCase();
            const occB = String(b?.occasion_name || b?.occasion_id || '').toLowerCase();
            if (occA !== occB) return occA.localeCompare(occB);
            const catA = String(a?.category_name || a?.category || a?.category_id || '').toLowerCase();
            const catB = String(b?.category_name || b?.category || b?.category_id || '').toLowerCase();
            if (catA !== catB) return catA.localeCompare(catB);
            return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
    }, [vendor?.services]);
    const groupedVisibleServices = useMemo(() => {
        const groups = [];
        let currentKey = '';
        for (const svc of visibleServices) {
            const occ = String(svc?.occasion_name || svc?.occasion_id || '').trim();
            const cat = String(svc?.category_name || svc?.category || svc?.category_id || '').trim();
            const title = [occ || null, cat || null].filter(Boolean).join(' • ');
            const key = title || 'all';
            if (key !== currentKey) {
                groups.push({ key, title: title || null, services: [svc] });
                currentKey = key;
            } else {
                groups[groups.length - 1].services.push(svc);
            }
        }
        return groups;
    }, [visibleServices]);
    const eventContextLabel = useMemo(() => {
        const fromRoute = route?.params?.occasionName || route?.params?.occasion || null;
        if (typeof fromRoute === 'string' && fromRoute.trim()) return fromRoute.trim();
        const fromVendor = vendor?.occasion_name || vendor?.occasion || vendor?.event_type || null;
        if (typeof fromVendor === 'string' && fromVendor.trim()) return fromVendor.trim();
        return null;
    }, [route?.params?.occasion, route?.params?.occasionName, vendor?.event_type, vendor?.occasion, vendor?.occasion_name]);

    const [resolvedLogoUri, setResolvedLogoUri] = useState(null);
    const [resolvedGalleryUris, setResolvedGalleryUris] = useState([]);
    const [expandedServiceId, setExpandedServiceId] = useState(null);
    const [selectedTierByService, setSelectedTierByService] = useState({});
    const [addingServiceId, setAddingServiceId] = useState(null);
    const parallaxY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!vendor) return;
        let cancelled = false;
        const name = vendor.business_name || 'Vendor';
        (async () => {
            const galleryResolved = await Promise.all(
                galleryListMerged.map(async (path) => {
                    const r = await resolveStorageUrl(path);
                    return r || getVendorImageUrl(path, name);
                })
            );
            const logoResolved = vendor.logo_url
                ? (await resolveStorageUrl(vendor.logo_url)) || getVendorImageUrl(vendor.logo_url, name)
                : galleryResolved[0] || getVendorImageUrl(null, name);

            if (cancelled) return;
            setResolvedLogoUri(logoResolved);
            setResolvedGalleryUris(galleryResolved.filter(Boolean));
        })();
        return () => {
            cancelled = true;
        };
    }, [vendor, galleryListMerged]);

    const displayGalleryUris = useMemo(() => {
        if (!vendor) return [];
        const name = vendor.business_name || 'Vendor';
        if (resolvedGalleryUris.length > 0) return resolvedGalleryUris;
        return galleryListMerged.map((p) => getVendorImageUrl(p, name));
    }, [vendor, resolvedGalleryUris, galleryListMerged]);

    const heroLogoUri = resolvedLogoUri
        || (vendor ? getVendorImageUrl(vendor.logo_url, vendor.business_name || 'Vendor') : null);
    const heroSliderUris = displayGalleryUris.length > 0 ? displayGalleryUris : [heroLogoUri];
    const heroFallbackUri = useMemo(
        () => getVendorImageUrl(null, vendor?.business_name || 'Vendor'),
        [vendor?.business_name]
    );

    // When the user came from an order, surface the exact service they're
    // picking for so the service list can highlight a single matching row.
    const selectedServiceIdFromOrder = serviceContext?.service_id || null;
    const selectedServiceNameFromOrder = serviceContext?.service_name || null;
    const matchedServiceForOrder = useMemo(() => {
        if (!selectedServiceIdFromOrder && !selectedServiceNameFromOrder) return null;
        for (const svc of visibleServices) {
            if (selectedServiceIdFromOrder && String(svc?.id) === String(selectedServiceIdFromOrder)) return svc;
        }
        if (selectedServiceNameFromOrder) {
            const needle = selectedServiceNameFromOrder.toLowerCase();
            for (const svc of visibleServices) {
                if (String(svc?.name || '').toLowerCase() === needle) return svc;
            }
        }
        return null;
    }, [visibleServices, selectedServiceIdFromOrder, selectedServiceNameFromOrder]);

    // Enquiry Modal State
    const [enquiryVisible, setEnquiryVisible] = useState(openEnquiry || false);
    const [loading, setLoading] = useState(false);
    const [enquiryData, setEnquiryData] = useState({
        name: '',
        phone: '',
        eventDate: new Date(),
        eventType: '',
        message: '',
    });
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Handle null vendor. Two distinct states:
    //   1. We're still fetching the vendor row → show a spinner so the
    //      screen does not flash "Vendor not found" before data arrives.
    //   2. Fetch settled and we still have nothing → show the empty state.
    if (!vendor) {
        if (fetchLoading) {
            return (
                <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                    <View style={styles.errorContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.errorText, { color: theme.textLight, marginTop: 12 }]}>
                            Loading vendor…
                        </Text>
                    </View>
                </SafeAreaView>
            );
        }
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.errorText, { color: theme.text }]}>Vendor not found</Text>
                    <Button title="Go Back" onPress={() => navigation.goBack()} />
                </View>
            </SafeAreaView>
        );
    }

    // Unauthenticated: show vendor card but gate full details — ask to register
    if (!isAuthenticated) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Vendor Details</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={[styles.authGateContainer, { backgroundColor: theme.card }]}>
                    <Image
                        source={{ uri: heroLogoUri || getVendorImageUrl(vendor.logo_url, vendor.business_name) }}
                        style={styles.authGateLogo}
                    />
                    <Text style={[styles.authGateName, { color: theme.text }]}>{vendor.business_name || 'Vendor'}</Text>
                    <Text style={[styles.authGateCategory, { color: theme.textLight }]}>{vendor.category || 'Service Provider'}</Text>
                    <Text style={[styles.authGateMessage, { color: theme.textLight }]}>
                        Register or login to view full details, services, pricing and contact info.
                    </Text>
                    <Button
                        title="Register / Login"
                        onPress={() => navigation.navigate('Login')}
                    />
                </View>
            </SafeAreaView>
        );
    }

    const handleCall = () => {
        if (contactLocked) {
            Linking.openURL(EKATRAA_SUPPORT_TEL);
            return;
        }
        if (vendor.phone) {
            Linking.openURL(`tel:${vendor.phone}`);
        } else {
            showToast({ variant: 'info', title: 'No phone number', message: 'Phone number not available for this vendor.' });
        }
    };

    const handleEmail = () => {
        if (contactLocked) {
            Linking.openURL(EKATRAA_SUPPORT_WHATSAPP_URL);
            return;
        }
        if (vendor.email) {
            Linking.openURL(`mailto:${vendor.email}`);
        }
    };

    const handleSubmitEnquiry = async () => {
        // Validation
        if (!enquiryData.name.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter your name.' });
            return;
        }
        if (!enquiryData.phone.trim() || enquiryData.phone.replace(/\D/g, '').length < 10) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter a valid phone number.' });
            return;
        }

        // Check login
        if (!isAuthenticated) {
            showConfirm({
                title: 'Login required',
                message: 'Please login to submit your enquiry.',
                cancelLabel: 'Cancel',
                confirmLabel: 'Login',
                onConfirm: () => {
                    setEnquiryVisible(false);
                    navigation.navigate('Login');
                },
            });
            return;
        }

        setLoading(true);
        try {
            // Note: vendor_id is stored in preferred_venue field as reference
            const enquiry = {
                user_id: user?.id,
                event_type: enquiryData.eventType || 'General Enquiry',
                event_date: enquiryData.eventDate.toISOString(),
                contact_name: enquiryData.name,
                contact_phone: enquiryData.phone.replace(/\D/g, ''),
                additional_notes: `Vendor: ${vendor.business_name} (ID: ${vendor.id})\n${enquiryData.message || ''}`,
                preferred_venue: vendor.business_name,
                city: city || vendor.city,
                status: 'pending',
            };

            const { data, error } = await dbService.submitEnquiry(enquiry);

            if (error) throw error;

            showToast({
                variant: 'success',
                title: 'Enquiry sent',
                message: `Your enquiry has been sent to ${vendor.business_name}. They will contact you soon.`,
                action: { label: 'OK', onPress: () => setEnquiryVisible(false) },
            });

            // Reset form
            setEnquiryData({
                name: '',
                phone: '',
                eventDate: new Date(),
                eventType: '',
                message: '',
            });
        } catch (error) {
            console.error('[ENQUIRY ERROR]', error);
            showToast({ variant: 'error', title: 'Error', message: 'Failed to send enquiry. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const onDateChange = (event, selectedDate) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setEnquiryData({ ...enquiryData, eventDate: selectedDate });
        }
    };

    const heroCardTranslateY = parallaxY.interpolate({
        inputRange: [0, 220],
        outputRange: [-24, 0],
        extrapolate: 'clamp',
    });

    const ensureCart = async () => {
        if (cartId) return cartId;
        const accessToken = session?.access_token || null;
        const { data, error } = await api.createCartWithAuth({
            session_id: 'vendor-' + Date.now(),
            user_id: isAuthenticated && user?.id ? user.id : null,
            event_name: 'Vendor services',
        }, accessToken);
        if (error) throw new Error(error.message || 'Could not create cart');
        if (!data?.id) throw new Error('Could not create cart');
        await setCartId(data.id, data.session_id ?? undefined);
        return data.id;
    };

    const handleSelectTier = (svc, tier) => {
        setSelectedTierByService((prev) => ({ ...prev, [String(svc.id)]: tier }));
    };

    const handleAddServiceTierToCart = async (svc) => {
        const svcId = String(svc.id);
        const tiers = getOfferableTierRows(svc);
        const picked = selectedTierByService[svcId] || tiers[0];
        if (!picked || !picked.value || picked.value <= 0) {
            showToast({ variant: 'info', title: 'Select tier', message: 'Please select a valid tier first.' });
            return;
        }
        try {
            setAddingServiceId(svcId);
            const cid = await ensureCart();
            const accessToken = session?.access_token || null;
            const { error } = await api.addCartItemWithAuth({
                cart_id: cid,
                service_id: svc.id,
                quantity: 1,
                unit_price: Number(picked.value),
                options: {
                    tier: picked.key,
                    occasion: eventContextLabel || 'Vendor services',
                    category: vendor?.category || 'Vendor services',
                    ...(picked.qtyLabel ? { qty_label: picked.qtyLabel } : {}),
                    ...(picked.subVariety ? { sub_variety: picked.subVariety } : {}),
                },
            }, accessToken);
            if (error) throw new Error(error.message || 'Could not add service');
            await refreshCartCount?.(cid);
            showToast({ variant: 'success', title: 'Added to cart', message: `${svc.name} added.` });
        } catch (e) {
            showToast({ variant: 'error', title: 'Cart', message: e?.message || 'Could not add service.' });
        } finally {
            setAddingServiceId(null);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            {/* Header — switches to a "Back to order" label when the user came
                from an order confirmation/detail flow, so the affordance reads
                contextually instead of just "back". */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnRow} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color={theme.text} />
                    {inOrderSelectionMode ? (
                        <Text style={[styles.backBtnLabel, { color: theme.text }]} numberOfLines={1}>
                            Order
                        </Text>
                    ) : null}
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                    {inOrderSelectionMode ? 'Vendor for your order' : 'Vendor Details'}
                </Text>
                {fetchLoading ? <ActivityIndicator size="small" color={colors.primary} style={{ width: 40 }} /> : <View style={{ width: 40 }} />}
            </View>

            <Animated.ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: ctaBottomInset + 132 },
                ]}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: parallaxY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
            >
                {/* Vendor Header Card */}
                <View style={styles.vendorHeroCard}>
                    <VendorGallerySlider
                        imageUris={heroSliderUris}
                        height={278}
                        borderRadius={0}
                        containerStyle={styles.vendorHeroSlider}
                        placeholderColor={isDarkMode ? '#334155' : '#E5E7EB'}
                        placeholderIconColor={theme.textLight}
                        fallbackUri={heroFallbackUri}
                    />
                    <LinearGradient
                        colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.58)']}
                        style={styles.vendorHeroOverlay}
                    />
                    {vendor.is_verified && (
                        <View style={styles.verifiedBadge}>
                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        </View>
                    )}
                </View>
                <Animated.View
                    style={[
                        styles.vendorInfoFloatCard,
                        {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                            transform: [{ translateY: heroCardTranslateY }],
                        },
                    ]}
                >
                    <Text style={[styles.vendorInfoFloatName, { color: theme.text }]} numberOfLines={1}>
                        {vendor.business_name || 'Vendor'}
                    </Text>
                    <Text style={[styles.vendorInfoFloatMeta, { color: theme.textLight }]} numberOfLines={1}>
                        {vendor.category || 'Service Provider'}{vendor.city ? ` · ${vendor.city}` : ''}
                    </Text>
                    {typeof vendor.rating === 'number' && vendor.rating > 0 ? (
                        <View style={styles.vendorRatingRow}>
                            <Ionicons name="star" size={14} color="#F59E0B" />
                            <Text style={[styles.vendorRatingText, { color: theme.text }]}>
                                {Number(vendor.rating).toFixed(1)}
                            </Text>
                            <Text style={[styles.vendorRatingSub, { color: theme.textLight }]}>
                                Ekatraa rating
                            </Text>
                        </View>
                    ) : null}
                </Animated.View>

                {inOrderSelectionMode ? (
                    <View
                        style={[
                            styles.orderContextBanner,
                            { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' },
                        ]}
                    >
                        <View style={[styles.orderContextIconWrap, { backgroundColor: colors.primary + '22' }]}>
                            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[styles.orderContextLabel, { color: colors.primary }]}>
                                Selecting vendor for
                            </Text>
                            <Text style={[styles.orderContextName, { color: theme.text }]} numberOfLines={2}>
                                {serviceContext?.service_name || 'your selected service'}
                            </Text>
                            {serviceContext?.category ? (
                                <Text style={[styles.orderContextSub, { color: theme.textLight }]} numberOfLines={1}>
                                    {serviceContext.category}
                                </Text>
                            ) : null}
                            <View
                                style={[
                                    styles.orderContextMatchPill,
                                    matchedServiceForOrder
                                        ? { backgroundColor: '#DCFCE7' }
                                        : { backgroundColor: '#FEF3C7' },
                                ]}
                            >
                                <Ionicons
                                    name={matchedServiceForOrder ? 'checkmark-circle' : 'information-circle'}
                                    size={12}
                                    color={matchedServiceForOrder ? '#15803D' : '#92400E'}
                                />
                                <Text
                                    style={[
                                        styles.orderContextMatchText,
                                        { color: matchedServiceForOrder ? '#15803D' : '#92400E' },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {matchedServiceForOrder
                                        ? 'Offered by this vendor'
                                        : 'Confirm with vendor for fit'}
                                </Text>
                            </View>
                        </View>
                    </View>
                ) : null}

                {/* Quick Actions */}
                <View style={[styles.actionsRow, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
                        <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
                            <Ionicons name="call" size={22} color="#4CAF50" />
                        </View>
                        <Text style={[styles.actionText, { color: theme.text }]}>
                            {contactLocked ? tr('vendor_call_ekatraa') : 'Call'}
                        </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.actionBtn} onPress={handleEmail}>
                        <View style={[styles.actionIcon, { backgroundColor: contactLocked ? '#E8F5E9' : '#E3F2FD' }]}>
                            <Ionicons
                                name={contactLocked ? 'logo-whatsapp' : 'mail'}
                                size={22}
                                color={contactLocked ? '#25D366' : '#2196F3'}
                            />
                        </View>
                        <Text style={[styles.actionText, { color: theme.text }]}>
                            {contactLocked ? tr('vendor_whatsapp_ekatraa') : 'Email'}
                        </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setEnquiryVisible(true)}>
                        <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
                            <Ionicons name="chatbubbles" size={22} color={colors.primary} />
                        </View>
                        <Text style={[styles.actionText, { color: theme.text }]}>Enquire</Text>
                    </TouchableOpacity>
                </View>

                {/* Description */}
                {vendor.description && (
                    <View style={[styles.section, { backgroundColor: theme.card }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>
                        <Text style={[styles.descriptionText, { color: theme.textLight }]}>
                            {vendor.description}
                        </Text>
                    </View>
                )}

                {/* Gallery — merged logo + gallery_urls, URLs resolved (signed/public) */}
                {displayGalleryUris.length > 0 && (
                    <View style={[styles.section, { backgroundColor: theme.card }]}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Gallery</Text>
                            <Text style={[styles.sectionCountChip, { color: theme.textLight, backgroundColor: theme.background, borderColor: theme.border }]}>
                                {displayGalleryUris.length} photo{displayGalleryUris.length === 1 ? '' : 's'}
                            </Text>
                        </View>
                        <VendorGallerySlider
                            imageUris={displayGalleryUris}
                            height={220}
                            borderRadius={14}
                            containerStyle={styles.gallerySlider}
                            placeholderColor={isDarkMode ? '#334155' : '#E5E7EB'}
                            placeholderIconColor={theme.textLight}
                            fallbackUri={heroFallbackUri}
                        />
                    </View>
                )}

                {/* Why Ekatraa recommends this vendor (visible during order selection
                    or when the vendor has a meaningful rating). Synthesized client-side
                    from rating, city match, and category context — no extra API hop. */}
                {(inOrderSelectionMode || (typeof vendor.rating === 'number' && vendor.rating >= 4)) && (
                    <View style={[styles.section, { backgroundColor: theme.card }]}>
                        <View style={styles.recoHeader}>
                            <View style={[styles.recoIconWrap, { backgroundColor: colors.primary + '15' }]}>
                                <Ionicons name="sparkles" size={16} color={colors.primary} />
                            </View>
                            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                                Why Ekatraa recommends this vendor
                            </Text>
                        </View>
                        <View style={styles.recoList}>
                            {typeof vendor.rating === 'number' && vendor.rating > 0 ? (
                                <View style={styles.recoRow}>
                                    <Ionicons name="star" size={14} color="#F59E0B" />
                                    <Text style={[styles.recoText, { color: theme.text }]}>
                                        Rated {Number(vendor.rating).toFixed(1)} on Ekatraa{vendor.rating >= 4.5 ? ' — top-tier' : vendor.rating >= 4 ? ' — well-reviewed' : ''}.
                                    </Text>
                                </View>
                            ) : null}
                            {serviceContext?.service_name ? (
                                <View style={styles.recoRow}>
                                    <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                                    <Text style={[styles.recoText, { color: theme.text }]}>
                                        Offers {serviceContext.service_name}{serviceContext.category ? ` in the ${serviceContext.category} category` : ''}.
                                    </Text>
                                </View>
                            ) : null}
                            {vendor.city && city && vendor.city.toLowerCase() === String(city).toLowerCase() ? (
                                <View style={styles.recoRow}>
                                    <Ionicons name="location" size={14} color={colors.primary} />
                                    <Text style={[styles.recoText, { color: theme.text }]}>
                                        Based in {vendor.city} — local availability matches your event location.
                                    </Text>
                                </View>
                            ) : vendor.city ? (
                                <View style={styles.recoRow}>
                                    <Ionicons name="location-outline" size={14} color={theme.textLight} />
                                    <Text style={[styles.recoText, { color: theme.textLight }]}>
                                        Based in {vendor.city}.
                                    </Text>
                                </View>
                            ) : null}
                            {visibleServices.length >= 3 ? (
                                <View style={styles.recoRow}>
                                    <Ionicons name="layers-outline" size={14} color={colors.primary} />
                                    <Text style={[styles.recoText, { color: theme.text }]}>
                                        Versatile portfolio with {visibleServices.length} active service offerings.
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                )}

                {/* Customer feedback — synthesized from rating until a dedicated
                    reviews table is added. Hidden when there is no signal. */}
                {typeof vendor.rating === 'number' && vendor.rating > 0 ? (
                    <View style={[styles.section, { backgroundColor: theme.card }]}>
                        <View style={styles.recoHeader}>
                            <View style={[styles.recoIconWrap, { backgroundColor: '#F59E0B' + '20' }]}>
                                <Ionicons name="chatbubbles" size={16} color="#B45309" />
                            </View>
                            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                                Customer feedback
                            </Text>
                        </View>
                        <View style={styles.reviewSummary}>
                            <Text style={[styles.reviewBigNumber, { color: theme.text }]}>
                                {Number(vendor.rating).toFixed(1)}
                            </Text>
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <View style={{ flexDirection: 'row', gap: 2 }}>
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <Ionicons
                                            key={n}
                                            name={n <= Math.round(Number(vendor.rating)) ? 'star' : 'star-outline'}
                                            size={16}
                                            color="#F59E0B"
                                        />
                                    ))}
                                </View>
                                <Text style={[styles.reviewSummaryText, { color: theme.textLight }]}>
                                    Aggregated from Ekatraa bookings and on-platform feedback.
                                </Text>
                            </View>
                        </View>
                    </View>
                ) : null}

                {/* Contact Details */}
                <View style={[styles.section, { backgroundColor: theme.card }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Contact Details</Text>
                    {contactLocked ? (
                        <Text style={[styles.descriptionText, { color: theme.textLight, marginBottom: 12 }]}>
                            {tr('vendor_contact_locked_note')}
                        </Text>
                    ) : null}
                    {contactLocked ? (
                        <>
                            <TouchableOpacity style={styles.contactRow} onPress={handleCall}>
                                <Ionicons name="call-outline" size={20} color={colors.primary} />
                                <Text style={[styles.contactText, { color: theme.text }]}>Ekatraa support (call)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.contactRow} onPress={handleEmail}>
                                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                                <Text style={[styles.contactText, { color: theme.text }]}>Ekatraa support (WhatsApp)</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            {vendor.phone && (
                                <TouchableOpacity style={styles.contactRow} onPress={handleCall}>
                                    <Ionicons name="call-outline" size={20} color={colors.primary} />
                                    <Text style={[styles.contactText, { color: theme.text }]}>{vendor.phone}</Text>
                                </TouchableOpacity>
                            )}
                            {vendor.email && (
                                <TouchableOpacity style={styles.contactRow} onPress={handleEmail}>
                                    <Ionicons name="mail-outline" size={20} color={colors.primary} />
                                    <Text style={[styles.contactText, { color: theme.text }]}>{vendor.email}</Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                {/* Services — stacked list, expandable tiers */}
                {visibleServices.length > 0 && (
                    <View style={[styles.section, { backgroundColor: theme.card }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Services Offered</Text>
                        <View style={styles.servicesStack}>
                        {groupedVisibleServices.map((group) => (
                            <View key={group.key} style={styles.serviceGroupWrap}>
                                {group.title ? (
                                    <Text style={[styles.serviceGroupTitle, { color: theme.textLight }]}>{group.title}</Text>
                                ) : null}
                                {group.services.map((svc, idx) => {
                            const idKey = svc.id != null ? String(svc.id) : `${idx}`;
                            const tiers = getOfferableTierRows(svc);
                            const selectedTier = selectedTierByService[idKey] || tiers[0] || null;
                            const expanded = expandedServiceId === idKey;
                            // When the user came from an order picking a specific service, draw
                            // attention to the matching row so they immediately see the vendor
                            // covers what they need.
                            const isOrderMatchRow =
                                inOrderSelectionMode &&
                                matchedServiceForOrder &&
                                (String(matchedServiceForOrder?.id ?? '') === idKey ||
                                    (matchedServiceForOrder?.name &&
                                        svc?.name &&
                                        String(matchedServiceForOrder.name).toLowerCase() ===
                                            String(svc.name).toLowerCase()));
                            return (
                                <View
                                    key={svc.id || idx}
                                    style={[
                                        styles.serviceStackCard,
                                        {
                                            borderColor: isOrderMatchRow ? colors.primary : theme.border,
                                            borderWidth: isOrderMatchRow ? 1.5 : StyleSheet.hairlineWidth,
                                            backgroundColor: isOrderMatchRow
                                                ? colors.primary + '0D'
                                                : isDarkMode
                                                    ? theme.background
                                                    : '#FAFAFA',
                                        },
                                    ]}
                                >
                                    <TouchableOpacity
                                        onPress={() => setExpandedServiceId((prev) => (prev === idKey ? null : idKey))}
                                        activeOpacity={0.86}
                                        style={styles.serviceStackHead}
                                    >
                                        <View style={{ flex: 1 }}>
                                            {isOrderMatchRow ? (
                                                <View style={[styles.matchPillInline, { backgroundColor: colors.primary }]}>
                                                    <Ionicons name="bookmark" size={10} color="#FFF" />
                                                    <Text style={styles.matchPillInlineText}>Your selection</Text>
                                                </View>
                                            ) : null}
                                            <Text style={[styles.serviceNameLarge, { color: theme.text }]}>{svc.name}</Text>
                                            {svc.description ? (
                                                <Text style={[styles.serviceDescLarge, { color: theme.textLight }]} numberOfLines={2}>
                                                    {svc.description}
                                                </Text>
                                            ) : null}
                                            <View style={styles.serviceMetaWrap}>
                                                {eventContextLabel ? (
                                                    <View style={[styles.serviceMetaChip, { borderColor: theme.border, backgroundColor: isDarkMode ? '#1F2333' : '#FFF' }]}>
                                                        <Ionicons name="sparkles-outline" size={11} color={colors.primary} />
                                                        <Text style={[styles.serviceMetaText, { color: theme.textLight }]} numberOfLines={1}>
                                                            Occasion: {eventContextLabel}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                {svc.city ? (
                                                    <View style={[styles.serviceMetaChip, { borderColor: theme.border, backgroundColor: isDarkMode ? '#1F2333' : '#FFF' }]}>
                                                        <Ionicons name="location-outline" size={11} color={colors.primary} />
                                                        <Text style={[styles.serviceMetaText, { color: theme.textLight }]} numberOfLines={1}>
                                                            {svc.city}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                        </View>
                                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textLight} />
                                    </TouchableOpacity>
                                    {expanded ? (
                                        <View style={[styles.serviceExpanded, { borderTopColor: theme.border }]}>
                                            {tiers.map((tier) => {
                                                const active = selectedTier?.key === tier.key;
                                                return (
                                                    <TouchableOpacity
                                                        key={tier.key}
                                                        style={[
                                                            styles.vendorTierRow,
                                                            {
                                                                borderColor: active ? colors.primary : theme.border,
                                                                backgroundColor: active ? colors.primary + '12' : theme.background,
                                                            },
                                                        ]}
                                                        onPress={() => handleSelectTier(svc, tier)}
                                                    >
                                                        <View style={styles.vendorTierTextWrap}>
                                                            <Text style={[styles.vendorTierLabel, { color: theme.text }]}>{tier.label}</Text>
                                                            {tier.qtyLabel ? (
                                                                <Text style={[styles.vendorTierQty, { color: theme.textLight }]}>
                                                                    {tier.qtyLabel}
                                                                </Text>
                                                            ) : null}
                                                            {tier.subVariety ? (
                                                                <Text style={[styles.vendorTierMeta, { color: theme.textLight }]}>
                                                                    {tier.subVariety}
                                                                </Text>
                                                            ) : null}
                                                        </View>
                                                        <Text style={[styles.vendorTierPrice, { color: colors.primary }]}>
                                                            ₹{Number(tier.value).toLocaleString('en-IN')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                            <TouchableOpacity
                                                style={[styles.vendorAddBtn, { backgroundColor: colors.primary }]}
                                                onPress={() => handleAddServiceTierToCart(svc)}
                                                disabled={addingServiceId === idKey}
                                            >
                                                {addingServiceId === idKey ? (
                                                    <ActivityIndicator color="#FFF" />
                                                ) : (
                                                    <Text style={styles.vendorAddBtnText}>Add selected tier to cart</Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}
                                </View>
                            );
                                })}
                            </View>
                        ))}
                        </View>
                    </View>
                )}
            </Animated.ScrollView>

            <BottomTabBar navigation={navigation} activeRoute="Home" />

            {/* Above tab bar in z-order; bottom offset clears tab strip */}
            <View
                style={[
                    styles.bottomBar,
                    {
                        backgroundColor: theme.card,
                        borderTopColor: theme.border,
                        bottom: ctaBottomInset,
                        zIndex: 50,
                    },
                ]}
            >
                {inOrderSelectionMode ? (
                    <View style={styles.bottomBarSelectionRow}>
                        <TouchableOpacity
                            style={[styles.bottomBarSelectBtn, { backgroundColor: colors.primary }]}
                            onPress={() => {
                                const targetRoute = parentRoute || 'OrderDetail';
                                const selectionParams = {
                                    vendorSelectionRequest: {
                                        orderItemId,
                                        vendorId: vendor.id,
                                        ts: Date.now(),
                                    },
                                };
                                // React Navigation v7 has no `pop` option on navigate
                                // and the object form `{ name, params, merge }` is
                                // legacy-only. The reliable pattern is to dispatch a
                                // state update: find the existing target route in the
                                // stack, merge our selection params onto it, and
                                // truncate the stack so we land on that screen
                                // without remounting it.
                                navigation.dispatch((state) => {
                                    const idx = state.routes.findIndex(
                                        (r) => r.name === targetRoute
                                    );
                                    if (idx < 0) {
                                        // Target not on the stack — fall back to a
                                        // plain navigate so the screen at least
                                        // receives the selection.
                                        return CommonActions.navigate({
                                            name: targetRoute,
                                            params: selectionParams,
                                        });
                                    }
                                    const routes = state.routes.slice(0, idx + 1);
                                    routes[idx] = {
                                        ...routes[idx],
                                        params: {
                                            ...(routes[idx].params || {}),
                                            ...selectionParams,
                                        },
                                    };
                                    return CommonActions.reset({
                                        ...state,
                                        routes,
                                        index: routes.length - 1,
                                    });
                                });
                            }}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                            <Text style={styles.bottomBarSelectText}>
                                Select for this service
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.bottomBarEnquireSecondary, { borderColor: colors.primary }]}
                            onPress={() => setEnquiryVisible(true)}
                        >
                            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.enquireBtn} onPress={() => setEnquiryVisible(true)}>
                        <LinearGradient
                            colors={['#FF7A00', '#FFA040']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.enquireBtnGradient}
                        >
                            <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
                            <Text style={styles.enquireBtnText}>Send Enquiry</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>

            {/* Enquiry Modal */}
            <Modal visible={enquiryVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>
                                Enquiry for {vendor.business_name}
                            </Text>
                            <TouchableOpacity onPress={() => setEnquiryVisible(false)}>
                                <Ionicons name="close" size={24} color={theme.textLight} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                            {/* Name */}
                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: theme.text }]}>Your Name *</Text>
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Enter your name"
                                    placeholderTextColor={theme.textLight}
                                    value={enquiryData.name}
                                    onChangeText={(text) => setEnquiryData({ ...enquiryData, name: text })}
                                />
                            </View>

                            {/* Phone */}
                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: theme.text }]}>Phone Number *</Text>
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                    placeholder="10-digit mobile number"
                                    placeholderTextColor={theme.textLight}
                                    keyboardType="phone-pad"
                                    maxLength={10}
                                    value={enquiryData.phone}
                                    onChangeText={(text) => setEnquiryData({ ...enquiryData, phone: text })}
                                />
                            </View>

                            {/* Event Date */}
                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: theme.text }]}>Event Date</Text>
                                <TouchableOpacity
                                    style={[styles.dateBtn, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                                    onPress={() => setShowDatePicker(true)}
                                >
                                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                    <Text style={[styles.dateText, { color: theme.text }]}>
                                        {enquiryData.eventDate.toDateString()}
                                    </Text>
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={enquiryData.eventDate}
                                        mode="date"
                                        display="default"
                                        minimumDate={new Date()}
                                        onChange={onDateChange}
                                    />
                                )}
                            </View>

                            {/* Event Type */}
                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: theme.text }]}>Event Type</Text>
                                <TextInput
                                    style={[styles.textInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                    placeholder="e.g., Wedding, Birthday, Corporate"
                                    placeholderTextColor={theme.textLight}
                                    value={enquiryData.eventType}
                                    onChangeText={(text) => setEnquiryData({ ...enquiryData, eventType: text })}
                                />
                            </View>

                            {/* Message */}
                            <View style={styles.inputGroup}>
                                <Text style={[styles.inputLabel, { color: theme.text }]}>Your Message</Text>
                                <TextInput
                                    style={[styles.textArea, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                    placeholder="Tell us about your requirements..."
                                    placeholderTextColor={theme.textLight}
                                    multiline
                                    numberOfLines={4}
                                    value={enquiryData.message}
                                    onChangeText={(text) => setEnquiryData({ ...enquiryData, message: text })}
                                />
                            </View>
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Button
                                title={loading ? "Sending..." : "Send Enquiry"}
                                onPress={handleSubmitEnquiry}
                                loading={loading}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: {
        padding: 8,
    },
    backBtnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 6,
        paddingRight: 10,
        gap: 4,
        minWidth: 40,
    },
    backBtnLabel: {
        fontSize: 13,
        fontWeight: '600',
        maxWidth: 70,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 8,
        fontSize: 16,
        fontWeight: '700',
    },
    scrollContent: {
        paddingBottom: 8,
    },
    vendorHeroCard: {
        marginHorizontal: 0,
        marginTop: 0,
        borderRadius: 0,
        overflow: 'hidden',
    },
    vendorHeroSlider: {
        width: '100%',
    },
    vendorHeroOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingBottom: 14,
    },
    verifiedBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 2,
    },
    vendorName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFF',
    },
    vendorInfoFloatCard: {
        marginHorizontal: 16,
        marginTop: -24,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        zIndex: 5,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
    },
    vendorInfoFloatName: {
        fontSize: 18,
        fontWeight: '800',
    },
    vendorInfoFloatMeta: {
        fontSize: 12,
        marginTop: 4,
    },
    vendorRatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    vendorRatingText: {
        fontSize: 13,
        fontWeight: '700',
    },
    vendorRatingSub: {
        fontSize: 11,
        marginLeft: 4,
    },
    orderContextBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 10,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    orderContextLabel: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    orderContextName: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 2,
    },
    orderContextSub: {
        fontSize: 12,
        marginTop: 1,
    },
    orderContextIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    orderContextMatchPill: {
        alignSelf: 'flex-start',
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    orderContextMatchText: {
        fontSize: 11,
        fontWeight: '700',
    },
    matchPillInline: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        marginBottom: 6,
    },
    matchPillInlineText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    sectionCountChip: {
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    bottomBarSelectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    bottomBarSelectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 50,
        borderRadius: 12,
    },
    bottomBarSelectText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '700',
    },
    bottomBarEnquireSecondary: {
        width: 50,
        height: 50,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    recoIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recoList: {
        gap: 10,
    },
    recoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    recoText: {
        flex: 1,
        fontSize: 13.5,
        lineHeight: 19,
    },
    reviewSummary: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewBigNumber: {
        fontSize: 36,
        fontWeight: '700',
        lineHeight: 40,
    },
    reviewSummaryText: {
        fontSize: 12,
        marginTop: 4,
        lineHeight: 16,
    },
    vendorCategory: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 2,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    locationText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 16,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    actionBtn: {
        alignItems: 'center',
    },
    actionIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    actionText: {
        fontSize: 12,
        fontWeight: '500',
    },
    section: {
        margin: 16,
        marginTop: 2,
        padding: 16,
        borderRadius: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    descriptionText: {
        fontSize: 14,
        lineHeight: 22,
    },
    gallerySlider: {
        marginTop: 2,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
    },
    contactText: {
        fontSize: 14,
        flex: 1,
    },
    servicesStack: {
        gap: 10,
    },
    serviceGroupWrap: {
        gap: 8,
    },
    serviceGroupTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    serviceStackCard: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    serviceStackHead: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    serviceExpanded: {
        borderTopWidth: 1,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 12,
        gap: 8,
    },
    serviceNameLarge: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    serviceDescLarge: {
        fontSize: 13,
        marginTop: 6,
        lineHeight: 18,
    },
    serviceMetaWrap: {
        marginTop: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    serviceMetaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        maxWidth: '100%',
    },
    serviceMetaText: {
        fontSize: 11,
        fontWeight: '600',
        flexShrink: 1,
    },
    vendorTierRow: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    vendorTierLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    vendorTierTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    vendorTierQty: {
        fontSize: 11,
        marginTop: 4,
        fontWeight: '600',
    },
    vendorTierMeta: {
        fontSize: 12,
        marginTop: 4,
        lineHeight: 17,
    },
    vendorTierPrice: {
        marginLeft: 10,
        flexShrink: 0,
        fontSize: 15,
        fontWeight: '800',
    },
    vendorAddBtn: {
        marginTop: 4,
        borderRadius: 10,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    vendorAddBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
    },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderTopWidth: 1,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.12,
                shadowRadius: 8,
            },
            android: { elevation: 12 },
        }),
    },
    enquireBtn: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    enquireBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    enquireBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorText: {
        fontSize: 18,
        marginVertical: 16,
    },
    authGateContainer: {
        flex: 1,
        margin: 16,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    authGateLogo: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f0f0f0',
        marginBottom: 16,
    },
    authGateName: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
        textAlign: 'center',
    },
    authGateCategory: {
        fontSize: 14,
        marginBottom: 16,
    },
    authGateMessage: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
    },
    modalBody: {
        padding: 20,
        maxHeight: 400,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    textInput: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 15,
    },
    textArea: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 15,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        gap: 10,
    },
    dateText: {
        fontSize: 15,
    },
    modalFooter: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.1)',
    },
});
