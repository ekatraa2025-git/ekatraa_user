import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, FlatList, Image,
    TouchableOpacity, Pressable, Dimensions, Modal, Linking,
    ActivityIndicator, RefreshControl,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { EVENT_TYPES as MOCK_EVENT_TYPES, CITIES } from '../../data/mockData';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useEventForm } from '../../context/EventFormContext';
import ChatModal from '../../components/ChatModal';
import UserInfoEventModal from '../../components/UserInfoEventModal';
import { AnimatedBackground } from '../../components/AnimatedBackground';
import { dbService, resolveStorageUrl, getVendorImageUrl } from '../../services/supabase';
import { StorageVideoCover } from '../../components/StorageVideoCover';
import { api, useBackendApi } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useAppData } from '../../context/AppDataContext';
import BottomTabBar from '../../components/BottomTabBar';
import Logo from '../../components/Logo';
import RecommendationBudgetModal from '../../components/RecommendationBudgetModal';
import LocationMapPickerModal from '../../components/LocationMapPickerModal';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';
import VendorGallerySlider from '../../components/VendorGallerySlider';
import { getOfferableTierRows } from '../../utils/lineItemDisplay';

const { width } = Dimensions.get('window');
const OCCASION_CARD_GAP = 12;
const OCCASION_CARD_WIDTH_SINGLE_ROW = (width - 20 * 2 - OCCASION_CARD_GAP * 2) / 3;
const OCCASION_CARD_WIDTH = (width - 20 * 2 - OCCASION_CARD_GAP) / 2;
const OCCASION_CARD_WIDTH_3COL = (width - 20 * 2 - OCCASION_CARD_GAP * 2) / 3;
const CATEGORY_BOX_WIDTH = 110;
/** Bottom tab: keep in sync with BottomTabBar.js (TAB_BAR_CONTENT_HEIGHT + bottom inset) */
const TAB_BAR_CONTENT_H = 56;
const TAB_BAR_BOTTOM_PAD = 6;

const MIN_PLANNED_BUDGET_INR = 0;
const MAX_PLANNED_BUDGET_INR = 20000000;

function formatBudgetInrLabel(inr) {
    if (!Number.isFinite(inr) || inr < 0) return '';
    if (inr === 0) return '₹0';
    const lakhs = inr / 100000;
    if (lakhs >= 100) {
        const cr = lakhs / 100;
        const s = cr >= 10 ? cr.toFixed(1) : cr.toFixed(2);
        return `₹${s.replace(/\.?0+$/, '')} Cr`;
    }
    const s = lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2);
    return `₹${s.replace(/\.?0+$/, '')} Lakhs`;
}

const BANNER_EDGE_PAD = 20;
const BANNER_TILE_GAP = 10;
const HOME_SPECIAL_GRID_GAP = 12;
/** Horizontal strip: ~2 cards visible + peek of next — fully on one row, no vertical clip */
const HOME_SPECIAL_H_CARD_W = Math.round((width - 44 - HOME_SPECIAL_GRID_GAP * 2) / 2.25);
/** Horizontal strip: ~2.5 cards visible per row (matches special add-ons strip). */
const HOME_PARTNER_H_CARD_W = Math.round((width - 44 - HOME_SPECIAL_GRID_GAP * 2) / 2.25);
/** Hide AI E-Invite from special add-on strips — purchased via Guest Manager / cart line. */
const E_INVITE_CATALOG_SERVICE_ID = 'e1000001-0000-4000-8000-000000000001';

function isEInviteCatalogService(svc) {
    if (!svc || typeof svc !== 'object') return false;
    if (String(svc.id || '') === E_INVITE_CATALOG_SERVICE_ID) return true;
    return /e-invite|e invite/i.test(String(svc.name || ''));
}

function isAuthRequiredErrorMessage(message) {
    return /authorization required|bearer token/i.test(String(message || ''));
}

function bannerDiscountLabel(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.discount_percent != null && item.discount_percent !== '') {
        const n = Number(item.discount_percent);
        if (Number.isFinite(n)) return `${Math.round(n)}% OFF`;
    }
    if (typeof item.discount_text === 'string' && item.discount_text.trim()) return item.discount_text.trim();
    if (typeof item.promo_text === 'string' && item.promo_text.trim()) return item.promo_text.trim();
    return null;
}

export default function Home({ navigation }) {
    const insets = useSafeAreaInsets();
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();
    const { showToast } = useToast();
    const { isAuthenticated, user, session } = useAuth();
    const { setEventForm } = useEventForm();

    const [locationName, setLocationName] = useState('Bhubaneswar, Odisha');
    const [selectedType, setSelectedType] = useState(null);
    const [chatModalVisible, setChatModalVisible] = useState(false);
    const [locationPickerVisible, setLocationPickerVisible] = useState(false);
    const [currentCity, setCurrentCity] = useState('Bhubaneswar');
    const currentState = useMemo(() => {
        const parts = String(locationName || '')
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join(', ') : '';
    }, [locationName]);
    const { cartId, setCartId, cartOwnerAnonSession, cartItemCount, refreshCartCount: refreshGlobalCartCount } = useCart();
    const { getOccasions, getBanners, getCategories: getCachedCategories, invalidateCache } = useAppData();
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [selectedCategories, setSelectedCategories] = useState(new Set());

    const [cities, setCities] = useState(CITIES);
    const [banners, setBanners] = useState([]);
    const [eventTypes, setEventTypes] = useState(MOCK_EVENT_TYPES);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [formSubmitted, setFormSubmitted] = useState(false);
    const [skipForm, setSkipForm] = useState(false);
    const [userInfoModalVisible, setUserInfoModalVisible] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [recommendationsModalVisible, setRecommendationsModalVisible] = useState(false);
    const [recommendationsData, setRecommendationsData] = useState(null);
    const [plannedBudgetInr, setPlannedBudgetInr] = useState(0);
    const [recommendationFormSnapshot, setRecommendationFormSnapshot] = useState(null);
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [mapPickerVisible, setMapPickerVisible] = useState(false);
    const [eventLocLoading, setEventLocLoading] = useState(false);
    const [testimonials, setTestimonials] = useState([]);
    const [vendorsPreview, setVendorsPreview] = useState([]);
    const [vendorsPreviewLoading, setVendorsPreviewLoading] = useState(false);
    const [planTab, setPlanTab] = useState('occasions');
    const [homeSpecialServices, setHomeSpecialServices] = useState([]);
    const [homeSpecialLoading, setHomeSpecialLoading] = useState(false);
    const [homeLatestVendors, setHomeLatestVendors] = useState([]);
    const [homeLatestVendorsLoading, setHomeLatestVendorsLoading] = useState(false);
    const [resolvedPartnerGalleries, setResolvedPartnerGalleries] = useState({});
    const [partnerLightboxVisible, setPartnerLightboxVisible] = useState(false);
    const [partnerLightboxImages, setPartnerLightboxImages] = useState([]);
    const [partnerLightboxIndex, setPartnerLightboxIndex] = useState(0);
    const useApi = useBackendApi();

    const partnerGalleryResolveKey = useMemo(
        () => homeLatestVendors.map((v) => `${v.id}:${(v.gallery_urls || []).join('|')}`).join(';;'),
        [homeLatestVendors]
    );
    const validCategories = useMemo(
        () => categories.filter((cat) => cat && cat.id != null),
        [categories]
    );
    const allCategoriesSelected = validCategories.length > 0 && selectedCategories.size === validCategories.length;
    const testimonialsTwoCol = useMemo(() => {
        const rows = [];
        for (let i = 0; i < testimonials.length; i += 2) rows.push(testimonials.slice(i, i + 2));
        return rows;
    }, [testimonials]);

    const buildFallbackRecommendations = useCallback((budgetInr, categoryWeights) => {
        const baseBudget = Math.max(0, Math.round(Number(budgetInr) || plannedBudgetInr || 0));
        const sourceCategories = (categories || []).slice(0, 6);
        const categorySeed =
            sourceCategories.length > 0
                ? sourceCategories
                : [
                    { id: 'fallback-venue', name: 'Venue' },
                    { id: 'fallback-catering', name: 'Catering' },
                    { id: 'fallback-decor', name: 'Decor' },
                ];

        const ids = categorySeed.map((c) => c.id);
        const fallbackWeights = {};
        if (categoryWeights && typeof categoryWeights === 'object') {
            ids.forEach((id) => {
                const w = Number(categoryWeights[id]);
                fallbackWeights[id] = Number.isFinite(w) && w > 0 ? w : 0;
            });
        } else {
            const equal = 100 / ids.length;
            ids.forEach((id) => {
                fallbackWeights[id] = equal;
            });
        }

        const weightSum = ids.reduce((sum, id) => sum + (fallbackWeights[id] || 0), 0) || 100;
        const cats = categorySeed.map((cat) => {
            const pct = ((fallbackWeights[cat.id] || 0) / weightSum) * 100;
            const allocated = Math.round((baseBudget * pct) / 100);
            return {
                id: cat.id,
                name: cat.name || 'Category',
                percentage: pct,
                allocated_budget: allocated,
                services: [],
            };
        });

        return {
            total_budget: baseBudget,
            categories: cats,
            allocation_summary: cats.map((c) => ({
                category_id: c.id,
                name: c.name,
                percentage: c.percentage,
                allocated_inr: c.allocated_budget,
            })),
        };
    }, [categories, plannedBudgetInr]);

    const fetchRecommendationPage = useCallback(async (inr, weights) => {
        if (!useApi) {
            return { data: buildFallbackRecommendations(inr, weights), error: null };
        }
        const response = await api.getRecommendations(selectedType, {
            budget_inr: inr,
            budget: formatBudgetInrLabel(inr),
            category_weights: weights,
        });
        if (response?.error?.message && /authorization required/i.test(response.error.message)) {
            return { data: buildFallbackRecommendations(inr, weights), error: null };
        }
        return response;
    }, [buildFallbackRecommendations, selectedType, useApi]);

    const [form, setForm] = useState({
        role: '',
        contact_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
        contact_mobile: user?.phone || '',
        contact_email: user?.email || '',
        event_date: '',
        guest_count: '',
        location_preference: '',
        venue_preference: '',
        location_kind: '',
        venue_detail: '',
        planned_budget: '',
    });

    const scrollViewRef = useRef(null);
    const categorySectionYRef = useRef(0);
    const pendingScrollToCategoriesRef = useRef(false);
    const [categoryReloadNonce, setCategoryReloadNonce] = useState(0);
    const prevSelectedOccasionRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (cancelled || status !== 'granted') return;
                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (cancelled) return;
                const [rev] = await Location.reverseGeocodeAsync({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
                if (cancelled || !rev) return;
                const cityName = rev.city || rev.subregion || rev.region || 'Unknown';
                const stateName = rev.region || '';
                const displayLocation = stateName ? `${cityName}, ${stateName}` : cityName;
                setLocationName(displayLocation);
                setCurrentCity(cityName);
            } catch (e) { }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        fetchData();
    }, [currentCity]);

    useEffect(() => {
        if (!useApi) return;
        let cancelled = false;
        (async () => {
            const { data } = await api.getTestimonials();
            if (!cancelled && Array.isArray(data)) setTestimonials(data);
        })();
        return () => {
            cancelled = true;
        };
    }, [useApi]);

    const showCategoriesStep = selectedType && (formSubmitted || skipForm);

    useEffect(() => {
        if (selectedType !== prevSelectedOccasionRef.current) {
            prevSelectedOccasionRef.current = selectedType;
            if (!selectedType) {
                setUserInfoModalVisible(false);
                return;
            }
            if (!formSubmitted && !skipForm) {
                setUserInfoModalVisible(true);
            }
        }
    }, [selectedType, formSubmitted, skipForm]);

    useEffect(() => {
        if (!useApi || !selectedType) return;
        getCachedCategories(selectedType).catch(() => {});
    }, [useApi, selectedType]);

    useEffect(() => {
        if (!useApi || !showCategoriesStep || !selectedType) {
            setVendorsPreview([]);
            setVendorsPreviewLoading(false);
            return;
        }
        let cancelled = false;
        setVendorsPreviewLoading(true);
        (async () => {
            const { data, error } = await api.getVendorsPreview({
                occasion_id: selectedType,
                city: currentCity,
                state: currentState,
                limit: 200,
            });
            if (cancelled) return;
            if (!error && Array.isArray(data)) setVendorsPreview(data);
            else setVendorsPreview([]);
            setVendorsPreviewLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [useApi, showCategoriesStep, selectedType, currentCity, currentState]);

    useEffect(() => {
        if (!useApi || !currentCity) {
            setHomeLatestVendors([]);
            setHomeLatestVendorsLoading(false);
            return;
        }
        let cancelled = false;
        setHomeLatestVendorsLoading(true);
        (async () => {
            const { data, error } = await api.getVendorsPreview({
                city: currentCity,
                state: currentState,
                limit: 200,
            });
            if (cancelled) return;
            if (!error && Array.isArray(data)) setHomeLatestVendors(data);
            else setHomeLatestVendors([]);
            setHomeLatestVendorsLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [useApi, currentCity, currentState]);

    useEffect(() => {
        if (!useApi || !homeLatestVendors.length) {
            setResolvedPartnerGalleries({});
            return;
        }
        let cancelled = false;
        (async () => {
            const out = {};
            await Promise.all(
                homeLatestVendors.map(async (v) => {
                    const urls = (v.gallery_urls || []).filter(Boolean);
                    const resolved = await Promise.all(
                        urls.map(async (u) => (await resolveStorageUrl(u)) || getVendorImageUrl(u, 'gallery'))
                    );
                    out[v.id] = resolved.filter(Boolean);
                })
            );
            if (!cancelled) setResolvedPartnerGalleries(out);
        })();
        return () => {
            cancelled = true;
        };
    }, [useApi, partnerGalleryResolveKey]);

    useEffect(() => {
        if (!useApi || planTab !== 'special') return;
        if (homeSpecialServices.length > 0) return;
        let cancelled = false;
        setHomeSpecialLoading(true);
        (async () => {
            const { data, error } = await api.getSpecialServices();
            if (cancelled) return;
            if (!error && Array.isArray(data)) {
                const resolved = await Promise.all(
                    (data || []).map(async (s) => ({
                        ...s,
                        image_url: s.image_url ? await resolveStorageUrl(s.image_url) : null,
                        video_url: s.video_url ? await resolveStorageUrl(s.video_url) : null,
                    }))
                );
                setHomeSpecialServices(resolved.filter((s) => !isEInviteCatalogService(s)));
            } else {
                setHomeSpecialServices([]);
            }
            setHomeSpecialLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [useApi, planTab, homeSpecialServices.length]);

    useEffect(() => {
        if (!showCategoriesStep) {
            setCategories([]);
            setSelectedCategories(new Set());
            setCategoriesLoading(false);
            return;
        }
        let cancelled = false;
        const loadCategories = async () => {
            setCategoriesLoading(true);
            try {
                const forceRefresh = categoryReloadNonce > 0;
                const cats = await getCachedCategories(selectedType, forceRefresh);
                if (cancelled) return;
                const safeCats = (cats || []).filter((c) => c && c.id != null && String(c.id).length > 0);
                const resolved = await Promise.all(
                    safeCats.map(async (cat) => {
                        let iconUrl = cat.icon_url || null;
                        if (iconUrl && !/^https?:\/\//i.test(iconUrl)) {
                            try {
                                iconUrl = await resolveStorageUrl(iconUrl);
                            } catch (_) {
                                iconUrl = cat.icon_url || null;
                            }
                        }
                        let videoUrl = cat.video_url || null;
                        if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
                            try {
                                videoUrl = await resolveStorageUrl(videoUrl);
                            } catch (_) {
                                videoUrl = cat.video_url || null;
                            }
                        }
                        return {
                            ...cat,
                            icon_url: iconUrl,
                            video_url: videoUrl,
                        };
                    })
                );
                if (cancelled) return;
                const ordered = [...resolved].sort((a, b) => {
                    const oa = Number(a?.display_order);
                    const ob = Number(b?.display_order);
                    const na = Number.isFinite(oa) ? oa : 0;
                    const nb = Number.isFinite(ob) ? ob : 0;
                    return na - nb;
                });
                setCategories(ordered);
                setSelectedCategories(new Set());
            } catch (e) {
                if (!cancelled) {
                    console.log('[CATEGORY LOAD ERROR]', e);
                    setCategories([]);
                }
            } finally {
                if (!cancelled) setCategoriesLoading(false);
            }
        };
        loadCategories();
        return () => {
            cancelled = true;
        };
    }, [useApi, selectedType, showCategoriesStep, categoryReloadNonce]);

    useFocusEffect(
        useCallback(() => {
            refreshGlobalCartCount();
        }, [refreshGlobalCartCount])
    );

    const fetchData = async (forceRefresh = false) => {
        setLoading(true);
        try {
            const [cachedOccasions, cachedBanners] = await Promise.all([
                getOccasions(forceRefresh),
                getBanners(forceRefresh),
            ]);
            if (cachedOccasions?.length) {
                setEventTypes(cachedOccasions);
            } else {
                setEventTypes(MOCK_EVENT_TYPES);
            }
            if (cachedBanners?.length) {
                setBanners(cachedBanners);
            }

            const { data: cityData } = await dbService.getCities();
            if (cityData?.length) {
                const uniqueCityStrings = [...new Set(cityData.map(c => `${c.name}, ${c.state}`))];
                setCities(uniqueCityStrings);
            }
        } catch (error) {
            console.log('[FETCH ERROR]', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        invalidateCache();
        await fetchData(true);
        setRefreshing(false);
    }, [currentCity, selectedType]);

    const handleCityChange = (city) => {
        const cityNameOnly = city.split(',')[0].trim();
        setCurrentCity(cityNameOnly);
        setLocationName(city);
        setLocationPickerVisible(false);
    };

    const handleEventCurrentLocationPress = useCallback(async () => {
        setEventLocLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showToast({
                    variant: 'info',
                    title: 'Permission needed',
                    message: 'Allow location to pin your event area.',
                });
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [rev] = await Location.reverseGeocodeAsync({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
            const parts = [
                rev?.name,
                rev?.street,
                rev?.district,
                rev?.city,
                rev?.subregion,
                rev?.region,
                rev?.postalCode,
            ].filter(Boolean);
            const line = parts.length ? [...new Set(parts)].join(', ') : '';
            setForm((p) => ({
                ...p,
                location_preference: line || [rev?.city, rev?.region].filter(Boolean).join(', ') || 'Current location',
            }));
        } catch (e) {
            showToast({
                variant: 'error',
                title: 'Location',
                message: e?.message || 'Could not get your position.',
            });
        } finally {
            setEventLocLoading(false);
        }
    }, [showToast]);

    const handleEventTypePress = (typeObj) => {
        const id = typeof typeObj === 'object' ? typeObj.id : typeObj;
        const newId = id === selectedType ? null : id;
        setSelectedType(newId);
        if (newId) {
            setFormSubmitted(false);
            setSkipForm(false);
            if (newId !== 'wedding' && (form.role === 'Groom' || form.role === 'Bride')) {
                setForm((p) => ({ ...p, role: '' }));
            }
        }
    };

    const handleFormSubmit = async () => {
        const mobileDigits = form.contact_mobile.replace(/\D/g, '');
        if (!form.contact_name.trim() || !form.contact_mobile.trim() || mobileDigits.length < 10) {
            showToast({
                variant: 'info',
                title: tr('userinfo_validation_title'),
                message: tr('userinfo_err_phone_len'),
            });
            return;
        }
        if (form.contact_email?.trim()) {
            const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim());
            if (!okEmail) {
                showToast({
                    variant: 'info',
                    title: tr('userinfo_validation_title'),
                    message: tr('userinfo_err_email'),
                });
                return;
            }
        }
        setFormSubmitting(true);
        const budgetInrClamped = Math.min(
            MAX_PLANNED_BUDGET_INR,
            Math.max(0, Math.round(Number(plannedBudgetInr) || 0))
        );
        const budgetLabel = (form.planned_budget?.trim() || formatBudgetInrLabel(budgetInrClamped)) || null;
        const venuePref =
            form.location_kind === 'venue'
                ? form.venue_detail?.trim() || null
                : form.location_kind === 'own_place'
                    ? 'Own place'
                    : form.venue_preference || null;
        const payload = {
            role: form.role || null,
            contact_name: form.contact_name.trim(),
            contact_mobile: mobileDigits,
            contact_email: form.contact_email?.trim() || null,
            event_date: form.event_date || null,
            guest_count: form.guest_count ? parseInt(form.guest_count, 10) : null,
            location_preference: form.location_preference?.trim() || null,
            venue_preference: venuePref,
            planned_budget: budgetLabel,
            location_kind: form.location_kind || null,
            venue_detail: form.venue_detail?.trim() || null,
        };
        setEventForm(payload);
        setRecommendationFormSnapshot({
            ...payload,
            planned_budget_inr: budgetInrClamped,
            occasion_id: selectedType,
            occasion_name:
                selectedType && Array.isArray(eventTypes)
                    ? eventTypes.find((t) => t.id === selectedType)?.name ?? null
                    : null,
        });

        try {
            if (useApi && isAuthenticated) {
                let cid = cartId;
                const occasionDisplayName =
                    selectedType && Array.isArray(eventTypes)
                        ? eventTypes.find((t) => t.id === selectedType)?.name ?? null
                        : null;
                const cartPayload = {
                    event_name: occasionDisplayName,
                    event_role: form.role?.trim() || null,
                    contact_name: payload.contact_name,
                    contact_mobile: payload.contact_mobile,
                    contact_email: payload.contact_email,
                    event_date: payload.event_date,
                    guest_count: payload.guest_count,
                    location_preference: payload.location_preference,
                    venue_preference: payload.venue_preference,
                    planned_budget: payload.planned_budget,
                    planned_budget_inr: budgetInrClamped,
                };
                if (!cid) {
                    const { data: created, error } = await api.createCart({
                        session_id: 'app-' + Date.now(),
                        user_id: isAuthenticated ? user?.id : null,
                        ...cartPayload,
                    });
                    if (error && !isAuthRequiredErrorMessage(error.message)) throw new Error(error.message);
                    if (created?.id) {
                        cid = created.id;
                        await setCartId(cid, created.session_id ?? undefined);
                    }
                } else {
                    const patchOpts = { cartOwnerSession: cartOwnerAnonSession };
                    if (session?.access_token) patchOpts.accessToken = session.access_token;
                    const { error } = await api.updateCart(cid, cartPayload, patchOpts);
                    if (error && !isAuthRequiredErrorMessage(error.message)) throw new Error(error.message);
                }
                if (cid) refreshGlobalCartCount(cid);
            }

            const { data: recData, error: recErr } = await fetchRecommendationPage(budgetInrClamped);
            if (!recErr && recData?.categories?.length) {
                setRecommendationsData(recData);
                setUserInfoModalVisible(false);
                setRecommendationsModalVisible(true);
                setFormSubmitting(false);
                return;
            }
            const fallbackRec = buildFallbackRecommendations(budgetInrClamped);
            if (fallbackRec?.categories?.length) {
                setRecommendationsData(fallbackRec);
                setUserInfoModalVisible(false);
                setRecommendationsModalVisible(true);
                setFormSubmitting(false);
                return;
            }
        } catch (e) {
            if (!isAuthRequiredErrorMessage(e?.message)) {
                console.warn('[Form submit]', e);
            }
            const fallbackRec = buildFallbackRecommendations(budgetInrClamped);
            if (fallbackRec?.categories?.length) {
                setRecommendationsData(fallbackRec);
                setUserInfoModalVisible(false);
                setRecommendationsModalVisible(true);
                setFormSubmitting(false);
                return;
            }
        }
        setUserInfoModalVisible(false);
        setFormSubmitted(true);
        setFormSubmitting(false);
    };

    const handleSkipForm = () => {
        setEventForm(null);
        setSkipForm(true);
        setUserInfoModalVisible(false);
        pendingScrollToCategoriesRef.current = true;
    };

    const scrollToCategorySection = useCallback((y) => {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, []);

    const retryCategoryLoad = () => {
        setCategoryReloadNonce((n) => n + 1);
    };

    const toggleCategory = (cat) => {
        const id = typeof cat === 'object' ? cat?.id : cat;
        if (id == null) return;
        setSelectedCategories(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAllCategories = useCallback(() => {
        if (!validCategories.length) return;
        setSelectedCategories((prev) => {
            if (prev.size === validCategories.length) return new Set();
            return new Set(validCategories.map((cat) => cat.id));
        });
    }, [validCategories]);

    useEffect(() => {
        if (!validCategories.length && selectedCategories.size === 0) return;
        const validSet = new Set(validCategories.map((cat) => cat.id));
        setSelectedCategories((prev) => {
            const next = new Set([...prev].filter((id) => validSet.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [validCategories, selectedCategories.size]);

    const handleExploreServices = () => {
        const selCats = categories.filter((c) => c && c.id != null && selectedCategories.has(c.id));
        const catIds = selCats.map((c) => c.id);
        const catNames = selCats.map((c) => (c.name != null ? String(c.name) : 'Category'));
        const occasionName = eventTypes.find((t) => t.id === selectedType)?.name || '';
        if (!selectedType || !String(occasionName).trim()) {
            showToast({
                variant: 'error',
                title: 'Occasion required',
                message: 'Select an occasion first, then choose categories.',
            });
            return;
        }
        if (!catIds.length) {
            showToast({
                variant: 'info',
                title: 'Select categories',
                message: 'Pick at least one category to explore services.',
            });
            return;
        }
        navigation.navigate('CategoryServices', {
            categoryIds: catIds,
            categoryNames: catNames,
            occasionId: selectedType,
            occasionName: String(occasionName).trim(),
            cartId,
        });
    };

    const selectedOccasionObj = eventTypes.find(t => t.id === selectedType);
    const isWeddingOccasion = selectedType === 'wedding';
    const planningEventFormSnapshot = useMemo(() => {
        const mobileDigits = (form.contact_mobile || '').replace(/\D/g, '');
        const inr = Math.min(
            MAX_PLANNED_BUDGET_INR,
            Math.max(0, Math.round(Number(plannedBudgetInr) || 0))
        );
        return {
            contact_name: form.contact_name?.trim() || null,
            contact_mobile: mobileDigits.length >= 10 ? mobileDigits : null,
            contact_email: form.contact_email?.trim() || null,
            event_date: form.event_date || null,
            guest_count: form.guest_count ? parseInt(form.guest_count, 10) : null,
            location_preference: form.location_preference?.trim() || null,
            venue_preference:
                form.location_kind === 'venue'
                    ? form.venue_detail?.trim() || null
                    : form.location_kind === 'own_place'
                        ? 'Own place'
                        : form.venue_preference || null,
            location_kind: form.location_kind || null,
            role: form.role || null,
            planned_budget: form.planned_budget?.trim() || formatBudgetInrLabel(inr) || null,
            planned_budget_inr: inr,
            occasion_id: selectedType,
            occasion_name: selectedOccasionObj?.name || null,
        };
    }, [form, plannedBudgetInr, selectedType, selectedOccasionObj]);

    const catColors = ['#FF7A00', '#1E3A8A', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444', '#14B8A6', '#6366F1'];

    const renderLatestPartnersSection = () => {
        if (!useApi || (!homeLatestVendorsLoading && homeLatestVendors.length === 0)) return null;
        return (
            <View style={[styles.anonVendorsOuter, { borderColor: colors.primary + '28', backgroundColor: theme.card }]}>
                <LinearGradient
                    colors={isDarkMode ? ['rgba(255,122,0,0.14)', 'transparent'] : ['rgba(255,122,0,0.09)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.anonVendorsOuterGrad}
                    pointerEvents="none"
                />
                <View style={styles.anonVendorsInner}>
                    <View style={styles.anonVendorsHeader}>
                        <Text style={[styles.anonVendorsTitle, { color: theme.text }]}>{tr('home_latest_partners')}</Text>
                        <Text style={[styles.anonVendorsSub, { color: theme.textLight }]}>{tr('home_latest_partners_sub')}</Text>
                    </View>
                    {homeLatestVendorsLoading ? (
                        <View style={styles.anonVendorsLoading}>
                            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20 }}>
                                {[0, 1].map((idx) => (
                                    <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.background, width: HOME_PARTNER_H_CARD_W }}>
                                        <SkeletonBlock theme={theme} width="70%" height={14} />
                                        <View style={{ height: 8 }} />
                                        <SkeletonBlock theme={theme} width="100%" height={12} />
                                        <View style={{ height: 12 }} />
                                        <SkeletonBlock theme={theme} width="100%" height={72} radius={10} />
                                    </SkeletonCard>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <ScrollView
                            horizontal
                            nestedScrollEnabled
                            showsHorizontalScrollIndicator={false}
                            style={styles.anonVendorsScrollView}
                            contentContainerStyle={styles.anonVendorsScroll}
                        >
                            {homeLatestVendors.map((item) => {
                                const curatedLabel = tr('order_vendor_masked');
                                const galleryUrls = (item.gallery_urls || []).filter(Boolean);
                                const displayGalleryUrls =
                                    resolvedPartnerGalleries[item.id]?.length > 0
                                        ? resolvedPartnerGalleries[item.id]
                                        : galleryUrls.map((u) => getVendorImageUrl(u, 'gallery'));
                                const serviceNames = (item.services || []).filter(Boolean);
                                const svcLine = serviceNames.slice(0, 3).join(' · ');
                                const sliderUris =
                                    displayGalleryUrls.length > 0
                                        ? displayGalleryUrls
                                        : [getVendorImageUrl(item.gallery_urls?.[0], curatedLabel)];
                                const cityLine = item.city
                                    ? tr('home_featured_in_city').replace('{city}', String(item.city))
                                    : tr('home_partner_services_hint');
                                const goPartnerDetail = () =>
                                    navigation.navigate('VendorDetail', {
                                        vendor: {
                                            id: item.id,
                                            business_name: curatedLabel,
                                            logo_url: item.gallery_urls?.[0],
                                            gallery_urls: item.gallery_urls,
                                            city: item.city,
                                        },
                                        city: currentCity,
                                        contactLocked: true,
                                    });
                                return (
                                    <Pressable
                                        key={String(item.id)}
                                        onPress={goPartnerDetail}
                                        style={({ pressed }) => [
                                            styles.anonVendorCard,
                                            {
                                                width: HOME_PARTNER_H_CARD_W,
                                                backgroundColor: isDarkMode ? '#1A1D27' : '#FFF',
                                                borderColor: theme.border,
                                            },
                                            pressed && { opacity: 0.9 },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${curatedLabel}, ${cityLine}`}
                                    >
                                        <VendorGallerySlider
                                            imageUris={sliderUris}
                                            height={126}
                                            borderRadius={10}
                                            showDots={sliderUris.length > 1}
                                            autoSlide={sliderUris.length > 1}
                                            containerStyle={styles.anonVendorHeroSlider}
                                            placeholderColor={isDarkMode ? '#334155' : '#E5E7EB'}
                                            placeholderIconColor={theme.textLight}
                                        />
                                        <Text style={[styles.anonVendorPartnerName, { color: theme.text }]} numberOfLines={1}>
                                            {curatedLabel}
                                        </Text>
                                        <Text style={[styles.anonVendorCity, { color: theme.textLight }]} numberOfLines={1}>
                                            {cityLine}
                                        </Text>
                                        {svcLine ? (
                                            <Text style={[styles.anonVendorSvcLine, { color: theme.textLight }]} numberOfLines={2}>
                                                {svcLine}
                                            </Text>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <AnimatedBackground>
                <View style={[styles.fixedHeaderWrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.logoWrap}>
                                <Logo width={32} height={32} />
                            </View>
                            <TouchableOpacity onPress={() => setLocationPickerVisible(true)} style={styles.locationBtn}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.locationLabel, { color: theme.textLight }]}>{tr('home_your_location')}</Text>
                                    <View style={styles.locationRow}>
                                        <Ionicons name="location" size={14} color={colors.primary} />
                                        <Text
                                            style={[styles.locationValue, { color: theme.text }]}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                        >
                                            {locationName}
                                        </Text>
                                        <Ionicons name="chevron-down" size={14} color={theme.textLight} style={{ marginLeft: 2 }} />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.headerRightSpacer} />
                    </View>
                </View>

                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: TAB_BAR_CONTENT_H + Math.max(insets.bottom, TAB_BAR_BOTTOM_PAD) + 48 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                    }
                >
                    {/* Location Picker Modal */}
                    <Modal visible={locationPickerVisible} animationType="fade" transparent>
                        <TouchableOpacity style={styles.modalOverlay} onPress={() => setLocationPickerVisible(false)} activeOpacity={1}>
                            <View style={[styles.pickerContent, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
                                <View style={styles.pickerHandle} />
                                <Text style={[styles.pickerTitle, { color: theme.text }]}>{tr('home_select_city')}</Text>
                                <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                                    {[...new Set(cities)].map((city, index) => {
                                        const isCurrentCity = locationName === city;
                                        return (
                                            <TouchableOpacity
                                                key={`${city}-${index}`}
                                                style={[
                                                    styles.pickerItem,
                                                    { borderBottomColor: theme.border },
                                                    isCurrentCity && { backgroundColor: colors.primary + '10' },
                                                ]}
                                                onPress={() => handleCityChange(city)}
                                            >
                                                <Ionicons name="location-outline" size={18} color={isCurrentCity ? colors.primary : theme.textLight} />
                                                <Text style={[
                                                    styles.pickerItemText,
                                                    { color: theme.text },
                                                    isCurrentCity && { color: colors.primary, fontWeight: '700' },
                                                ]}>{city}</Text>
                                                {isCurrentCity && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </TouchableOpacity>
                    </Modal>

                    {/* Plan Your Occasion — tabs: occasions / special add-ons */}
                    <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                            <View>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('home_plan_occasion')}</Text>
                                <Text style={[styles.sectionSubtitle, { color: theme.textLight }]}>{tr('home_plan_subtitle')}</Text>
                            </View>
                        </View>
                        <View style={styles.planTabRow}>
                            <TouchableOpacity
                                style={[
                                    styles.planTabBtn,
                                    { backgroundColor: theme.card, borderColor: theme.border },
                                    planTab === 'occasions' && { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
                                ]}
                                onPress={() => setPlanTab('occasions')}
                                activeOpacity={0.85}
                            >
                                <Text style={[
                                    styles.planTabBtnText,
                                    { color: theme.text },
                                    planTab === 'occasions' && { color: colors.primary, fontWeight: '800' },
                                ]}>{tr('home_plan_tab_occasions')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.planTabBtn,
                                    { backgroundColor: theme.card, borderColor: theme.border },
                                    planTab === 'special' && { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
                                ]}
                                onPress={() => setPlanTab('special')}
                                activeOpacity={0.85}
                            >
                                <Text style={[
                                    styles.planTabBtnText,
                                    { color: theme.text },
                                    planTab === 'special' && { color: colors.primary, fontWeight: '800' },
                                ]}>{tr('home_plan_tab_special')}</Text>
                            </TouchableOpacity>
                        </View>
                        {planTab === 'occasions' ? (
                            loading ? (
                            <View style={styles.occasionRowSingle}>
                                {[1, 2, 3].map(i => (
                                    <View key={i} style={[styles.occasionCardSingle, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        <View style={[styles.occasionIconWrap, { backgroundColor: isDarkMode ? '#252840' : '#F3F4F6' }]}>
                                            <ActivityIndicator size="small" color={colors.primary} />
                                        </View>
                                        <View style={{ width: 50, height: 10, borderRadius: 5, backgroundColor: isDarkMode ? '#2D3142' : '#E5E7EB' }} />
                                    </View>
                                ))}
                            </View>
                            ) : (
                            <ScrollView
                                horizontal
                                nestedScrollEnabled
                                showsHorizontalScrollIndicator={false}
                                style={styles.occasionRailScroll}
                                contentContainerStyle={styles.occasionRailContent}
                            >
                                {eventTypes.map((type) => {
                                    const typeColor = type.color || colors.primary;
                                    const isSelected = selectedType === type.id;
                                    return (
                                        <TouchableOpacity
                                            key={type.id}
                                            style={[
                                                styles.occasionImageCard,
                                                {
                                                    width: HOME_SPECIAL_H_CARD_W,
                                                    backgroundColor: theme.card,
                                                    borderColor: isSelected ? typeColor : (isDarkMode ? theme.border : colors.primary + '24'),
                                                },
                                            ]}
                                            onPress={() => handleEventTypePress(type)}
                                            activeOpacity={0.9}
                                        >
                                            <View style={styles.occasionImageWrap}>
                                                <View style={[styles.occasionImageFrame, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}>
                                                    {type.video_url ? (
                                                        <StorageVideoCover
                                                            uri={type.video_url}
                                                            fallbackImageUri={type.image_url}
                                                            style={styles.occasionImage}
                                                            resizeMode="cover"
                                                        />
                                                    ) : type.image_url ? (
                                                        <Image source={{ uri: type.image_url }} style={styles.occasionImage} resizeMode="cover" />
                                                    ) : (
                                                        <View style={[styles.occasionImagePlaceholder, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
                                                            <Ionicons name="image-outline" size={24} color={colors.primary} />
                                                        </View>
                                                    )}
                                                </View>
                                                {isSelected ? (
                                                    <View style={[styles.occasionImageCheck, { backgroundColor: typeColor }]}>
                                                        <Ionicons name="checkmark" size={13} color="#FFF" />
                                                    </View>
                                                ) : null}
                                            </View>
                                            <Text
                                                style={[
                                                    styles.occasionImageName,
                                                    { color: isSelected ? typeColor : theme.text },
                                                ]}
                                                numberOfLines={2}
                                            >
                                                {type.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            )
                        ) : !useApi ? null : homeSpecialLoading ? (
                            <View style={styles.homeSpecialCenter}>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {[0, 1].map((idx) => (
                                        <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.background, width: HOME_SPECIAL_H_CARD_W }}>
                                            <SkeletonBlock theme={theme} width="60%" height={14} />
                                            <View style={{ height: 8 }} />
                                            <SkeletonBlock theme={theme} width="90%" height={12} />
                                            <View style={{ height: 8 }} />
                                            <SkeletonBlock theme={theme} width="45%" height={12} />
                                        </SkeletonCard>
                                    ))}
                                </View>
                            </View>
                        ) : homeSpecialServices.length === 0 ? (
                            <Text style={[styles.homeSpecialEmpty, { color: theme.textLight, paddingHorizontal: 20 }]}>
                                {tr('special_catalog_empty')}
                            </Text>
                        ) : (
                            <View style={styles.homeSpecialBody}>
                                <View style={styles.homeSpecialActionRow}>
                                    <Text style={[styles.homeSpecialActionHint, { color: theme.textLight }]}>
                                        Tap any add-on to view only its details
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.homeSpecialSelectAllBtn, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '12' }]}
                                        onPress={() =>
                                            navigation.navigate('SpecialServices', {
                                                occasionId: null,
                                                occasionName: null,
                                                city: currentCity,
                                                showAll: true,
                                            })
                                        }
                                        activeOpacity={0.9}
                                    >
                                        <Ionicons name="checkmark-done" size={14} color={colors.primary} />
                                        <Text style={[styles.homeSpecialSelectAllText, { color: colors.primary }]}>Select all</Text>
                                    </TouchableOpacity>
                                </View>
                                <ScrollView
                                    horizontal
                                    nestedScrollEnabled
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.homeSpecialHScroll}
                                    contentContainerStyle={styles.homeSpecialHContent}
                                >
                                    {homeSpecialServices.map((svc) => {
                                        const tiers = getOfferableTierRows(svc);
                                        const prices = tiers.map((t) => t.value).filter((n) => n > 0);
                                        const low = prices.length ? Math.min(...prices) : null;
                                        return (
                                            <TouchableOpacity
                                                key={svc.id}
                                                style={[
                                                    styles.homeSpecialCardInner,
                                                    {
                                                        width: HOME_SPECIAL_H_CARD_W,
                                                        backgroundColor: theme.card,
                                                        borderColor: isDarkMode ? theme.border : colors.primary + '24',
                                                    },
                                                ]}
                                                onPress={() =>
                                                    navigation.navigate('SpecialServices', {
                                                        occasionId: null,
                                                        occasionName: null,
                                                        city: currentCity,
                                                        selectedServiceId: svc.id,
                                                        showAll: false,
                                                    })
                                                }
                                                activeOpacity={0.9}
                                            >
                                                <View style={styles.homeSpecialCardImgWrap}>
                                                    <View style={[styles.homeSpecialCardImgFrame, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF' }]}>
                                                        {svc.video_url ? (
                                                            <StorageVideoCover
                                                                uri={svc.video_url}
                                                                fallbackImageUri={svc.image_url}
                                                                style={styles.homeSpecialCardImg}
                                                                resizeMode="cover"
                                                            />
                                                        ) : svc.image_url ? (
                                                            <Image source={{ uri: svc.image_url }} style={styles.homeSpecialCardImg} resizeMode="cover" />
                                                        ) : (
                                                            <View style={[styles.homeSpecialCardImgPh, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
                                                                <Ionicons name="sparkles" size={24} color={colors.primary} />
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                                <Text style={[styles.homeSpecialCardName, { color: theme.text }]} numberOfLines={2}>
                                                    {svc.name}
                                                </Text>
                                                {low != null ? (
                                                    <Text style={[styles.homeSpecialCardFrom, { color: colors.primary }]}>
                                                        from ₹{low.toLocaleString('en-IN')}
                                                    </Text>
                                                ) : null}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                                <TouchableOpacity
                                    style={[styles.homeSpecialBrowseBtn, { marginHorizontal: 20 }]}
                                    onPress={() =>
                                        navigation.navigate('SpecialServices', {
                                            occasionId: null,
                                            occasionName: null,
                                            city: currentCity,
                                            showAll: true,
                                        })
                                    }
                                    activeOpacity={0.9}
                                >
                                    <LinearGradient
                                        colors={[colors.primary, colors.secondary]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.homeSpecialBrowseGrad}
                                    >
                                        <Text style={styles.homeSpecialBrowseText}>{tr('home_special_browse_all')}</Text>
                                        <Ionicons name="arrow-forward" size={18} color="#FFF" />
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {!showCategoriesStep ? renderLatestPartnersSection() : null}

                    {/* Event details: reopen banner when modal dismissed; full form opens in modal */}
                    {selectedType && !formSubmitted && !skipForm && !userInfoModalVisible && (
                        <TouchableOpacity
                            style={[styles.eventFormBanner, { marginHorizontal: 16, marginBottom: 16 }]}
                            onPress={() => setUserInfoModalVisible(true)}
                            activeOpacity={0.9}
                        >
                            <LinearGradient
                                colors={isDarkMode ? ['#1e293b', '#0f172a'] : ['#FFF7ED', '#FFEDD5']}
                                style={styles.eventFormBannerGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <View style={[styles.eventFormBannerIcon, { backgroundColor: colors.primary + '22' }]}>
                                    <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.eventFormBannerTitle, { color: theme.text }]}>
                                        {tr('home_event_form_banner_title')}
                                    </Text>
                                    <Text style={[styles.eventFormBannerSub, { color: theme.textLight }]} numberOfLines={2}>
                                        {tr('home_event_form_banner_sub')}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward-circle" size={26} color={colors.primary} />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    <UserInfoEventModal
                        visible={userInfoModalVisible}
                        onClose={() => setUserInfoModalVisible(false)}
                        onSkip={handleSkipForm}
                        onSubmit={handleFormSubmit}
                        onStepValidationError={(msg) =>
                            showToast({
                                variant: 'info',
                                title: tr('userinfo_validation_title'),
                                message: msg,
                            })
                        }
                        form={form}
                        setForm={setForm}
                        plannedBudgetInr={plannedBudgetInr}
                        setPlannedBudgetInr={setPlannedBudgetInr}
                        occasionName={selectedOccasionObj?.name}
                        isWeddingOccasion={isWeddingOccasion}
                        tr={tr}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        formSubmitting={formSubmitting}
                        minBudgetInr={MIN_PLANNED_BUDGET_INR}
                        maxBudgetInr={MAX_PLANNED_BUDGET_INR}
                        onPressMap={() => setMapPickerVisible(true)}
                        onPressCurrentLocation={handleEventCurrentLocationPress}
                        eventLocLoading={eventLocLoading}
                        showDatePicker={showDatePicker}
                        setShowDatePicker={setShowDatePicker}
                    />

                    {/* Category Multi-Select Section - only when form submitted or skipped */}
                    {showCategoriesStep ? (
                        <View
                            onLayout={(e) => {
                                const y = e.nativeEvent.layout.y;
                                categorySectionYRef.current = y;
                                if (pendingScrollToCategoriesRef.current) {
                                    pendingScrollToCategoriesRef.current = false;
                                    scrollToCategorySection(y);
                                }
                            }}
                        >
                    {categoriesLoading && (
                        <View style={[styles.categorySection, { marginHorizontal: 16, marginBottom: 28 }]}>
                            <LinearGradient
                                colors={isDarkMode ? ['#181B25', '#1A1D27'] : ['#FFF8F0', '#FFF3E6']}
                                style={styles.categorySectionBg}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={[styles.categoryTitle, { color: theme.text }]}>{tr('home_what_need')}</Text>
                                <Text style={[styles.categorySubtitle, { color: theme.textLight, marginBottom: 20 }]}>{tr('home_loading_categories')}</Text>
                                <View style={styles.categoryLoaderRow}>
                                    {[1, 2, 3, 4].map(i => (
                                        <View key={i} style={[styles.categoryBox, { backgroundColor: isDarkMode ? '#1A1D27' : '#FFFFFF', borderColor: isDarkMode ? '#2D3142' : '#E5E7EB', width: 100 }]}>
                                            <View style={[styles.categoryIconBox, { backgroundColor: isDarkMode ? '#252840' : '#F3F4F6' }]}>
                                                <ActivityIndicator size="small" color={colors.primary} />
                                            </View>
                                            <View style={{ width: 50, height: 10, borderRadius: 5, backgroundColor: isDarkMode ? '#2D3142' : '#E5E7EB' }} />
                                        </View>
                                    ))}
                                </View>
                            </LinearGradient>
                        </View>
                    )}
                    {!categoriesLoading && categories.length === 0 && (
                        <View style={[styles.categorySection, { marginHorizontal: 16, marginBottom: 28 }]}>
                            <LinearGradient
                                colors={isDarkMode ? ['#181B25', '#1A1D27'] : ['#FFF8F0', '#FFF3E6']}
                                style={styles.categorySectionBg}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={[styles.categoryTitle, { color: theme.text }]}>{tr('home_what_need')}</Text>
                                <Text style={[styles.categorySubtitle, { color: theme.textLight, marginBottom: 16 }]}>
                                    {tr('home_categories_empty')}
                                </Text>
                                <TouchableOpacity style={styles.exploreBtn} onPress={retryCategoryLoad} activeOpacity={0.85}>
                                    <LinearGradient
                                        colors={[colors.primary, colors.secondary]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.exploreBtnGradient}
                                    >
                                        <Text style={styles.exploreBtnText}>{tr('home_categories_retry')}</Text>
                                        <Ionicons name="refresh" size={20} color="#FFF" />
                                    </LinearGradient>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    )}
                    {!categoriesLoading && categories.length > 0 && (
                        <View style={styles.categorySection}>
                            <LinearGradient
                                colors={isDarkMode ? ['#181B25', '#1A1D27'] : ['#FFF8F0', '#FFF3E6']}
                                style={styles.categorySectionBg}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <View style={styles.categoryHeaderRow}>
                                    <View>
                                        <Text style={[styles.categoryTitle, { color: theme.text }]}>
                                            {tr('home_what_need')}
                                        </Text>
                                        <Text style={[styles.categorySubtitle, { color: theme.textLight }]}>
                                            {tr('home_pick_categories')} {selectedOccasionObj?.name || tr('home_your_event')}
                                        </Text>
                                    </View>
                                    <View style={styles.categoryHeaderActions}>
                                        <TouchableOpacity
                                            style={[
                                                styles.categorySelectAllBtn,
                                                { borderColor: colors.primary + '4D', backgroundColor: colors.primary + '10' },
                                            ]}
                                            onPress={toggleAllCategories}
                                            activeOpacity={0.85}
                                        >
                                            <Ionicons
                                                name={allCategoriesSelected ? 'close-circle' : 'checkmark-circle'}
                                                size={14}
                                                color={colors.primary}
                                            />
                                            <Text style={[styles.categorySelectAllText, { color: colors.primary }]}>
                                                {allCategoriesSelected ? 'Clear all' : 'Select all'}
                                            </Text>
                                        </TouchableOpacity>
                                        {selectedCategories.size > 0 && (
                                            <View style={[styles.selectedCountBadge, { backgroundColor: colors.primary }]}>
                                                <Text style={styles.selectedCountText}>{selectedCategories.size}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                <ScrollView
                                    horizontal
                                    nestedScrollEnabled
                                    directionalLockEnabled
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.categoryScrollContent}
                                >
                                    {validCategories.map((cat, idx) => {
                                        const catColor = catColors[idx % catColors.length];
                                        const isSelected = selectedCategories.has(cat.id);
                                        return (
                                            <TouchableOpacity
                                                key={String(cat.id)}
                                                style={[
                                                    styles.categoryBox,
                                                    { backgroundColor: isDarkMode ? '#1A1D27' : '#FFFFFF', borderColor: isDarkMode ? '#2D3142' : '#E5E7EB' },
                                                    isSelected && { borderColor: catColor, borderWidth: 2, backgroundColor: catColor + '08' },
                                                ]}
                                                onPress={() => toggleCategory(cat)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={[styles.categoryIconBox, { backgroundColor: catColor + '18' }]}>
                                                    {cat.video_url ? (
                                                        <StorageVideoCover
                                                            uri={cat.video_url}
                                                            fallbackImageUri={cat.icon_url || cat.image_url}
                                                            style={styles.categoryBoxImg}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (cat.icon_url || cat.image_url) ? (
                                                        <Image source={{ uri: cat.icon_url || cat.image_url }} style={styles.categoryBoxImg} resizeMode="cover" />
                                                    ) : (
                                                        <Text style={styles.categoryBoxEmoji}>{cat.icon || '📂'}</Text>
                                                    )}
                                                </View>
                                                <Text style={[
                                                    styles.categoryBoxLabel,
                                                    { color: theme.text },
                                                    isSelected && { color: catColor, fontWeight: '700' },
                                                ]} numberOfLines={2}>{cat.name}</Text>
                                                <View style={[
                                                    styles.categoryCheckbox,
                                                    { borderColor: isSelected ? catColor : (isDarkMode ? '#4B5563' : '#D1D5DB') },
                                                    isSelected && { backgroundColor: catColor, borderColor: catColor },
                                                ]}>
                                                    {isSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>

                                {selectedCategories.size > 0 && (
                                    <TouchableOpacity
                                        style={styles.exploreBtn}
                                        onPress={handleExploreServices}
                                        activeOpacity={0.85}
                                    >
                                        <LinearGradient
                                            colors={[colors.primary, colors.secondary]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.exploreBtnGradient}
                                        >
                                            <Text style={styles.exploreBtnText}>
                                                {tr('home_explore_categories')} {selectedCategories.size}{' '}
                                                {selectedCategories.size === 1 ? tr('home_category_single') : tr('home_category_plural')}
                                            </Text>
                                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                                        </LinearGradient>
                                    </TouchableOpacity>
                                )}
                            </LinearGradient>
                        </View>
                    )}
                        </View>
                    ) : null}

                    {showCategoriesStep ? renderLatestPartnersSection() : null}

                    {showCategoriesStep && !categoriesLoading && useApi && (vendorsPreviewLoading || vendorsPreview.length > 0) ? (
                        <View style={[styles.previewSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.previewTitle, { color: theme.text }]}>{tr('home_top_vendors_title')}</Text>
                            <Text style={[styles.previewSub, { color: theme.textLight }]}>{tr('home_top_vendors_sub')}</Text>
                            {vendorsPreviewLoading ? (
                                <View style={styles.previewLoading}>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        {[0, 1].map((idx) => (
                                            <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.background, width: 220 }}>
                                                <SkeletonBlock theme={theme} width="70%" height={14} />
                                                <View style={{ height: 8 }} />
                                                <SkeletonBlock theme={theme} width="100%" height={12} />
                                                <View style={{ height: 12 }} />
                                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                                    <SkeletonBlock theme={theme} width={48} height={48} radius={8} />
                                                    <SkeletonBlock theme={theme} width={48} height={48} radius={8} />
                                                    <SkeletonBlock theme={theme} width={48} height={48} radius={8} />
                                                </View>
                                            </SkeletonCard>
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                <ScrollView
                                    horizontal
                                    nestedScrollEnabled
                                    directionalLockEnabled
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.previewScroll}
                                >
                                    {vendorsPreview.map((item) => {
                                        const curatedLabel = tr('order_vendor_masked');
                                        const thumbs = (item.gallery_urls || []).filter(Boolean);
                                        const sliderUris =
                                            thumbs.length > 0
                                                ? thumbs.map((uri) => getVendorImageUrl(uri, 'gallery'))
                                                : [getVendorImageUrl(item.logo_url, curatedLabel)];
                                        const svcLine = (item.services || []).filter(Boolean).slice(0, 3).join(' · ');
                                        const cityLine = item.city
                                            ? tr('home_featured_in_city').replace('{city}', String(item.city))
                                            : tr('home_partner_services_hint');
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[styles.previewCard, { backgroundColor: isDarkMode ? '#1A1D27' : '#FFF', borderColor: theme.border }]}
                                                activeOpacity={0.85}
                                                onPress={() =>
                                                    navigation.navigate('VendorDetail', {
                                                        vendor: {
                                                            id: item.id,
                                                            business_name: curatedLabel,
                                                            logo_url: item.gallery_urls?.[0],
                                                            gallery_urls: item.gallery_urls,
                                                            city: item.city,
                                                        },
                                                        city: currentCity,
                                                        contactLocked: true,
                                                    })
                                                }
                                            >
                                                <VendorGallerySlider
                                                    imageUris={sliderUris}
                                                    height={126}
                                                    borderRadius={10}
                                                    autoSlide={sliderUris.length > 1}
                                                    containerStyle={styles.previewCardSlider}
                                                    showDots={sliderUris.length > 1}
                                                    placeholderColor={isDarkMode ? '#334155' : '#E5E7EB'}
                                                    placeholderIconColor={theme.textLight}
                                                />
                                                <Text style={[styles.previewCardLabel, { color: theme.text }]} numberOfLines={1}>
                                                    {curatedLabel}
                                                </Text>
                                                <Text style={[styles.previewCardHint, { color: theme.textLight }]} numberOfLines={1}>
                                                    {cityLine}
                                                </Text>
                                                {svcLine ? (
                                                    <Text style={[styles.previewCardHint, { color: theme.textLight }]} numberOfLines={2}>
                                                        {svcLine}
                                                    </Text>
                                                ) : null}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}
                        </View>
                    ) : null}

                    {/* Guest Manager */}
                    <TouchableOpacity
                        style={[styles.guestManagerCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => navigation.navigate('GuestManage')}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={isDarkMode ? ['#181B25', '#1A1D27'] : ['#EEF2FF', '#E8EDFF']}
                            style={styles.guestManagerGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.guestManagerContent}>
                                <View style={[styles.guestManagerIcon, { backgroundColor: '#8B5CF6' + '20' }]}>
                                    <Ionicons name="people" size={26} color="#8B5CF6" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.guestManagerTitle, { color: theme.text }]}>{tr('home_guest_manager_card')}</Text>
                                    <Text style={[styles.guestManagerDesc, { color: theme.textLight }]}>
                                        {tr('home_guest_manager_desc')}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={22} color={theme.textLight} />
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Banner Ads — pairs of 2 sliding horizontally */}
                    {banners.length > 0 && (
                        <View style={styles.bannerSection}>
                            <FlatList
                                data={banners.reduce((pairs, item, i) => {
                                    if (i % 2 === 0) pairs.push([item]);
                                    else pairs[pairs.length - 1].push(item);
                                    return pairs;
                                }, [])}
                                renderItem={({ item: pair }) => {
                                    const pageW = width - BANNER_EDGE_PAD * 2;
                                    const colW = (pageW - BANNER_TILE_GAP) / 2;
                                    return (
                                        <View style={[styles.bannerPairPage, { width: pageW }]}>
                                            {pair.map((banner) => {
                                                const discount = bannerDiscountLabel(banner);
                                                return (
                                                    <TouchableOpacity
                                                        key={banner.id}
                                                        style={[styles.bannerBentoTile, { width: colW, height: 160 }]}
                                                        activeOpacity={0.92}
                                                    >
                                                        <Image
                                                            source={{
                                                                uri:
                                                                    banner.image_url ||
                                                                    'https://images.unsplash.com/photo-1519741497674-611481863552?w=800',
                                                            }}
                                                            style={styles.bannerImage}
                                                            resizeMode="cover"
                                                        />
                                                        <LinearGradient
                                                            colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.82)']}
                                                            style={styles.bannerOverlayFill}
                                                        >
                                                            {discount ? (
                                                                <View style={[styles.bannerDiscountPill, { backgroundColor: colors.primary }]}>
                                                                    <Text style={styles.bannerDiscountPillText}>{discount}</Text>
                                                                </View>
                                                            ) : null}
                                                            <View style={styles.bannerTextBlock}>
                                                                <Text style={styles.bannerBentoTitle} numberOfLines={2}>
                                                                    {banner.title}
                                                                </Text>
                                                                {banner.subtitle ? (
                                                                    <Text style={styles.bannerBentoSubtitle} numberOfLines={2}>
                                                                        {banner.subtitle}
                                                                    </Text>
                                                                ) : null}
                                                            </View>
                                                        </LinearGradient>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    );
                                }}
                                keyExtractor={(_, i) => String(i)}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                pagingEnabled
                                decelerationRate="fast"
                                contentContainerStyle={styles.bannerList}
                            />
                        </View>
                    )}

                    {/* Help & Contact Us */}
                    <View style={[styles.helpSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.help, { color: 'red', fontSize: 12 }]}></Text>
                        <Text style={[styles.helpSubtitle, { color: theme.textLight }]}>{tr('home_help_subtitle')}</Text>
                        <View style={styles.helpButtons}>
                            <TouchableOpacity
                                style={[styles.helpBtn, { backgroundColor: colors.primary + '10' }]}
                                onPress={() => navigation.navigate('HelpSupport')}
                            >
                                <Ionicons name="help-circle-outline" size={22} color={colors.primary} />
                                <Text style={[styles.helpBtnText, { color: colors.primary }]}>{tr('home_help_faq')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.helpBtn, { backgroundColor: '#25D366' + '15' }]}
                                onPress={() => Linking.openURL('https://wa.me/918422948781')}
                            >
                                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                                <Text style={[styles.helpBtnText, { color: '#25D366' }]}>{tr('home_help_whatsapp')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.helpBtn, { backgroundColor: '#3B82F6' + '12' }]}
                                onPress={() => Linking.openURL('tel:+918422948781')}
                            >
                                <Ionicons name="call-outline" size={22} color="#3B82F6" />
                                <Text style={[styles.helpBtnText, { color: '#3B82F6' }]}>{tr('home_help_call')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {testimonials.length > 0 ? (
                        <View style={[styles.testimonialsSection, { borderColor: theme.border, backgroundColor: theme.card }]}>
                            <View style={styles.testimonialsHeader}>
                                <Text style={[styles.testimonialsKicker, { color: colors.primary }]}>{tr('home_testimonials_kicker')}</Text>
                                <Text style={[styles.testimonialsTitle, { color: theme.text }]}>{tr('home_testimonials_title')}</Text>
                                <Text style={[styles.testimonialsSubtitle, { color: theme.textLight }]}>
                                    {tr('home_testimonials_sub')}
                                </Text>
                            </View>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.testimonialsScroll}
                                decelerationRate="fast"
                                snapToInterval={width - 32}
                            >
                                {testimonialsTwoCol.map((row, rowIndex) => (
                                    <View key={`t-row-${rowIndex}`} style={styles.testimonialsGridPage}>
                                        {row.map((item) => (
                                            <LinearGradient
                                                key={item.id}
                                                colors={isDarkMode ? ['#1e293b', '#0f172a'] : ['#FFFFFF', '#FFF8F0']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={[
                                                    styles.testimonialCard,
                                                    { borderColor: isDarkMode ? '#334155' : colors.primary + '35' },
                                                ]}
                                            >
                                                {item.image_url ? (
                                                    <Image source={{ uri: item.image_url }} style={styles.testimonialHeroImg} />
                                                ) : (
                                                    <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.testimonialHeroImgPh}>
                                                        <Text style={styles.testimonialAvatarText}>
                                                            {(item.display_name || '?').charAt(0).toUpperCase()}
                                                        </Text>
                                                    </LinearGradient>
                                                )}
                                                <View style={styles.testimonialTop}>
                                                    <Text style={[styles.testimonialName, { color: theme.text }]} numberOfLines={1}>
                                                        {item.display_name}
                                                    </Text>
                                                    <View style={styles.testimonialActions}>
                                                        {item.video_url ? (
                                                            <TouchableOpacity style={styles.tMiniBtn} onPress={() => Linking.openURL(item.video_url)}>
                                                                <Ionicons name="logo-youtube" size={14} color="#EF4444" />
                                                                <Text
                                                                    style={[
                                                                        styles.tMiniBtnText,
                                                                        { color: isDarkMode ? '#FECACA' : '#5B21B6' },
                                                                    ]}
                                                                >
                                                                    {tr('home_video')}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ) : null}
                                                        {item.voice_recording_url ? (
                                                            <TouchableOpacity style={styles.tMiniBtn} onPress={() => Linking.openURL(item.voice_recording_url)}>
                                                                <Ionicons name="mic" size={14} color={colors.primary} />
                                                                <Text
                                                                    style={[
                                                                        styles.tMiniBtnText,
                                                                        { color: isDarkMode ? '#C4B5FD' : '#5B21B6' },
                                                                    ]}
                                                                >
                                                                    {tr('home_voice')}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ) : null}
                                                    </View>
                                                </View>
                                                {item.testimonial_text ? (
                                                    <Text style={[styles.testimonialQuote, { color: theme.text }]} numberOfLines={5}>
                                                        "{item.testimonial_text}"
                                                    </Text>
                                                ) : null}
                                            </LinearGradient>
                                        ))}
                                        {row.length === 1 ? <View style={styles.testimonialCardGhost} /> : null}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    ) : null}

                    <View style={{ height: 80 }} />
                </ScrollView>
            </AnimatedBackground>

            <ChatModal
                visible={chatModalVisible}
                onClose={() => setChatModalVisible(false)}
                city={currentCity}
                occasionId={selectedType}
                occasionName={selectedOccasionObj?.name}
                plannedBudgetInr={plannedBudgetInr}
                eventFormSnapshot={planningEventFormSnapshot}
                navigation={navigation}
            />

            <LocationMapPickerModal
                visible={mapPickerVisible}
                onClose={() => setMapPickerVisible(false)}
                onConfirm={({ address }) => {
                    setForm((p) => ({ ...p, location_preference: address || p.location_preference }));
                }}
            />

            <Modal visible={partnerLightboxVisible} transparent animationType="fade">
                <View style={styles.partnerLightboxBackdrop}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setPartnerLightboxVisible(false)}
                    />
                    <View style={styles.partnerLightboxInner}>
                        <TouchableOpacity
                            onPress={() => setPartnerLightboxVisible(false)}
                            style={styles.partnerLightboxClose}
                        >
                            <Ionicons name="close" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Image
                            source={{ uri: partnerLightboxImages[partnerLightboxIndex] }}
                            style={styles.partnerLightboxImage}
                            resizeMode="contain"
                        />
                        {partnerLightboxImages.length > 1 ? (
                            <View style={styles.partnerLightboxPager}>
                                <TouchableOpacity
                                    style={styles.partnerLightboxNav}
                                    onPress={() =>
                                        setPartnerLightboxIndex((prev) =>
                                            prev === 0 ? partnerLightboxImages.length - 1 : prev - 1
                                        )
                                    }
                                >
                                    <Ionicons name="chevron-back" size={20} color="#FFF" />
                                </TouchableOpacity>
                                <Text style={styles.partnerLightboxCount}>
                                    {partnerLightboxIndex + 1}/{partnerLightboxImages.length}
                                </Text>
                                <TouchableOpacity
                                    style={styles.partnerLightboxNav}
                                    onPress={() =>
                                        setPartnerLightboxIndex((prev) =>
                                            prev === partnerLightboxImages.length - 1 ? 0 : prev + 1
                                        )
                                    }
                                >
                                    <Ionicons name="chevron-forward" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        ) : null}
                    </View>
                </View>
            </Modal>

            <RecommendationBudgetModal
                visible={recommendationsModalVisible}
                onClose={(result) => {
                    setRecommendationsModalVisible(false);
                    setFormSubmitted(true);
                    if (result === 'explore') {
                        const cats = (recommendationsData?.categories || []).filter((c) => c && c.id != null);
                        const occName =
                            selectedOccasionObj?.name ||
                            eventTypes.find((t) => t.id === selectedType)?.name ||
                            '';
                        if (cats.length && selectedType && String(occName).trim()) {
                            navigation.navigate('CategoryServices', {
                                categoryIds: cats.map((c) => c.id),
                                categoryNames: cats.map((c) => c.name ?? 'Category'),
                                occasionId: selectedType,
                                occasionName: String(occName).trim(),
                                cartId,
                            });
                        }
                    } else if (result === 'cart') {
                        navigation.navigate('Cart');
                    }
                }}
                theme={theme}
                colors={colors}
                city={currentCity}
                occasionId={selectedType}
                occasionName={selectedOccasionObj?.name}
                data={recommendationsData}
                setData={setRecommendationsData}
                fetchRecommendationPage={fetchRecommendationPage}
                cartId={cartId}
                setCartId={setCartId}
                isAuthenticated={isAuthenticated}
                user={user}
                navigation={navigation}
                refreshCartCount={refreshGlobalCartCount}
                formSnapshot={recommendationFormSnapshot}
            />

            <TouchableOpacity
                style={[
                    styles.aiChatFab,
                    {
                        bottom: TAB_BAR_CONTENT_H + Math.max(insets.bottom, TAB_BAR_BOTTOM_PAD) + 8,
                    },
                ]}
                onPress={() => setChatModalVisible(true)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Open Ekatraa AI"
            >
                <LinearGradient
                    colors={[colors.primary, colors.primaryGradientEnd || colors.gradientEnd || '#FFA040']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.aiChatFabGrad}
                >
                    <Ionicons name="chatbubbles" size={26} color="#FFF" />
                </LinearGradient>
            </TouchableOpacity>

            <BottomTabBar
                navigation={navigation}
                activeRoute="Home"
                cartItemCount={cartItemCount}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    aiChatFab: {
        position: 'absolute',
        right: 18,
        zIndex: 40,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.22,
                shadowRadius: 8,
            },
            android: { elevation: 10 },
        }),
    },
    aiChatFabGrad: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: { paddingBottom: 40 },
    fixedHeaderWrap: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingTop: 6,
        paddingBottom: 10,
        zIndex: 30,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 0,
        marginBottom: 0,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 10,
    },
    logoWrap: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    locationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    locationLabel: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    locationValue: { fontSize: 15, fontWeight: '700', flexShrink: 1, maxWidth: '92%' },
    /** Reserve space for global language + cart overlay */
    headerRightSpacer: {
        width: 84,
        height: 38,
    },
    section: { marginBottom: 28 },
    sectionTitleRow: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    sectionSubtitle: {
        fontSize: 13,
        marginTop: 3,
    },
    planTabRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 10,
        marginBottom: 16,
    },
    planTabBtn: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    planTabBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    homeSpecialCenter: {
        paddingVertical: 28,
        alignItems: 'center',
    },
    homeSpecialEmpty: {
        textAlign: 'center',
        fontSize: 14,
        paddingVertical: 20,
    },
    homeSpecialBody: {
        paddingBottom: 4,
    },
    homeSpecialActionRow: {
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        gap: 10,
    },
    homeSpecialActionHint: {
        fontSize: 12,
        flex: 1,
    },
    homeSpecialSelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    homeSpecialSelectAllText: {
        fontSize: 12,
        fontWeight: '700',
    },
    homeSpecialHScroll: {
        flexGrow: 0,
    },
    homeSpecialHContent: {
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingLeft: 20,
        paddingRight: 22,
        paddingVertical: 10,
        gap: 14,
    },
    homeSpecialCardInner: {
        borderRadius: 14,
        borderWidth: 1.5,
        overflow: 'hidden',
        paddingBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 5,
    },
    homeSpecialCardImgWrap: {
        width: '100%',
        aspectRatio: 1.08,
        backgroundColor: 'transparent',
        padding: 8,
    },
    homeSpecialCardImgFrame: {
        width: '100%',
        height: '100%',
        borderRadius: 11,
        borderWidth: 1,
        borderColor: 'rgba(124,58,237,0.22)',
        overflow: 'hidden',
    },
    homeSpecialCardImg: {
        width: '100%',
        height: '100%',
    },
    homeSpecialCardImgPh: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    homeSpecialCardName: {
        fontSize: 13,
        fontWeight: '700',
        paddingHorizontal: 8,
        marginTop: 8,
        minHeight: 34,
    },
    homeSpecialCardFrom: {
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 8,
        marginTop: 4,
    },
    homeSpecialBrowseBtn: {
        marginTop: 16,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 8,
    },
    homeSpecialBrowseGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    homeSpecialBrowseText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
    },
    anonVendorsOuter: {
        marginHorizontal: 0,
        marginBottom: 20,
        borderRadius: 0,
        borderWidth: 0,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    anonVendorsOuterGrad: {
        ...StyleSheet.absoluteFillObject,
    },
    anonVendorsInner: {
        zIndex: 1,
        paddingTop: 16,
        paddingBottom: 4,
    },
    anonVendorsHeader: {
        marginBottom: 12,
        paddingHorizontal: 20,
    },
    anonVendorsTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    anonVendorsSub: {
        fontSize: 12,
        marginTop: 4,
        lineHeight: 17,
    },
    anonVendorsLoading: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    anonVendorsScrollView: {
        flexGrow: 0,
    },
    anonVendorsScroll: {
        paddingLeft: 20,
        paddingRight: 20,
    },
    anonVendorCard: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
        marginRight: 12,
        padding: 8,
        paddingBottom: 10,
    },
    anonVendorHeroSlider: {
        width: '100%',
        marginBottom: 6,
    },
    anonVendorPartnerName: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 2,
    },
    anonVendorSvcLine: {
        fontSize: 11,
        lineHeight: 15,
        marginTop: 2,
    },
    anonVendorGridCell: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#E5E7EB',
        position: 'relative',
    },
    anonVendorBentoTop: {
        flexDirection: 'row',
        minHeight: 176,
    },
    anonVendorBentoLead: {
        flex: 1.2,
        minHeight: 176,
        marginRight: 6,
    },
    anonVendorBentoRight: {
        flex: 0.8,
    },
    anonVendorBentoSmall: {
        flex: 1,
        minHeight: 85,
    },
    anonVendorBentoSmallTop: {
        marginBottom: 6,
    },
    anonVendorBentoBottom: {
        marginTop: 6,
        flexDirection: 'row',
        minHeight: 86,
    },
    anonVendorBentoBottomCell: {
        flex: 1,
        minHeight: 86,
    },
    anonVendorBentoBottomCellLeft: {
        marginRight: 6,
    },
    anonVendorGridImage: {
        width: '100%',
        height: '100%',
    },
    anonVendorGridOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    anonVendorGridOverlayText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '700',
    },
    anonVendorCardFooter: {
        paddingHorizontal: 12,
        paddingTop: 4,
        paddingBottom: 4,
    },
    anonVendorCity: {
        fontSize: 14,
        fontWeight: '800',
    },
    anonVendorSvc: {
        fontSize: 12,
        marginTop: 4,
        lineHeight: 17,
    },
    anonVendorChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
    },
    anonVendorChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        maxWidth: '100%',
    },
    anonVendorChipText: {
        fontSize: 11,
        fontWeight: '600',
    },
    anonVendorFooterHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 8,
    },
    anonVendorFooterHintText: {
        fontSize: 12,
        fontWeight: '700',
    },
    partnerLightboxBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    partnerLightboxInner: {
        width: '100%',
        alignItems: 'center',
    },
    partnerLightboxClose: {
        position: 'absolute',
        top: -46,
        right: 2,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    partnerLightboxImage: {
        width: '100%',
        height: 380,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    partnerLightboxPager: {
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    partnerLightboxNav: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    partnerLightboxCount: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
        minWidth: 56,
        textAlign: 'center',
    },
    occasionRowSingle: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: OCCASION_CARD_GAP,
    },
    occasionCardSingle: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 18,
        borderWidth: 1.5,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
    },
    occasionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: OCCASION_CARD_GAP,
    },
    occasionGridExpanded: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: OCCASION_CARD_GAP,
        marginTop: 12,
    },
    occasionCard: {
        width: OCCASION_CARD_WIDTH,
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 10,
        borderRadius: 18,
        borderWidth: 1.5,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
    },
    othersCard: {
        borderStyle: 'dashed',
    },
    occasionCardCompact: {
        width: OCCASION_CARD_WIDTH,
    },
    occasionCardCompact3Col: {
        width: OCCASION_CARD_WIDTH_3COL,
    },
    occasionIconWrap: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    occasionIconImg: { width: 38, height: 38, borderRadius: 12 },
    occasionEmoji: { fontSize: 28 },
    occasionLabel: { fontSize: 13, textAlign: 'center', fontWeight: '600' },
    occasionCheck: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    occasionRailScroll: {
        flexGrow: 0,
    },
    occasionRailContent: {
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingLeft: 20,
        paddingRight: 22,
        paddingVertical: 8,
        gap: 14,
    },
    occasionImageCard: {
        borderRadius: 14,
        borderWidth: 1.5,
        overflow: 'hidden',
        paddingBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 5,
    },
    occasionImageWrap: {
        width: '100%',
        aspectRatio: 1.08,
        backgroundColor: 'transparent',
        padding: 8,
        position: 'relative',
    },
    occasionImageFrame: {
        width: '100%',
        height: '100%',
        borderRadius: 11,
        borderWidth: 1,
        borderColor: 'rgba(124,58,237,0.22)',
        overflow: 'hidden',
    },
    occasionImage: {
        width: '100%',
        height: '100%',
    },
    occasionImagePlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    occasionImageName: {
        fontSize: 13,
        fontWeight: '700',
        paddingHorizontal: 8,
        marginTop: 8,
        minHeight: 34,
    },
    occasionImageCheck: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 24,
        height: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Category multi-select section
    categorySection: {
        marginHorizontal: 16,
        marginBottom: 28,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 6,
    },
    categorySectionBg: {
        padding: 20,
        borderRadius: 20,
    },
    categoryHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 18,
    },
    categoryHeaderActions: {
        alignItems: 'flex-end',
        gap: 8,
    },
    categorySelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    categorySelectAllText: {
        fontSize: 12,
        fontWeight: '700',
    },
    categoryTitle: {
        fontSize: 19,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    categorySubtitle: {
        fontSize: 13,
        marginTop: 4,
    },
    selectedCountBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedCountText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
    },
    categoryScrollContent: {
        paddingRight: 8,
        gap: 10,
    },
    categoryBox: {
        width: 110,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1.5,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    categoryIconBox: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    categoryBoxImg: { width: 38, height: 38, borderRadius: 10 },
    categoryBoxEmoji: { fontSize: 28 },
    categoryBoxLabel: {
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 15,
        textAlign: 'center',
        marginBottom: 8,
    },
    categoryCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exploreBtn: {
        marginTop: 20,
        borderRadius: 14,
        overflow: 'hidden',
    },
    exploreBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        paddingHorizontal: 24,
        gap: 8,
    },
    exploreBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingTop: 12,
        maxHeight: '70%',
    },
    pickerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CCC',
        alignSelf: 'center',
        marginBottom: 16,
    },
    pickerTitle: {
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 16,
    },
    pickerScroll: { maxHeight: 400 },
    pickerScrollContent: { paddingBottom: 20 },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        gap: 12,
    },
    pickerItemText: { flex: 1, fontSize: 16, fontWeight: '500' },
    bannerSection: { marginBottom: 24 },
    bannerList: { paddingHorizontal: BANNER_EDGE_PAD },
    bannerPairPage: {
        flexDirection: 'row',
        gap: BANNER_TILE_GAP,
        marginRight: BANNER_TILE_GAP,
    },
    bannerCard: {
        width: width - 40,
        height: 170,
        borderRadius: 20,
        overflow: 'hidden',
        marginRight: 12,
    },
    bannerBentoWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: BANNER_EDGE_PAD,
        gap: BANNER_TILE_GAP,
        justifyContent: 'flex-start',
    },
    bannerBentoTile: {
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#111',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
    },
    bannerImage: { width: '100%', height: '100%' },
    bannerOverlayFill: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        padding: 14,
    },
    bannerDiscountPill: {
        position: 'absolute',
        top: 12,
        right: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        maxWidth: '70%',
    },
    bannerDiscountPillText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    bannerTextBlock: { justifyContent: 'flex-end' },
    bannerTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    bannerBentoTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 3,
        lineHeight: 20,
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    bannerBentoSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 12, lineHeight: 16 },
    bannerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },

    aiChatBar: {
        marginHorizontal: 20,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    aiIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiPlaceholder: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    categoryLoaderRow: {
        flexDirection: 'row',
        gap: 10,
    },
    eventFormBanner: {
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    eventFormBannerGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 14,
    },
    eventFormBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    eventFormBannerTitle: {
        fontSize: 16,
        fontWeight: '800',
    },
    eventFormBannerSub: {
        fontSize: 12,
        marginTop: 2,
        lineHeight: 17,
    },
    userInfoModalRoot: {
        flex: 1,
    },
    userInfoModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    userInfoModalClose: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    userInfoModalHeaderTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '800',
    },
    userInfoModalScroll: {
        paddingHorizontal: 18,
        paddingBottom: 36,
    },
    formSection: {
        marginHorizontal: 16,
        marginBottom: 24,
        borderRadius: 20,
        borderWidth: 1,
        padding: 20,
    },
    formSectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    formSectionSubtitle: {
        fontSize: 13,
        marginBottom: 18,
    },
    formGroup: { marginBottom: 14 },
    formLabel: { fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
    formHint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
    locActionRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
    locActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    locActionText: { fontSize: 13, fontWeight: '700' },
    locPreview: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 4,
    },
    locPreviewText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    formRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    formCol: { flex: 1 },
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
    dateBtn: { justifyContent: 'center' },
    dateText: { flex: 1, paddingVertical: 10, fontSize: 14 },
    recModalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingTop: 12,
        justifyContent: 'flex-start',
    },
    recModalScroll: { flex: 1 },
    recModalScrollContent: { paddingBottom: 24 },
    recModalActions: {
        flexDirection: 'row',
        gap: 12,
        paddingTop: 16,
        marginTop: 12,
        borderTopWidth: 1,
    },
    recCatBlock: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    recCatName: { fontSize: 16, fontWeight: '700' },
    recCatBudget: { fontSize: 12, fontWeight: '600' },
    recNearestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginBottom: 8,
    },
    recNearestLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    recNearestName: { fontSize: 14, fontWeight: '600' },
    recNearestPrice: { fontSize: 13, fontWeight: '700', marginTop: 4 },
    recRestServices: { marginTop: 4, marginLeft: 8 },
    recSvcRow: { paddingVertical: 6 },
    recSvcName: { fontSize: 13 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    roleText: { fontSize: 13, fontWeight: '600' },
    budgetSliderHint: { fontSize: 12, marginBottom: 6, lineHeight: 17 },
    budgetSliderValue: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    budgetSlider: { width: '100%', height: 40, marginBottom: 12 },
    budgetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    budgetChip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    budgetText: { fontSize: 12, fontWeight: '600' },
    formActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    skipBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    skipBtnText: { fontSize: 15, fontWeight: '700' },
    submitBtn: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
    },
    submitBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        gap: 8,
    },
    submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    previewSection: {
        marginHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    previewTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    previewSub: {
        fontSize: 12,
        marginBottom: 12,
        lineHeight: 18,
    },
    previewLoading: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    previewScroll: {
        paddingRight: 8,
    },
    previewCard: {
        width: 190,
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
        marginRight: 12,
    },
    previewCardSlider: {
        margin: 8,
        marginBottom: 4,
    },
    previewCardLabel: {
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingTop: 4,
    },
    previewCardHint: {
        fontSize: 11,
        paddingHorizontal: 10,
        paddingBottom: 10,
        lineHeight: 15,
    },
    helpSection: {
        marginHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        padding: 20,
        marginBottom: 16,
    },
    helpTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    helpSubtitle: {
        fontSize: 13,
        marginBottom: 16,
    },
    helpButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    helpBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 6,
    },
    helpBtnText: {
        fontSize: 11,
        fontWeight: '700',
    },
    guestManagerCard: {
        marginHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 16,
    },
    guestManagerGradient: {
        borderRadius: 20,
    },
    guestManagerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        gap: 14,
    },
    guestManagerIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestManagerTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 3,
    },
    guestManagerDesc: {
        fontSize: 12,
        lineHeight: 17,
    },
    specialSkipWrap: {
        marginHorizontal: 16,
        marginBottom: 14,
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
    specialSkipGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 12,
    },
    specialSkipIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    specialSkipTitle: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    specialSkipSub: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 11,
        lineHeight: 15,
        marginTop: 3,
    },
    testimonialsSection: {
        marginHorizontal: 16,
        marginBottom: 20,
        borderRadius: 22,
        borderWidth: 1,
        paddingBottom: 18,
        overflow: 'hidden',
    },
    testimonialsHeader: {
        paddingHorizontal: 18,
        paddingTop: 20,
        paddingBottom: 12,
    },
    testimonialsKicker: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    testimonialsTitle: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    testimonialsSubtitle: {
        fontSize: 13,
        marginTop: 4,
    },
    testimonialsScroll: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        gap: 12,
    },
    testimonialsGridPage: {
        width: width - 32,
        paddingHorizontal: 14,
        flexDirection: 'row',
        gap: 10,
    },
    testimonialCard: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        padding: 10,
    },
    testimonialCardGhost: {
        flex: 1,
    },
    testimonialHeroImg: {
        width: '100%',
        height: 138,
        borderRadius: 11,
        marginBottom: 10,
    },
    testimonialHeroImgPh: {
        width: '100%',
        height: 138,
        borderRadius: 11,
        marginBottom: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    testimonialTop: {
        marginBottom: 8,
    },
    testimonialAvatarText: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '800',
    },
    testimonialName: {
        fontSize: 14,
        fontWeight: '700',
    },
    testimonialActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 5,
    },
    tMiniBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(124,58,237,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    tMiniBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#5B21B6',
    },
    testimonialQuote: {
        fontSize: 14,
        lineHeight: 20,
        fontStyle: 'italic',
        opacity: 0.95,
    },
});
