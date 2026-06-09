import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRazorpay } from '@codearcade/expo-razorpay';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useCart } from '../../context/CartContext';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';
import {
    ADVANCE_PAYMENT_POLICY,
    CANCELLATION_POLICY,
    REFUND_POLICY,
    TERMS_AND_CONDITIONS,
    PROTECTION_PLAN_DETAILS,
    PROTECTION_HEADLINE,
    PROTECTION_SUB,
    POLICY_MODAL_LABELS,
} from '../../content/checkoutPolicyTexts';
import { computeProtectionAmountInr } from '../../utils/bookingProtection';
import { cartRequiresFullPayment, computeOnlineChargeInr } from '../../utils/cartPaymentMode';
import { getLineItemParts, tierIndexFromOptions, TIER_ACCENT_COLORS } from '../../utils/lineItemDisplay';
import { Image, FlatList, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { resolveStorageUrl } from '../../services/supabase';
import { getOfferableTierRows } from '../../utils/lineItemDisplay';
const ADVANCE_HEADLINE = 'Pay 20% advance & confirm booking now. (Recommended)';
const ADVANCE_BULLETS = [
    'Instant booking confirmation (recommended vendor by Ekatraa)',
    'Vendor reserved exclusively for your event',
    'Priority support & smooth execution',
    'Confirmed availability guaranteed',
];
const ADVANCE_FOOTER = '100% secure payment | verified vendors | govt-compliant process';

const LATER_HEADLINE = 'Explore & pay 20% later.';
const LATER_BULLETS = [
    'Explore multiple vendor options',
    'Get assistance from the Ekatraa team',
    'Confirm anytime by paying 20% advance',
    'Availability subject to demand',
];
const LATER_FOOTER = 'High-demand vendors get booked quickly. Confirm now to avoid unavailability.';

const POLICY_CONTENT = {
    terms_combined: [
        ADVANCE_PAYMENT_POLICY,
        CANCELLATION_POLICY,
        REFUND_POLICY,
        TERMS_AND_CONDITIONS,
    ].join('\n\n'),
    protection: PROTECTION_PLAN_DETAILS,
};

const POLICY_KEYS = ['protection', 'terms_combined'];
const POLICY_DISPLAY = {
    terms_combined: 'Terms, Advance Payment, Cancellation & Refund Policy',
};

export default function Checkout({ route, navigation }) {
    const { openCheckout, closeCheckout, RazorpayUI } = useRazorpay();
    const { theme } = useTheme();
    const { showToast } = useToast();
    const { isAuthenticated, user, session, refreshSession } = useAuth();
    const { clearCart, cartItemCount, cartOwnerAnonSession } = useCart();
    const { cartId, userId: paramUserId, cart } = route.params || {};

    const [paymentMode, setPaymentMode] = useState('advance');
    const [saving, setSaving] = useState(false);
    const [cartDetails, setCartDetails] = useState(null);
    const [loadingCart, setLoadingCart] = useState(true);
    const [protectionPlanEnabled, setProtectionPlanEnabled] = useState(true);
    const [protectionSettings, setProtectionSettings] = useState(null);
    const [policyModal, setPolicyModal] = useState(null);
    const [agreements, setAgreements] = useState({
        protection: false,
        terms_combined: false,
    });
    const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
    const [modalScrollViewportHeight, setModalScrollViewportHeight] = useState(0);
    const [advancePayExpanded, setAdvancePayExpanded] = useState(false);
    const [laterPayExpanded, setLaterPayExpanded] = useState(false);
    const [gstExpanded, setGstExpanded] = useState(false);

    const allPoliciesAgreed = POLICY_KEYS.every((k) => agreements[k]);

    const approvePolicyModal = () => {
        if (policyModal === 'terms_combined' && !termsScrolledToEnd) return;
        if (policyModal && POLICY_KEYS.includes(policyModal)) {
            setAgreements((prev) => ({ ...prev, [policyModal]: true }));
        }
        setPolicyModal(null);
    };

    const openPolicyModal = (key) => {
        if (key === 'terms_combined') {
            setTermsScrolledToEnd(false);
        }
        setPolicyModal(key);
    };

    useEffect(() => {
        if (!cartId) {
            setLoadingCart(false);
            return;
        }
        (async () => {
            const { data } = await api.getCart(cartId, {
                cartOwnerSession: cartOwnerAnonSession,
                accessToken: session?.access_token || null,
            });
            if (data) setCartDetails(data);
            setLoadingCart(false);
        })();
    }, [cartId, cartOwnerAnonSession, session?.access_token]);

    useEffect(() => {
        (async () => {
            const { data } = await api.getBookingProtection();
            if (data) setProtectionSettings(data);
        })();
    }, []);

    const [addOns, setAddOns] = useState([]);
    const [addOnsLoading, setAddOnsLoading] = useState(false);
    const [addedAddOnIds, setAddedAddOnIds] = useState(new Set());

    useEffect(() => {
        let cancelled = false;
        setAddOnsLoading(true);
        (async () => {
            const { data, error } = await api.getSpecialServices();
            if (cancelled || error || !Array.isArray(data)) {
                setAddOnsLoading(false);
                return;
            }
            const resolved = await Promise.all(
                data
                    .filter(s => String(s.id || '') !== 'e1000001-0000-4000-8000-000000000001' && !/e-invite|e invite/i.test(String(s.name || '')))
                    .map(async (s) => ({
                        ...s,
                        image_url: s.image_url ? await resolveStorageUrl(s.image_url) : null,
                    }))
            );
            if (!cancelled) setAddOns(resolved);
            setAddOnsLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const eventInfo = cartDetails || cart || {};
    const items = eventInfo.items || cart?.items || [];
    const totalAmount = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
    const addOnTotal = [...addedAddOnIds].reduce((sum, id) => {
        const svc = addOns.find(s => s.id === id);
        if (!svc) return sum;
        const tiers = getOfferableTierRows(svc);
        const prices = tiers.map(t => t.value).filter(n => n > 0);
        return sum + (prices.length ? Math.min(...prices) : 0);
    }, 0);
    const combinedSubtotal = totalAmount + addOnTotal;
    const protectionAmount = computeProtectionAmountInr(combinedSubtotal, protectionSettings, protectionPlanEnabled);
    const grandTotal = totalAmount + protectionAmount;
    const requiresFullPayment = useMemo(() => {
        const rows = (cartDetails && cartDetails.items) || (cart && cart.items) || [];
        return cartRequiresFullPayment(Array.isArray(rows) ? rows : []);
    }, [cartDetails, cart]);
    const advanceAmount = useMemo(
        () => computeOnlineChargeInr(combinedSubtotal, protectionAmount, requiresFullPayment, 20),
        [combinedSubtotal, protectionAmount, requiresFullPayment]
    );
    // GST = 18% on (advanceAmount + protectionAmount)
    const gstBase = advanceAmount + protectionAmount;
    const gstAmount = Math.round(gstBase * 0.18);
    const payNowTotal = gstBase + gstAmount;
    const balanceAmount = grandTotal - advanceAmount;
    useEffect(() => {
        if (!requiresFullPayment) return;
        setPaymentMode((m) => (m === 'on_finalization' ? 'advance' : m));
    }, [requiresFullPayment]);

    const handleSubmit = async () => {
        const uid = paramUserId || (isAuthenticated && user?.id ? user.id : null);
        if (!uid) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please sign in to place an order.' });
            navigation.navigate('Login');
            return;
        }
        if (!cartId) {
            showToast({ variant: 'error', title: 'Error', message: 'No cart to checkout.' });
            return;
        }

        if (!allPoliciesAgreed) {
            const pending = POLICY_KEYS
                .filter((k) => !agreements[k])
                .map((k) => POLICY_DISPLAY[k] || POLICY_MODAL_LABELS[k] || k);
            showToast({
                variant: 'info',
                title: 'Review policies',
                message: `Please open each policy below and tap “I have read and agree”. Pending: ${pending.join(', ')}.`,
            });
            return;
        }

        if (paymentMode === 'on_finalization') {
            setSaving(true);
            const { data: order, error } = await api.checkout({
                cart_id: cartId,
                user_id: uid,
                payment_mode: 'on_finalization',
                booking_protection: protectionPlanEnabled,
            });
            setSaving(false);
            if (error) {
                showToast({
                    variant: 'error',
                    title: 'Checkout failed',
                    message: error?.message || 'Could not place order. Please try again.',
                });
                return;
            }
            clearCart();
            navigation.replace('OrderSummary', {
                orderId: order?.id,
                order,
                cartItems: items,
                totalAmount: grandTotal,
                servicesSubtotal: totalAmount,
                protectionAmount,
                grandTotal,
                advanceAmount: 0,
                balanceAmount: grandTotal,
                plannedBudget: eventInfo.planned_budget || null,
                paymentMode: 'on_finalization',
                bookingProtection: protectionPlanEnabled,
            });
            return;
        }

        const sessionForPay = await refreshSession();
        const accessToken = sessionForPay?.access_token;
        if (!accessToken) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again to complete payment.' });
            navigation.navigate('Login');
            return;
        }
        setSaving(true);
        const { data: paymentData, error: paymentErr } = await api.createPaymentOrder(
            {
                cart_id: cartId,
                booking_protection: protectionPlanEnabled,
            },
            accessToken
        );
        setSaving(false);
        if (paymentErr || !paymentData?.razorpay_order_id) {
            let errMsg = paymentErr?.message || paymentData?.error || 'Could not create payment. Please try again.';
            let hint = '';
            if (errMsg.toLowerCase().includes('razorpay') || errMsg.toLowerCase().includes('configured')) {
                hint = '\n\nAdd RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend (Vercel → Settings → Environment Variables), then redeploy.';
            } else if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('endpoint')) {
                hint = '\n\nRedeploy the backend to Vercel so payment routes are included. Or use local backend: set EXPO_PUBLIC_API_URL=http://localhost:3000 in ekatraa .env.';
            }
            showToast({ variant: 'error', title: 'Payment setup failed', message: errMsg + hint });
            return;
        }
        openCheckout(
            {
                key: paymentData.key,
                amount: paymentData.amount,
                currency: 'INR',
                order_id: paymentData.razorpay_order_id,
                name: 'Ekatraa',
                description: requiresFullPayment
                    ? `Full payment - ₹${(paymentData.advance_amount ?? advanceAmount).toLocaleString()}`
                    : `Advance payment (20%) - ₹${(paymentData.advance_amount ?? advanceAmount).toLocaleString()}`,
                prefill: {
                    name: eventInfo.contact_name || '',
                    email: eventInfo.contact_email || user?.email || '',
                    contact: eventInfo.contact_mobile || user?.phone || '',
                },
                theme: { color: colors.primary },
            },
            {
                onSuccess: async (data) => {
                    closeCheckout();
                    setSaving(true);
                    const verifySess = await refreshSession();
                    const verifyTok = verifySess?.access_token;
                    if (!verifyTok) {
                        setSaving(false);
                        showToast({
                            variant: 'error',
                            title: 'Session expired',
                            message: 'Sign in again to complete payment verification.',
                        });
                        navigation.navigate('Login');
                        return;
                    }
                    const { data: order, error: verifyErr } = await api.verifyPayment(
                        {
                            razorpay_payment_id: data.razorpay_payment_id,
                            razorpay_order_id: data.razorpay_order_id,
                            razorpay_signature: data.razorpay_signature,
                            cart_id: cartId,
                            user_id: uid,
                            booking_protection: protectionPlanEnabled,
                        },
                        verifyTok
                    );
                    setSaving(false);
                    if (verifyErr) {
                        showToast({
                            variant: 'error',
                            title: 'Verification failed',
                            message: verifyErr.message || 'Payment could not be verified.',
                        });
                        return;
                    }
                    clearCart();
                    const advPaid =
                        order?.advance_amount != null ? Number(order.advance_amount) : advanceAmount;
                    const balDue = Math.max(0, grandTotal - advPaid);
                    navigation.replace('OrderSummary', {
                        orderId: order?.id,
                        order,
                        cartItems: items,
                        totalAmount: grandTotal,
                        servicesSubtotal: totalAmount,
                        protectionAmount,
                        grandTotal,
                        advanceAmount: advPaid,
                        balanceAmount: balDue,
                        plannedBudget: eventInfo.planned_budget || null,
                        bookingProtection: protectionPlanEnabled,
                    });
                },
                onFailure: (err) => {
                    showToast({
                        variant: 'error',
                        title: 'Payment failed',
                        message: err?.description || 'Payment could not be completed.',
                    });
                },
                onClose: () => { },
            }
        );
    };

    const DetailRow = ({ icon, label, value }) => {
        if (!value) return null;
        return (
            <View style={styles.detailRow}>
                <Ionicons name={icon} size={16} color={theme.textLight} />
                <Text style={[styles.detailLabel, { color: theme.textLight }]}>{label}</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Checkout</Text>
                </View>

                {loadingCart ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                        {items.length > 0 && (
                            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                             <Text style={[styles.cardTitle, { color: theme.text }]}>Services</Text>
                                {items.map((item, idx) => {
                                    const parts = getLineItemParts(item);
                                    const occ = eventInfo.event_name;
                                    const metaParts = [parts.categoryName, occ].filter(Boolean);
                                    const accentIdx = tierIndexFromOptions(item.options);
                                    const accent =
                                        accentIdx >= 0
                                            ? TIER_ACCENT_COLORS[accentIdx % TIER_ACCENT_COLORS.length]
                                            : colors.primary;
                                    const tierLine = [parts.tierName, parts.qtyLabel].filter(Boolean).join(' · ');
                                    return (
                                        <View
                                            key={item.id || idx}
                                            style={[
                                                styles.itemRow,
                                                {
                                                    borderBottomColor: theme.border,
                                                    borderLeftWidth: 4,
                                                    borderLeftColor: accent,
                                                    paddingLeft: 10,
                                                },
                                            ]}
                                        >
                                            <View style={{ flex: 1 }}>
                                                {metaParts.length > 0 ? (
                                                    <Text style={[styles.itemCategoryOccasion, { color: theme.textLight }]}>
                                                        {metaParts.join(' · ')}
                                                    </Text>
                                                ) : null}
                                                <Text style={[styles.itemName, { color: theme.text }]}>
                                                    {parts.serviceName}
                                                </Text>
                                                {tierLine ? (
                                                    <Text style={[styles.itemTier, { color: accent }]}>{tierLine}</Text>
                                                ) : null}
                                                {parts.subVariety ? (
                                                    <Text style={[styles.itemSubVar, { color: theme.textLight }]}>
                                                        {parts.subVariety}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Text style={[styles.itemPrice, { color: theme.text }]}>
                                                ₹{(Number(item.unit_price || 0) * Number(item.quantity || 1)).toLocaleString()}
                                            </Text>
                                        </View>
                                    );
                                })}
                                {[...addedAddOnIds].map(id => {
                                    const svc = addOns.find(s => s.id === id);
                                    if (!svc) return null;
                                    const tiers = getOfferableTierRows(svc);
                                    const prices = tiers.map(t => t.value).filter(n => n > 0);
                                    const price = prices.length ? Math.min(...prices) : 0;
                                    return (
                                        <View
                                            key={id}
                                            style={[
                                                styles.itemRow,
                                                {
                                                    borderBottomColor: theme.border,
                                                    borderLeftWidth: 4,
                                                    borderLeftColor: colors.primary,
                                                    paddingLeft: 10,
                                                },
                                            ]}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.itemCategoryOccasion, { color: theme.textLight }]}>
                                                    Special add-on
                                                </Text>
                                                <Text style={[styles.itemName, { color: theme.text }]}>{svc.name}</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setAddedAddOnIds(prev => {
                                                    const next = new Set(prev);
                                                    next.delete(id);
                                                    return next;
                                                })}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <Ionicons name="close-circle" size={18} color={theme.textLight} />
                                            </TouchableOpacity>
                                            <Text style={[styles.itemPrice, { color: theme.text, marginLeft: 8 }]}>
                                                ₹{price.toLocaleString()}
                                            </Text>
                                        </View>
                                    );
                                })}
                                <Text style={[styles.cardTitle, { color: theme.text,marginTop: 24 }]}>Order Summary</Text>
                                {(eventInfo.event_name || eventInfo.event_role) && (
                                    <View
                                        style={[
                                            styles.orderSummaryMeta,
                                            { backgroundColor: theme.background, borderColor: theme.border },
                                        ]}
                                    >
                                        {eventInfo.event_name ? (
                                            <View style={styles.orderMetaRow}>
                                                <Text style={[styles.orderMetaLabel, { color: theme.textLight }]}>
                                                    Occasion
                                                </Text>
                                                <Text style={[styles.orderMetaValue, { color: theme.text }]} numberOfLines={2}>
                                                    {eventInfo.event_name}
                                                </Text>
                                            </View>
                                        ) : null}
                                        {eventInfo.event_role ? (
                                            <View style={styles.orderMetaRow}>
                                                <Text style={[styles.orderMetaLabel, { color: theme.textLight }]}>Role</Text>
                                                <Text style={[styles.orderMetaValue, { color: theme.text }]} numberOfLines={2}>
                                                    {eventInfo.event_role}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                )}
                               
                                {/* Services subtotal */}
                                <View style={styles.totalRow}>
                                    <Text style={[styles.totalLabel, { color: theme.textLight }]}>Services subtotal</Text>
                                    <Text style={[styles.totalValue, { color: theme.text, fontSize: 16 }]}>
                                        ₹{combinedSubtotal.toLocaleString()}
                                    </Text>
                                </View>

                                {/* Advance 20% — small muted sub-row */}
                                <View style={[styles.totalRow, { marginTop: 2 }]}>
                                    <Text style={[styles.subRowLabel, { color: theme.textLight }]}>
                                        Advance
                                    </Text>
                                    <Text style={[styles.subRowValue, { color: theme.textLight }]}>
                                        ₹{advanceAmount.toLocaleString()}
                                    </Text>
                                </View>

                                {/* Booking protection */}
                                {protectionPlanEnabled && protectionAmount > 0 && (
                                    <View style={[styles.totalRow, { marginTop: 2 }]}>
                                        <Text style={[styles.totalLabel, { color: theme.textLight }]}>Booking protection</Text>
                                        <Text style={[styles.totalValue, { color: theme.text, fontSize: 16 }]}>
                                            ₹{protectionAmount.toLocaleString()}
                                        </Text>
                                    </View>
                                )}

                                {/* GST — always visible, faded, clickable to show breakdown */}
                                <TouchableOpacity
                                    style={[styles.totalRow, { marginTop: 2, opacity: 0.45 }]}
                                    onPress={() => setGstExpanded(v => !v)}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[styles.subRowLabel, { color: theme.textLight }]}>
                                        GST
                                    </Text>
                                    {gstExpanded && (
                                        <Text style={[styles.subRowValue, { color: theme.textLight }]}>
                                            ₹{gstAmount.toLocaleString()}
                                        </Text>
                                    )}
                                </TouchableOpacity>



                                {/* Divider */}
                                <View style={[styles.totalDivider, { borderColor: theme.border }]} />

                                {/* Total order value — subtotal + protection + GST */}
                                <View style={styles.totalRow}>
                                    <Text style={[styles.totalLabel, { color: theme.textLight }]}>Total order value</Text>
                                    <Text style={[styles.totalValue, { color: theme.text, fontSize: 16 }]}>
                                        ₹{(totalAmount + protectionAmount + gstAmount).toLocaleString()}
                                    </Text>
                                </View>

                                {/* Pay now */}
                                <View style={styles.totalRow}>
                                    <Text style={[styles.totalLabel, { color: theme.text }]}>Pay now</Text>
                                    <Text style={[styles.totalValue, { color: colors.primary }]}>
                                        ₹{payNowTotal.toLocaleString()}
                                    </Text>
                                </View>
                            </View>

                        )}
                        {/* ── Swiggy-style Add-ons Strip ── */}
                        {(addOnsLoading || addOns.length > 0) && (
                            <View style={[addOnStyles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <View style={addOnStyles.headerRow}>
                                    <View style={[addOnStyles.headerAccent, { backgroundColor: colors.primary }]} />
                                    <Text style={[addOnStyles.headerTitle, { color: theme.text }]}>Add to your booking</Text>
                                    <Text style={[addOnStyles.headerBadge, { backgroundColor: colors.primary + '18', color: colors.primary }]}>
                                        Special add-ons
                                    </Text>
                                </View>
                                <Text style={[addOnStyles.headerSub, { color: theme.textLight }]}>
                                    Frequently booked together · Instant confirmation
                                </Text>

                                {addOnsLoading ? (
                                    <View style={addOnStyles.loadingRow}>
                                        {[0, 1, 2].map(i => (
                                            <View key={i} style={[addOnStyles.skeletonCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                                <View style={[addOnStyles.skeletonImg, { backgroundColor: theme.border }]} />
                                                <View style={[addOnStyles.skeletonLine, { backgroundColor: theme.border, width: '70%' }]} />
                                                <View style={[addOnStyles.skeletonLine, { backgroundColor: theme.border, width: '45%', marginTop: 4 }]} />
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <FlatList
                                        data={addOns}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        keyExtractor={item => String(item.id)}
                                        contentContainerStyle={addOnStyles.listContent}
                                        renderItem={({ item: svc }) => {
                                            const tiers = getOfferableTierRows(svc);
                                            const prices = tiers.map(t => t.value).filter(n => n > 0);
                                            const basePrice = prices.length ? Math.min(...prices) : null;
                                            // Dummy discount: cycle through 10%, 15%, 20% based on index
                                            const discountPcts = [10, 15, 20, 12, 18];
                                            const discountPct = discountPcts[addOns.indexOf(svc) % discountPcts.length];
                                            const originalPrice = basePrice ? Math.round(basePrice / (1 - discountPct / 100)) : null;
                                            const isAdded = addedAddOnIds.has(svc.id);

                                            return (
                                                <View style={[addOnStyles.card, { backgroundColor: theme.background, borderColor: isAdded ? colors.primary : theme.border }]}>
                                                    {/* Discount badge */}
                                                    {discountPct && (
                                                        <View style={[addOnStyles.discountBadge, { backgroundColor: colors.primary }]}>
                                                            <Text style={addOnStyles.discountText}>{discountPct}% OFF</Text>
                                                        </View>
                                                    )}

                                                    {/* Image */}
                                                    <View style={[addOnStyles.imgWrap, { backgroundColor: theme.card }]}>
                                                        {svc.image_url ? (
                                                            <Image source={{ uri: svc.image_url }} style={addOnStyles.img} resizeMode="cover" />
                                                        ) : (
                                                            <LinearGradient
                                                                colors={['#5B21B6', '#C2410C']}
                                                                style={addOnStyles.imgPlaceholder}
                                                            >
                                                                <Ionicons name="sparkles" size={22} color="#FFF" />
                                                            </LinearGradient>
                                                        )}
                                                    </View>

                                                    {/* Info */}
                                                    <Text style={[addOnStyles.svcName, { color: theme.text }]} numberOfLines={2}>
                                                        {svc.name}
                                                    </Text>
                                                    {basePrice != null && (
                                                        <View style={addOnStyles.priceRow}>
                                                            <Text style={[addOnStyles.price, { color: theme.text }]}>
                                                                ₹{basePrice.toLocaleString('en-IN')}
                                                            </Text>
                                                            {originalPrice && (
                                                                <Text style={[addOnStyles.originalPrice, { color: theme.textLight }]}>
                                                                    ₹{originalPrice.toLocaleString('en-IN')}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    )}

                                                    {/* Add button */}
                                                    <TouchableOpacity
                                                        style={[
                                                            addOnStyles.addBtn,
                                                            {
                                                                borderColor: isAdded ? colors.primary : colors.primary,
                                                                backgroundColor: isAdded ? colors.primary : 'transparent',
                                                            },
                                                        ]}
                                                        onPress={() => {
                                                            setAddedAddOnIds(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(svc.id)) next.delete(svc.id);
                                                                else next.add(svc.id);
                                                                return next;
                                                            });
                                                            if (!isAdded) {
                                                                showToast({
                                                                    variant: 'info',
                                                                    title: 'Add-on noted',
                                                                    message: `${svc.name} — go to Special Services to add it to your cart.`,
                                                                    action: {
                                                                        label: 'Go',
                                                                        onPress: () => navigation.navigate('SpecialServices', {
                                                                            occasionId: null,
                                                                            occasionName: null,
                                                                            city: eventInfo.location_preference || '',
                                                                            selectedServiceId: svc.id,
                                                                        }),
                                                                    },
                                                                });
                                                            }
                                                        }}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text style={[addOnStyles.addBtnText, { color: isAdded ? '#FFF' : colors.primary }]}>
                                                            {isAdded ? '✓ Added' : '+ Add'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        }}
                                    />
                                )}
                            </View>
                        )}


                        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>Event Details</Text>
                            <Text style={[styles.hint, { color: theme.textLight }]}>
                                These details were provided when adding services. Vendors will use them to prepare accurate quotes.
                            </Text>
                            <DetailRow icon="person-outline" label="Name" value={eventInfo.contact_name} />
                            <DetailRow icon="call-outline" label="Phone" value={eventInfo.contact_mobile} />
                            <DetailRow icon="mail-outline" label="Email" value={eventInfo.contact_email} />
                            <DetailRow icon="calendar-outline" label="Event Date" value={eventInfo.event_date} />
                            <DetailRow icon="people-outline" label="Guests" value={eventInfo.guest_count ? String(eventInfo.guest_count) : null} />
                            <DetailRow icon="location-outline" label="Location" value={eventInfo.location_preference} />
                            <DetailRow icon="business-outline" label="Venue" value={eventInfo.venue_preference} />
                            <DetailRow icon="cash-outline" label="Budget" value={eventInfo.planned_budget} />
                        </View>

                        <View style={[styles.paymentInfo, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.paymentInfoTitle, { color: theme.text }]}>Payment method</Text>
                            {requiresFullPayment ? (
                                <Text style={[styles.paymentFullPayBanner, { color: theme.textLight, borderColor: theme.border, backgroundColor: theme.background }]}>
                                    Your cart includes AI e-invites and/or special-catalog add-ons. Today's charge is the full order total (including booking protection if enabled) - not 20% advance.
                                </Text>
                            ) : null}

                            <View
                                style={[
                                    styles.paymentOption,
                                    {
                                        borderColor: paymentMode === 'advance' ? colors.primary : theme.border,
                                        backgroundColor: paymentMode === 'advance' ? colors.primary + '08' : 'transparent',
                                    },
                                ]}
                            >
                                <TouchableOpacity
                                    style={styles.paymentOptionHeaderRow}
                                    onPress={() => setPaymentMode('advance')}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.paymentOptionRadio, { borderColor: paymentMode === 'advance' ? colors.primary : theme.border }]}>
                                        {paymentMode === 'advance' && (
                                            <View style={[styles.paymentOptionRadioInner, { backgroundColor: colors.primary }]} />
                                        )}
                                    </View>
                                    <Text style={[styles.paymentOptionHeadline, { color: theme.text, flex: 1, marginBottom: 0 }]}>
                                        {requiresFullPayment
                                            ? 'Pay in full now (digital / special add-ons)'
                                            : ADVANCE_HEADLINE}
                                    </Text>
                                    <Ionicons name="card" size={20} color={paymentMode === 'advance' ? colors.primary : theme.textLight} />
                                </TouchableOpacity>
                                <View style={styles.paymentDetailsBlock}>
                                    <Text style={[styles.paymentInfoText, { color: theme.textLight }]}>
                                        {requiresFullPayment
                                            ? `Full order total ₹${grandTotal.toLocaleString()} due now (includes protection if on).`
                                            : `Pay 20% now · Balance ₹${balanceAmount.toLocaleString()} later.`}
                                    </Text>
                                    {advancePayExpanded ? (
                                        <>
                                            {ADVANCE_BULLETS.map((line) => (
                                                <Text key={line} style={[styles.paymentBullet, { color: theme.textLight }]}>
                                                    ✔ {line}
                                                </Text>
                                            ))}
                                            <Text style={[styles.paymentOptionFooter, { color: theme.textLight }]}>
                                                🔒 {ADVANCE_FOOTER}
                                            </Text>
                                            <Text style={[styles.paymentInfoText, { color: theme.textLight, marginTop: 10 }]}>
                                                {requiresFullPayment
                                                    ? `You are paying ₹${advanceAmount.toLocaleString()} in full. Nothing further for this order via advance billing.`
                                                    : `Pay 20% advance (₹${advanceAmount.toLocaleString()}) now. Balance ₹${balanceAmount.toLocaleString()} payable later.`}
                                            </Text>
                                        </>
                                    ) : null}
                                    <TouchableOpacity
                                        onPress={() => setAdvancePayExpanded((v) => !v)}
                                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={advancePayExpanded ? 'Show less payment details' : 'Read more payment details'}
                                    >
                                        <Text style={[styles.readMoreText, { color: colors.primary }]}>
                                            {advancePayExpanded ? 'Show less' : 'Read more'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {requiresFullPayment ? (
                                <View
                                    style={[
                                        styles.paymentOptionDisabledNote,
                                        { borderColor: theme.border, backgroundColor: theme.background },
                                    ]}
                                >
                                    <Ionicons name="information-circle-outline" size={22} color={theme.textLight} />
                                    <Text style={[styles.paymentDisabledNoteText, { color: theme.textLight }]}>
                                        Pay on finalization is not available for carts with e-invites or special-catalog items - you need to complete payment now.
                                    </Text>
                                </View>
                            ) : (
                                <View
                                    style={[
                                        styles.paymentOption,
                                        {
                                            borderColor: paymentMode === 'on_finalization' ? colors.primary : theme.border,
                                            backgroundColor:
                                                paymentMode === 'on_finalization' ? colors.primary + '08' : 'transparent',
                                        },
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.paymentOptionHeaderRow}
                                        onPress={() => setPaymentMode('on_finalization')}
                                        activeOpacity={0.8}
                                    >
                                        <View
                                            style={[
                                                styles.paymentOptionRadio,
                                                { borderColor: paymentMode === 'on_finalization' ? colors.primary : theme.border },
                                            ]}
                                        >
                                            {paymentMode === 'on_finalization' && (
                                                <View style={[styles.paymentOptionRadioInner, { backgroundColor: colors.primary }]} />
                                            )}
                                        </View>
                                        <Text style={[styles.paymentOptionHeadline, { color: theme.text, flex: 1, marginBottom: 0 }]}>
                                            {LATER_HEADLINE}
                                        </Text>
                                        <Ionicons
                                            name="cash"
                                            size={20}
                                            color={paymentMode === 'on_finalization' ? colors.primary : theme.textLight}
                                        />
                                    </TouchableOpacity>
                                    <View style={styles.paymentDetailsBlock}>
                                        <Text style={[styles.paymentInfoText, { color: theme.textLight }]}>
                                            Book without paying online now; pay 20% when you confirm with the team.
                                        </Text>
                                        {laterPayExpanded ? (
                                            <>
                                                {LATER_BULLETS.map((line) => (
                                                    <Text key={line} style={[styles.paymentBullet, { color: theme.textLight }]}>
                                                        • {line}
                                                    </Text>
                                                ))}
                                                <Text style={[styles.paymentOptionFooter, { color: theme.textLight }]}>🔥 {LATER_FOOTER}</Text>
                                                <Text style={[styles.paymentInfoText, { color: theme.textLight, marginTop: 10 }]}>
                                                    You will settle the service amount (and any protection) after vendors confirm - see policies.
                                                </Text>
                                            </>
                                        ) : null}
                                        <TouchableOpacity
                                            onPress={() => setLaterPayExpanded((v) => !v)}
                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                            accessibilityRole="button"
                                            accessibilityLabel={laterPayExpanded ? 'Show less' : 'Read more'}
                                        >
                                            <Text style={[styles.readMoreText, { color: colors.primary }]}>
                                                {laterPayExpanded ? 'Show less' : 'Read more'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>

                        <View style={[styles.policyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.policyCardTitle, { color: theme.text }]}>Payment options</Text>
                            <Text style={[styles.protectionHeadline, { color: theme.text }]}>{PROTECTION_HEADLINE}</Text>
                            <Text style={[styles.protectionSub, { color: theme.textLight }]}>{PROTECTION_SUB}</Text>
                            <View style={styles.protectionRow}>
                                <Text style={[styles.protectionLabel, { color: theme.text }]}>
                                    {protectionPlanEnabled ? 'Protection plan on' : 'Protection plan off'}
                                </Text>
                                <Switch
                                    value={protectionPlanEnabled}
                                    onValueChange={setProtectionPlanEnabled}
                                    trackColor={{ false: theme.border, true: colors.primary + '88' }}
                                    thumbColor={protectionPlanEnabled ? colors.primary : '#f4f3f4'}
                                />
                            </View>
                            <Text style={[styles.protectionHint, { color: theme.textLight }]}>
                                {protectionPlanEnabled
                                    ? protectionAmount > 0
                                        ? requiresFullPayment
                                            ? `Add-on: ₹${protectionAmount.toLocaleString()} (included in your pay-now total).`
                                            : `Add-on: ₹${protectionAmount.toLocaleString()} (included in order total & 20% advance).`
                                        : 'You may be eligible for cancellation/rescheduling benefits per policy.'
                                    : 'Without protection, advances are non-refundable on cancellation/rescheduling (see policies).'}
                            </Text>
                            <TouchableOpacity
                                style={styles.policyLinkBtn}
                                onPress={() => openPolicyModal('protection')}
                                activeOpacity={0.7}
                            >
                                <Ionicons
                                    name={agreements.protection ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={18}
                                    color={agreements.protection ? '#16A34A' : theme.textLight}
                                />
                                <Text style={[styles.policyLinkText, { color: colors.primary }]}>
                                    {POLICY_MODAL_LABELS.protection}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
                            </TouchableOpacity>

                            <Text style={[styles.policyLinksIntro, { color: theme.textLight }]}>
                                Policies — open and accept to continue:
                            </Text>
                            <TouchableOpacity
                                style={styles.policyLinkBtn}
                                onPress={() => openPolicyModal('terms_combined')}
                                activeOpacity={0.7}
                            >
                                <Ionicons
                                    name={agreements.terms_combined ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={18}
                                    color={agreements.terms_combined ? '#16A34A' : theme.textLight}
                                />
                                <Text style={[styles.policyLinkText, { color: colors.primary }]}>
                                    Terms, Advance Payment, Cancellation & Refund Policy
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
                            </TouchableOpacity>
                            {!allPoliciesAgreed ? (
                                <Text style={[styles.policyWarning, { color: theme.textLight }]}>
                                    All policies above must be opened and accepted before payment.
                                </Text>
                            ) : (
                                <Text style={[styles.policyOk, { color: '#16A34A' }]}>All policies accepted.</Text>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.placeOrderBtn, saving && styles.placeOrderBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={saving || !allPoliciesAgreed}
                        >
                            {saving ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.placeOrderBtnText}>
                                    {paymentMode === 'on_finalization'
                                        ? 'Place Order (Pay on Finalization)'
                                        : requiresFullPayment
                                            ? `Pay ₹${payNowTotal.toLocaleString()}in full & place order`
                                            : `Pay ₹${payNowTotal.toLocaleString()}& place order`}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                )}
                {RazorpayUI}

                <Modal visible={policyModal != null} animationType="slide" transparent={false} onRequestClose={() => setPolicyModal(null)}>
                    <SafeAreaView style={[styles.modalRoot, { backgroundColor: theme.background }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <TouchableOpacity onPress={() => setPolicyModal(null)} style={styles.modalCloseHit} hitSlop={12}>
                                <Ionicons name="close" size={26} color={theme.text} />
                            </TouchableOpacity>
                            <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                                {policyModal === 'terms_combined'
                                    ? 'Terms, Advance Payment, Cancellation & Refund Policy'
                                    : policyModal
                                        ? POLICY_MODAL_LABELS[policyModal]
                                        : ''}
                            </Text>
                            <View style={{ width: 40 }} />
                        </View>
                        <ScrollView
                            style={styles.modalScroll}
                            contentContainerStyle={styles.modalScrollContent}
                            showsVerticalScrollIndicator
                            onLayout={(e) => {
                                setModalScrollViewportHeight(e.nativeEvent.layout.height || 0);
                            }}
                            onContentSizeChange={(_, contentHeight) => {
                                if (policyModal !== 'terms_combined') return;
                                if (contentHeight <= modalScrollViewportHeight + 8) {
                                    setTermsScrolledToEnd(true);
                                }
                            }}
                            onScroll={(e) => {
                                if (policyModal !== 'terms_combined') return;
                                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                                const reachedEnd =
                                    contentOffset.y + layoutMeasurement.height >= contentSize.height - 16;
                                if (reachedEnd && !termsScrolledToEnd) setTermsScrolledToEnd(true);
                            }}
                            scrollEventThrottle={16}
                        >
                            <Text style={[styles.modalBody, { color: theme.text }]}>
                                {policyModal ? POLICY_CONTENT[policyModal] : ''}
                            </Text>
                        </ScrollView>
                        <View style={[styles.modalFooter, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
                            <TouchableOpacity
                                style={[
                                    styles.modalAgreeBtn,
                                    { backgroundColor: colors.primary },
                                    policyModal === 'terms_combined' && !termsScrolledToEnd && styles.modalAgreeBtnDisabled,
                                ]}
                                onPress={approvePolicyModal}
                                disabled={policyModal === 'terms_combined' && !termsScrolledToEnd}
                            >
                                <Text style={styles.modalAgreeBtnText}>I have read and agree</Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </Modal>

                <BottomTabBar navigation={navigation} activeRoute="Cart" cartItemCount={cartItemCount} />
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
    backBtn: { padding: 8 },
    headerTitle: { fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'left' },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16, paddingBottom: 24 },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    orderSummaryMeta: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        marginBottom: 14,
        gap: 10,
    },
    orderMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    orderMetaLabel: { fontSize: 12, fontWeight: '600', width: 72, textTransform: 'uppercase', letterSpacing: 0.3 },
    orderMetaValue: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    servicesSectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
    hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    itemName: { fontSize: 14, fontWeight: '600' },
    itemTier: { fontSize: 13, marginTop: 4, fontWeight: '600' },
    itemSubVar: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
    itemCategoryOccasion: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    itemPrice: { fontSize: 14, fontWeight: '700' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
    },
    totalLabel: { fontSize: 16, fontWeight: '700' },
    totalValue: { fontSize: 18, fontWeight: '800' },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 8,
    },
    detailLabel: { fontSize: 13, width: 70 },
    detailValue: { flex: 1, fontSize: 14, fontWeight: '600' },
    paymentInfo: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    paymentInfoTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    paymentFullPayBanner: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    paymentOption: {
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 14,
        borderRadius: 12,
        borderWidth: 2,
        marginBottom: 10,
    },
    paymentOptionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    paymentDetailsBlock: {
        paddingLeft: 32,
        marginTop: 10,
    },
    readMoreText: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 8,
    },
    paymentOptionDisabledNote: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 10,
    },
    paymentDisabledNoteText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 19,
    },
    paymentOptionRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paymentOptionRadioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    paymentOptionLabel: { fontSize: 15, fontWeight: '600' },
    paymentOptionHeadline: { fontSize: 15, fontWeight: '700', marginBottom: 8, lineHeight: 21 },
    paymentBullet: { fontSize: 13, lineHeight: 20, marginTop: 4 },
    paymentOptionFooter: { fontSize: 12, lineHeight: 18, marginTop: 10, fontWeight: '600' },
    paymentOptionDesc: { fontSize: 12, marginTop: 2 },
    paymentInfoText: { fontSize: 14, lineHeight: 20 },
    placeOrderBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
        elevation: 5,
    },
    placeOrderBtnDisabled: { opacity: 0.7 },
    placeOrderBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    policyCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    policyCardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
    protectionHeadline: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 6 },
    protectionSub: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
    protectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    protectionLabel: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
    protectionHint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
    policyLinksIntro: { fontSize: 12, marginBottom: 8, marginTop: 4 },
    policyLinkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 8,
    },
    policyLinkText: { flex: 1, fontSize: 14, fontWeight: '600' },
    policyWarning: { fontSize: 12, marginTop: 10 },
    policyOk: { fontSize: 13, fontWeight: '600', marginTop: 10 },
    modalRoot: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    modalCloseHit: { padding: 8 },
    modalTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
    modalScroll: { flex: 1 },
    modalScrollContent: { padding: 16, paddingBottom: 32 },
    modalBody: { fontSize: 14, lineHeight: 22 },
    modalFooter: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    modalAgreeBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    modalAgreeBtnDisabled: {
        opacity: 0.45,
    },
    modalAgreeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
const ADDON_CARD_W = 148;

const addOnStyles = StyleSheet.create({
    section: {
        borderRadius: 16,
        borderWidth: 1,
        paddingTop: 16,
        paddingBottom: 6,
        marginBottom: 16,
        overflow: 'hidden',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 4,
    },
    headerAccent: {
        width: 4,
        height: 18,
        borderRadius: 2,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
        flex: 1,
    },
    headerBadge: {
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    headerSub: {
        fontSize: 12,
        paddingHorizontal: 16,
        marginBottom: 12,
        lineHeight: 17,
    },
    loadingRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 10,
        paddingBottom: 12,
    },
    skeletonCard: {
        width: ADDON_CARD_W,
        borderRadius: 12,
        borderWidth: 1,
        padding: 10,
        gap: 8,
    },
    skeletonImg: {
        width: '100%',
        height: 90,
        borderRadius: 10,
    },
    skeletonLine: {
        height: 10,
        borderRadius: 5,
    },
    listContent: {
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 12,
        gap: 10,
    },
    card: {
        width: ADDON_CARD_W,
        borderRadius: 14,
        borderWidth: 1.5,
        padding: 10,
        position: 'relative',
    },
    discountBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 2,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
    },
    discountText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '800',
    },
    imgWrap: {
        width: '100%',
        height: 90,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 8,
    },
    img: {
        width: '100%',
        height: '100%',
    },
    imgPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    svcName: {
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 16,
        minHeight: 32,
        marginBottom: 6,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 8,
        flexWrap: 'wrap',
    },
    price: {
        fontSize: 13,
        fontWeight: '800',
    },
    originalPrice: {
        fontSize: 11,
        textDecorationLine: 'line-through',
    },
    addBtn: {
        borderWidth: 1.5,
        borderRadius: 8,
        paddingVertical: 6,
        alignItems: 'center',
    },
    addBtnText: {
        fontSize: 12,
        fontWeight: '800',
    },
});