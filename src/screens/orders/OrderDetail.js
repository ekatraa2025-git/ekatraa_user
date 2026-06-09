import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Image,
    Linking,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BottomTabBar from '../../components/BottomTabBar';
import { formatFriendlyDate, formatFriendlyDateTime } from '../../utils/formatFriendlyDate';
import { getOrderEventContext, localizeEventRole, isVendorIdentityUnlocked, maskVendorDisplayName } from '../../utils/orderDisplay';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../../context/ToastContext';
import OrderLineItemRows from '../../components/OrderLineItemRows';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';
import OrderVendorSelector from '../../components/OrderVendorSelector';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OrderDetail({ route, navigation }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const { showToast, showConfirm } = useToast();
    const { isAuthenticated, user, session, loading: authLoading } = useAuth();
    const { orderId } = route.params || {};
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actioning, setActioning] = useState(null);
    const [acceptingInvoice, setAcceptingInvoice] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [loadError, setLoadError] = useState(null);

    const load = useCallback(async () => {
        if (!orderId) return;
        if (!session?.access_token) {
            setOrder(null);
            setLoadError('sign_in');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        const { data, error } = await api.getOrder(orderId, session.access_token);
        setLoading(false);
        if (error) {
            setOrder(null);
            setLoadError(error?.message || 'Could not load order.');
            return;
        }
        setOrder(data);
    }, [orderId, session?.access_token]);

    useFocusEffect(
        useCallback(() => {
            if (!orderId) return;
            if (authLoading) {
                setLoading(true);
                return;
            }
            load();
        }, [orderId, load, authLoading])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const handleAcceptVendorInvoice = async () => {
        if (!isAuthenticated || !session?.access_token) {
            showToast({ variant: 'info', title: tr('alert_login_title'), message: tr('alert_login_quotation_body') });
            navigation.navigate('Login');
            return;
        }
        setAcceptingInvoice(true);
        const { data, error } = await api.acceptVendorInvoice(orderId, session.access_token);
        setAcceptingInvoice(false);
        if (error) {
            showToast({ variant: 'error', title: tr('alert_error'), message: error?.message || 'Could not accept invoice.' });
            return;
        }
        await load();
        showToast({
            variant: 'success',
            title: 'Invoice accepted',
            message: data?.total_amount != null ? `Order total is now ₹${Number(data.total_amount).toLocaleString('en-IN')}.` : 'You can pay the balance from this screen.',
        });
    };

    const handleCancelOrder = async () => {
        if (!isAuthenticated || !session?.access_token) {
            showToast({ variant: 'info', title: tr('alert_login_title'), message: tr('order_error_sign_in_sub') });
            return;
        }
        showConfirm({
            title: tr('order_cancel_title'),
            message: tr('order_cancel_confirm'),
            confirmLabel: tr('order_cancel_action'),
            cancelLabel: tr('alert_cancel'),
            destructive: true,
            onConfirm: async () => {
                setCancelling(true);
                const { error } = await api.cancelOrder(orderId, session.access_token);
                setCancelling(false);
                if (error) {
                    showToast({ variant: 'error', title: tr('alert_error'), message: error?.message || tr('order_cancel_failed') });
                    return;
                }
                await load();
                showToast({ variant: 'success', title: tr('order_cancel_title'), message: tr('order_cancel_success') });
            },
        });
    };

    const handleAcceptReject = async (quotationId, action) => {
        if (!isAuthenticated || !user?.id) {
            showToast({ variant: 'info', title: tr('alert_login_title'), message: tr('alert_login_quotation_body') });
            navigation.navigate('Login');
            return;
        }
        setActioning(quotationId);
        const { data, error } = await api.acceptQuotation(orderId, quotationId, action, session?.access_token);
        setActioning(null);
        if (error) {
            showToast({ variant: 'error', title: tr('alert_error'), message: error?.message || tr('alert_quote_update_failed') });
            return;
        }
        await load();
        if (action === 'accept') {
            const adv = data?.order?.requires_advance_payment && data?.order?.suggested_advance_inr;
            const advAmt = Math.round(Number(data.order.suggested_advance_inr)).toLocaleString('en-IN');
            showToast({
                variant: 'success',
                title: tr('alert_quote_accepted_title'),
                message: adv
                    ? tr('alert_quote_accepted_body_advance').replace('{amount}', advAmt)
                    : tr('alert_quote_accepted_body_simple'),
            });
        }
    };

    const openImage = (url) => {
        if (url && (url.startsWith('http') || url.startsWith('https'))) {
            Linking.openURL(url);
        }
    };

    if (!orderId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.emptyText, { color: theme.text }]}>{tr('order_no_specified')}</Text>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    if (loading || authLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('order_details_title')}</Text>
                </View>
                <View style={{ padding: 16 }}>
                    <SkeletonCard theme={theme} style={{ backgroundColor: theme.card }}>
                        <SkeletonBlock theme={theme} width="35%" height={18} />
                        <View style={{ height: 10 }} />
                        <SkeletonBlock theme={theme} width="90%" height={14} />
                        <View style={{ height: 8 }} />
                        <SkeletonBlock theme={theme} width="75%" height={14} />
                    </SkeletonCard>
                    <SkeletonCard theme={theme} style={{ backgroundColor: theme.card }}>
                        <SkeletonBlock theme={theme} width="30%" height={16} />
                        <View style={{ height: 10 }} />
                        <SkeletonBlock theme={theme} width="100%" height={12} />
                        <View style={{ height: 6 }} />
                        <SkeletonBlock theme={theme} width="95%" height={12} />
                    </SkeletonCard>
                </View>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    if (loadError) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('order_details_title')}</Text>
                </View>
                <View style={[styles.errorWrap, { padding: 20 }]}>
                    <Ionicons
                        name={loadError === 'sign_in' ? 'lock-closed-outline' : 'cloud-offline-outline'}
                        size={48}
                        color={theme.textLight}
                        style={{ marginBottom: 12 }}
                    />
                    <Text style={[styles.errorTitle, { color: theme.text }]}>
                        {loadError === 'sign_in' ? tr('order_error_sign_in_title') : tr('order_error_load_title')}
                    </Text>
                    <Text style={[styles.errorSub, { color: theme.textLight }]}>
                        {loadError === 'sign_in' ? tr('order_error_sign_in_sub') : loadError}
                    </Text>
                    {loadError === 'sign_in' ? (
                        <TouchableOpacity
                            style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
                            onPress={() => navigation.navigate('Login')}
                        >
                            <Text style={styles.retryBtnText}>{tr('button_login')}</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
                            onPress={() => load()}
                        >
                            <Text style={styles.retryBtnText}>{tr('order_try_again')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    if (!order) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('order_details_title')}</Text>
                </View>
                <Text style={[styles.emptyText, { color: theme.text, padding: 20 }]}>{tr('order_no_data')}</Text>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    const items = order?.items || [];
    const history = order?.status_history || [];
    const quotes = order?.quotes || order?.vendor_quotes || [];
    const advancePaid = Number(order?.advance_amount || 0);
    const acceptedQuote = quotes.find((q) => (q.status || '').toLowerCase() === 'accepted');
    const vendorInv = order?.vendor_invoice;
    const agreedTotal =
        vendorInv?.status === 'accepted' && vendorInv.total_amount != null
            ? Number(vendorInv.total_amount)
            : acceptedQuote
              ? Number(acceptedQuote.amount || 0)
              : Number(order?.total_amount || 0);
    const balanceDue = Math.max(0, agreedTotal - advancePaid);
    const isCompleted = (order?.status || '').toLowerCase() === 'completed';
    const invoicePending = vendorInv && (vendorInv.status || '').toLowerCase() === 'submitted';
    const showPayBalance =
        balanceDue > 0 &&
        isCompleted &&
        !invoicePending &&
        (!!acceptedQuote || (vendorInv && (vendorInv.status || '').toLowerCase() === 'accepted'));
    // Keep the vendor picker open by default for orders still in the choose/coordinate
    // phase, and collapsed once work is already in flight so the section stays
    // accessible without dominating the screen.
    const orderStatusLower = (order?.status || '').toLowerCase();
    const vendorNamesUnlocked = isVendorIdentityUnlocked(order);
    const canCancelOrder = ['pending', 'allocated', 'confirmed'].includes(orderStatusLower);
    const vendorWorkActive = !!order?.work_started_at
        || ['in_progress', 'completed', 'cancelled', 'refunded'].includes(orderStatusLower);
    const vendorSelectorInitiallyOpen = !vendorWorkActive;
    const eventCtx = getOrderEventContext(order);
    const orderEInvites = Array.isArray(order?.e_invites) ? order.e_invites : [];
    const paidEInvites = orderEInvites.filter((inv) => String(inv.payment_status || '').toLowerCase() === 'paid');

    const openEInviteStudio = (inviteId) => {
        if (!inviteId) return;
        navigation.navigate('GuestManage', { activeTab: 'Invite', userEInviteId: inviteId });
    };

    const downloadEInvite = async (invite) => {
        const inviteId = invite?.id;
        const fallbackUrl = invite?.download_url || invite?.preview_url;
        if (!inviteId || String(invite.payment_status || '').toLowerCase() !== 'paid') {
            showToast({ variant: 'info', title: 'Payment required', message: 'Complete payment to download your e-invite.' });
            return;
        }
        if (!session?.access_token) {
            showToast({ variant: 'info', title: tr('alert_login_title'), message: tr('order_error_sign_in_sub') });
            return;
        }
        const { data, error } = await api.getEInviteDownloadUrl(inviteId, session.access_token);
        const url = data?.url || fallbackUrl;
        if (error && !url) {
            showToast({ variant: 'error', title: 'Download', message: error?.message || 'Could not get download link.' });
            return;
        }
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            Linking.openURL(url);
        } else {
            showToast({ variant: 'error', title: 'Download', message: 'Could not open download link.' });
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('order_details_title')}</Text>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
            >
                {/* Order summary card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.statusRow}>
                        <View style={[styles.statusPill, { backgroundColor: colors.primary + '20' }]}>
                            <Text style={[styles.statusBadge, { color: colors.primary }]}>
                                {order?.status || '—'}
                            </Text>
                        </View>
                        <Text style={[styles.total, { color: theme.text }]}>
                            ₹{Number(order?.total_amount || 0).toLocaleString()}
                        </Text>
                    </View>
                    {advancePaid > 0 && (
                        <Text style={[styles.meta, { color: theme.textLight }]}>
                            {tr('order_advance_paid')}: ₹{advancePaid.toLocaleString()}
                        </Text>
                    )}
                    {canCancelOrder ? (
                        <TouchableOpacity
                            style={[styles.cancelOrderBtn, { borderColor: '#DC2626' + '55', backgroundColor: '#DC2626' + '10' }]}
                            onPress={handleCancelOrder}
                            disabled={cancelling}
                            activeOpacity={0.85}
                        >
                            {cancelling ? (
                                <ActivityIndicator size="small" color="#DC2626" />
                            ) : (
                                <>
                                    <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                                    <Text style={styles.cancelOrderBtnText}>{tr('order_cancel_action')}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    ) : null}
                    {eventCtx.occasionName ? (
                        <>
                            <Text style={[styles.detailLabel, { color: theme.textLight }]}>{tr('order_label_occasion')}</Text>
                            <Text style={[styles.occasionLine, { color: theme.text }]}>{eventCtx.occasionName}</Text>
                        </>
                    ) : null}
                    {eventCtx.roleLabel ? (
                        <>
                            <Text style={[styles.detailLabel, { color: theme.textLight, marginTop: 10 }]}>
                                {tr('order_label_who_applied')}
                            </Text>
                            <Text style={[styles.applicantLine, { color: theme.text }]}>
                                {localizeEventRole(eventCtx.roleLabel, tr)}
                            </Text>
                        </>
                    ) : null}
                    {eventCtx.contactName ? (
                        <>
                            <Text style={[styles.detailLabel, { color: theme.textLight, marginTop: 10 }]}>{tr('order_label_contact_name')}</Text>
                            <Text style={[styles.meta, { color: theme.text }]}>{eventCtx.contactName}</Text>
                        </>
                    ) : null}
                    {eventCtx.contactMobile ? (
                        <>
                            <Text style={[styles.detailLabel, { color: theme.textLight, marginTop: 8 }]}>{tr('order_label_contact_phone')}</Text>
                            <Text style={[styles.meta, { color: theme.text }]}>{eventCtx.contactMobile}</Text>
                        </>
                    ) : null}
                    {eventCtx.contactEmail ? (
                        <>
                            <Text style={[styles.detailLabel, { color: theme.textLight, marginTop: 8 }]}>{tr('order_label_contact_email')}</Text>
                            <Text style={[styles.meta, { color: theme.text }]}>{eventCtx.contactEmail}</Text>
                        </>
                    ) : null}
                    {order?.event_date ? (
                        <Text style={[styles.meta, { color: theme.textLight, marginTop: 10 }]}>
                            {tr('order_label_event_date')}: {formatFriendlyDate(order.event_date)}
                        </Text>
                    ) : null}
                    {order?.created_at ? (
                        <Text style={[styles.meta, { color: theme.textLight }]}>
                            {tr('order_label_ordered_at')}: {formatFriendlyDateTime(order.created_at)}
                        </Text>
                    ) : null}
                    {order?.work_started_at ? (
                        <Text style={[styles.meta, { color: theme.textLight, marginTop: 6 }]}>
                            {tr('order_work_started')}: {formatFriendlyDateTime(order.work_started_at)}
                        </Text>
                    ) : null}
                    {order?.work_completed_at ? (
                        <Text style={[styles.meta, { color: theme.textLight }]}>
                            {tr('order_work_completed')}: {formatFriendlyDateTime(order.work_completed_at)}
                        </Text>
                    ) : null}
                    {order?.start_otp && (
                        <View style={[styles.completionOtpBox, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
                            <Text style={[styles.completionOtpLabel, { color: theme.textLight }]}>{tr('order_otp_start_label')}</Text>
                            <Text style={[styles.completionOtpValue, { color: colors.primary }]}>{order.start_otp}</Text>
                        </View>
                    )}
                    {order?.completion_otp && (
                        <View style={[styles.completionOtpBox, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
                            <Text style={[styles.completionOtpLabel, { color: theme.textLight }]}>{tr('order_otp_completion_label')}</Text>
                            <Text style={[styles.completionOtpValue, { color: colors.primary }]}>{order.completion_otp}</Text>
                        </View>
                    )}
                    {showPayBalance && (
                        <TouchableOpacity
                            style={[styles.payBalanceBtn, { backgroundColor: colors.primary }]}
                            onPress={() =>
                                navigation.navigate('BalancePayment', {
                                    orderId,
                                    order: { ...order, total_amount: agreedTotal },
                                    balanceAmount: balanceDue,
                                })
                            }
                        >
                            <Ionicons name="card-outline" size={20} color="#FFF" />
                            <Text style={styles.payBalanceBtnText}>
                                {tr('order_pay_balance')} ₹{balanceDue.toLocaleString()}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {vendorInv && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Final invoice (vendor)</Text>
                        {vendorInv.vendor_logo_url &&
                        (String(vendorInv.vendor_logo_url).startsWith('http') ||
                            String(vendorInv.vendor_logo_url).startsWith('https')) ? (
                            <Image
                                source={{ uri: vendorInv.vendor_logo_url }}
                                style={{ width: 120, height: 48, resizeMode: 'contain', marginBottom: 8 }}
                            />
                        ) : null}
                        <Text style={[styles.meta, { color: theme.text, fontWeight: '700' }]}>
                            {maskVendorDisplayName(
                                vendorInv.vendor_display_name,
                                vendorNamesUnlocked,
                                tr('order_vendor_masked')
                            )}
                        </Text>
                        {vendorInv.vendor_gstin ? (
                            <Text style={[styles.meta, { color: theme.textLight }]}>GSTIN: {vendorInv.vendor_gstin}</Text>
                        ) : null}
                        {vendorInv.invoice_number ? (
                            <Text style={[styles.meta, { color: theme.textLight }]}>Invoice #{vendorInv.invoice_number}</Text>
                        ) : null}
                        {Array.isArray(vendorInv.line_items) &&
                            vendorInv.line_items.map((line, idx) => (
                                <View key={idx} style={[styles.historyItem, { borderBottomColor: theme.border }]}>
                                    <Text style={{ color: theme.text, fontWeight: '600' }}>{line.description}</Text>
                                    <Text style={{ color: theme.textLight, fontSize: 12 }}>
                                        {line.quantity} × ₹{Number(line.unit_price || 0).toLocaleString('en-IN')} = ₹
                                        {Number(line.amount || 0).toLocaleString('en-IN')}
                                    </Text>
                                </View>
                            ))}
                        <Text style={[styles.meta, { color: theme.text, marginTop: 8 }]}>
                            Subtotal: ₹{Number(vendorInv.subtotal || 0).toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.meta, { color: theme.textLight }]}>
                            CGST ({Number(vendorInv.cgst_rate || 0)}%): ₹{Number(vendorInv.cgst_amount || 0).toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.meta, { color: theme.textLight }]}>
                            SGST ({Number(vendorInv.sgst_rate || 0)}%): ₹{Number(vendorInv.sgst_amount || 0).toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.total, { color: theme.text, marginTop: 6 }]}>
                            Total: ₹{Number(vendorInv.total_amount || 0).toLocaleString('en-IN')}
                        </Text>
                        {vendorInv.notes ? (
                            <Text style={[styles.historyNote, { color: theme.textLight, marginTop: 8 }]}>{vendorInv.notes}</Text>
                        ) : null}
                        {(vendorInv.status || '').toLowerCase() === 'submitted' && (
                            <TouchableOpacity
                                style={[styles.payBalanceBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                                onPress={handleAcceptVendorInvoice}
                                disabled={acceptingInvoice}
                            >
                                {acceptingInvoice ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.payBalanceBtnText}>Accept final invoice</Text>
                                )}
                            </TouchableOpacity>
                        )}
                        {(vendorInv.status || '').toLowerCase() === 'accepted' && (
                            <Text style={[styles.meta, { color: colors.primary, marginTop: 8, fontWeight: '600' }]}>
                                Accepted — total above applies to balance payment.
                            </Text>
                        )}
                    </View>
                )}

                {items.length > 0 && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('order_section_items')}</Text>
                        {items.map((item, i) => (
                            <OrderLineItemRows key={item.id || i} item={item} theme={theme} tr={tr} />
                        ))}
                    </View>
                )}

                {session?.access_token ? (
                    <OrderVendorSelector
                        orderId={orderId}
                        accessToken={session.access_token}
                        theme={theme}
                        initiallyOpen={vendorSelectorInitiallyOpen}
                        onAllocated={load}
                        navigation={navigation}
                        selectionRequest={route?.params?.vendorSelectionRequest || null}
                        onSelectionApplied={() => {
                            navigation.setParams({ vendorSelectionRequest: undefined });
                        }}
                    />
                ) : null}

                {paidEInvites.length > 0 && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Your E-Invite</Text>
                        <Text style={[styles.meta, { color: theme.textLight, marginBottom: 12 }]}>
                            Your digital invite is ready. Download the file or open E-Invite Studio to share on WhatsApp.
                        </Text>
                        {paidEInvites.map((inv) => {
                            const isVideo =
                                String(inv.output_mime || '').includes('video') || inv.media_kind === 'animated';
                            const previewUrl = inv.preview_url || inv.download_url;
                            return (
                                <View
                                    key={inv.id}
                                    style={[styles.eInviteCard, { borderColor: theme.border, backgroundColor: theme.background }]}
                                >
                                    <Text style={[styles.eInviteTitle, { color: theme.text }]}>
                                        {inv.event_name || inv.occasion || 'E-Invite'}
                                        {isVideo ? ' · Video' : ' · Image'}
                                    </Text>
                                    {previewUrl && !isVideo ? (
                                        <TouchableOpacity onPress={() => openImage(previewUrl)}>
                                            <Image source={{ uri: previewUrl }} style={styles.eInvitePreview} resizeMode="cover" />
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={[styles.eInviteVideoPlaceholder, { backgroundColor: colors.primary + '14' }]}>
                                            <Ionicons name="videocam-outline" size={36} color={colors.primary} />
                                            <Text style={[styles.meta, { color: theme.textLight, marginTop: 8 }]}>
                                                Animated invite video
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.eInviteActions}>
                                        <TouchableOpacity
                                            style={[styles.eInviteBtn, { backgroundColor: colors.primary }]}
                                            onPress={() => openEInviteStudio(inv.id)}
                                        >
                                            <Ionicons name="sparkles-outline" size={18} color="#FFF" />
                                            <Text style={styles.eInviteBtnText}>Open E-Invite Studio</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.eInviteBtnOutline, { borderColor: '#25D366' }]}
                                            onPress={() => downloadEInvite(inv)}
                                        >
                                            <Ionicons name="download-outline" size={18} color="#25D366" />
                                            <Text style={[styles.eInviteBtnOutlineText, { color: '#25D366' }]}>Download</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {history.length > 0 && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('order_status_history')}</Text>
                        {history.map((h, i) => (
                            <View
                                key={h.id || `${h.status}-${h.created_at || ''}-${i}`}
                                style={[styles.historyItem, { borderBottomColor: theme.border }]}
                            >
                                <Text style={[styles.historyStatus, { color: theme.text }]}>{h.status}</Text>
                                {h.note ? (
                                    <Text style={[styles.historyNote, { color: theme.textLight }]}>{h.note}</Text>
                                ) : null}
                                <Text style={[styles.historyDate, { color: theme.textLight }]}>
                                    {h.created_at ? formatFriendlyDateTime(h.created_at) : ''}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Vendor quotes with attachments and accept/reject */}
                <View
                    style={[
                        styles.quotesSectionShell,
                        {
                            borderColor: colors.primary + '44',
                            backgroundColor: theme.card,
                            shadowColor: colors.primary,
                        },
                    ]}
                >
                    <LinearGradient
                        colors={[colors.primary + '35', colors.primary + '12']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.quotesSectionBanner}
                    >
                        <View style={[styles.quotesBannerIcon, { backgroundColor: theme.background + 'CC' }]}>
                            <Ionicons name="pricetags" size={22} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.quotesBannerTitle, { color: theme.text }]}>{tr('order_quotes_banner_title')}</Text>
                            <Text style={[styles.quotesBannerSub, { color: theme.textLight }]}>
                                {tr('order_quotes_banner_sub')}
                            </Text>
                        </View>
                    </LinearGradient>
                    <View style={[styles.quotesSectionInner, { borderTopColor: theme.border }]}>
                    {quotes.length > 0 ? (
                        quotes.map((q, i) => {
                            const statusLower = (q.status || '').toLowerCase();
                            const canAct = statusLower === 'submitted' || statusLower === 'pending';
                            const quoteAmount = Number(q.amount || 0);
                            const balance = Math.max(0, quoteAmount - advancePaid);
                            const att = q.attachments && typeof q.attachments === 'object' ? q.attachments : {};
                            const attEntries = Object.entries(att);
                            return (
                                <View
                                    key={q.id || i}
                                    style={[
                                        styles.quoteCard,
                                        {
                                            borderColor: colors.primary + '28',
                                            backgroundColor: theme.background,
                                            borderWidth: 1.5,
                                        },
                                    ]}
                                >
                                    <View style={styles.quoteHeader}>
                                        <Text style={[styles.quoteVendor, { color: theme.text }]}>
                                            {maskVendorDisplayName(q.vendor_name, vendorNamesUnlocked, tr('order_vendor_masked'))}
                                        </Text>
                                        <Text style={[styles.quoteAmount, { color: colors.primary }]}>
                                            {quoteAmount > 0 ? `₹${quoteAmount.toLocaleString()}` : '—'}
                                        </Text>
                                    </View>
                                    <Text style={[styles.quoteStatus, { color: theme.textLight }]}>
                                        {q.status || 'Submitted'}
                                    </Text>
                                    {q.quotation_submitted_at || q.created_at ? (
                                        <Text style={[styles.quoteMeta, { color: theme.textLight }]}>
                                            {tr('order_quote_submitted')}:{' '}
                                            {formatFriendlyDateTime(q.quotation_submitted_at || q.created_at)}
                                        </Text>
                                    ) : null}
                                    {q.service_type ? (
                                        <Text style={[styles.quoteMeta, { color: theme.textLight }]}>
                                            {tr('order_quote_service')}: {q.service_type}
                                        </Text>
                                    ) : null}
                                    {q.venue_address ? (
                                        <Text style={[styles.quoteMeta, { color: theme.textLight }]} numberOfLines={3}>
                                            {tr('order_quote_venue')}: {q.venue_address}
                                        </Text>
                                    ) : null}
                                    {q.note ? (
                                        <Text style={[styles.quoteNote, { color: theme.textLight }]}>{q.note}</Text>
                                    ) : null}

                                    {/* Quotation attachments */}
                                    {attEntries.length > 0 && (
                                        <View style={styles.attachmentsSection}>
                                            <Text style={[styles.attachmentsLabel, { color: theme.textLight }]}>
                                                {tr('order_attachments')}
                                            </Text>
                                            <View style={styles.attachmentsRow}>
                                                {attEntries.flatMap(([category, urls]) =>
                                                    Array.isArray(urls)
                                                        ? urls
                                                              .filter(Boolean)
                                                              .map((url, j) => (
                                                                  <TouchableOpacity
                                                                      key={`${category}-${j}`}
                                                                      onPress={() => openImage(url)}
                                                                      style={styles.attachmentThumb}
                                                                  >
                                                                      <Image
                                                                          source={{ uri: url }}
                                                                          style={styles.attachmentImg}
                                                                          resizeMode="cover"
                                                                      />
                                                                      <Text
                                                                          style={[styles.attachmentCat, { color: theme.textLight }]}
                                                                          numberOfLines={1}
                                                                      >
                                                                          {category}
                                                                      </Text>
                                                                  </TouchableOpacity>
                                                              ))
                                                        : []
                                                )}
                                            </View>
                                        </View>
                                    )}

                                    {canAct && (
                                        <View style={styles.quoteActions}>
                                            <TouchableOpacity
                                                style={[styles.rejectBtn, { borderColor: theme.border }]}
                                                onPress={() =>
                                                    showConfirm({
                                                        title: tr('order_quote_reject_title'),
                                                        message: tr('order_quote_reject_body'),
                                                        cancelLabel: tr('button_cancel'),
                                                        confirmLabel: tr('order_quote_reject'),
                                                        destructive: true,
                                                        onConfirm: () => handleAcceptReject(q.id, 'reject'),
                                                    })
                                                }
                                                disabled={!!actioning}
                                            >
                                                <Ionicons name="close-circle-outline" size={18} color="#c0392b" />
                                                <Text style={styles.rejectBtnText}>{tr('order_quote_reject')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                                                onPress={() => handleAcceptReject(q.id, 'accept')}
                                                disabled={!!actioning}
                                            >
                                                {actioning === q.id ? (
                                                    <ActivityIndicator color="#FFF" size="small" />
                                                ) : (
                                                    <>
                                                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                                                        <Text style={styles.acceptBtnText}>{tr('order_quote_accept')}</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <View style={styles.quoteEmptyWrap}>
                            <Ionicons name="document-text-outline" size={40} color={theme.textLight} style={{ marginBottom: 8 }} />
                            <Text style={[styles.quoteEmptyTitle, { color: theme.text }]}>{tr('order_quotes_empty_title')}</Text>
                            <Text style={[styles.quoteEmpty, { color: theme.textLight }]}>{tr('order_quotes_empty_sub')}</Text>
                        </View>
                    )}
                    </View>
                </View>
                <View style={styles.bottomSpacer} />
            </ScrollView>
            <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
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
    headerTitle: { fontSize: 17, fontWeight: 'bold', flex: 1, textAlign: 'left' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24, flexGrow: 1 },
    bottomSpacer: { height: 80 },
    card: {
        padding: 14,
        borderRadius: 14,
        marginBottom: 12,
        borderWidth: 1,
    },
    detailLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    occasionLine: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
    applicantLine: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    quotesSectionShell: {
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 2,
        overflow: 'hidden',
        elevation: 6,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
    },
    quotesSectionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
    },
    quotesBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quotesBannerTitle: { fontSize: 18, fontWeight: '800' },
    quotesBannerSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
    quotesSectionInner: { padding: 14, borderTopWidth: 1 },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    statusPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusBadge: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
    total: { fontSize: 22, fontWeight: 'bold' },
    meta: { fontSize: 14, marginBottom: 2 },
    payBalanceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
    },
    payBalanceBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    orderItemCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderLeftWidth: 4,
    },
    itemCat: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    itemTitle: { fontSize: 15, fontWeight: '700' },
    itemTierLine: { fontSize: 13, fontWeight: '600', marginTop: 4 },
    itemSub: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
    itemName: { fontSize: 14, flex: 1 },
    itemPrice: { fontSize: 14, fontWeight: '700', minWidth: 72, textAlign: 'right' },
    historyItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    historyStatus: { fontSize: 14, fontWeight: '600' },
    historyNote: { fontSize: 13, marginTop: 2 },
    historyDate: { fontSize: 12, marginTop: 2 },
    quoteCard: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    quoteHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    quoteVendor: { fontSize: 15, fontWeight: '600', flex: 1 },
    quoteAmount: { fontSize: 16, fontWeight: '700' },
    quoteStatus: { fontSize: 13, textTransform: 'capitalize', marginBottom: 2 },
    quoteNote: { fontSize: 12, marginTop: 4 },
    quoteMeta: { fontSize: 12, marginTop: 4, lineHeight: 18 },
    attachmentsSection: { marginTop: 12 },
    attachmentsLabel: { fontSize: 12, marginBottom: 8, textTransform: 'capitalize' },
    attachmentsRow: { flexDirection: 'row', flexWrap: 'wrap' },
    attachmentThumb: {
        width: (SCREEN_WIDTH - 32 - 32) / 3 - 8,
        marginRight: 8,
        marginBottom: 8,
        borderRadius: 8,
        overflow: 'hidden',
    },
    attachmentImg: {
        width: (SCREEN_WIDTH - 32 - 32) / 3 - 8,
        height: 72,
    },
    attachmentCat: { fontSize: 10, marginTop: 2 },
    quoteActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    rejectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 2,
        gap: 6,
    },
    rejectBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
    acceptBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
    },
    acceptBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
    quoteEmptyWrap: { alignItems: 'center', paddingVertical: 12 },
    quoteEmptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
    quoteEmpty: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    errorTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    errorSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    retryBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    retryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    cancelOrderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    cancelOrderBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
    emptyText: { padding: 16 },
    completionOtpBox: {
        marginTop: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
    },
    completionOtpLabel: { fontSize: 12, marginBottom: 4 },
    completionOtpValue: { fontSize: 24, fontWeight: '800', letterSpacing: 4 },
    eInviteCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    eInviteTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
    eInvitePreview: { width: '100%', height: 200, borderRadius: 10, marginBottom: 12 },
    eInviteVideoPlaceholder: {
        width: '100%',
        height: 160,
        borderRadius: 10,
        marginBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eInviteActions: { flexDirection: 'row', gap: 10 },
    eInviteBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 10,
        gap: 6,
    },
    eInviteBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
    eInviteBtnOutline: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 10,
        borderWidth: 1.5,
        gap: 6,
    },
    eInviteBtnOutlineText: { fontWeight: '600', fontSize: 14 },
});
