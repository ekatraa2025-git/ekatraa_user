import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRazorpay } from '@codearcade/expo-razorpay';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';

const PAYMENT_OPTIONS = [
    { key: 'razorpay', label: 'Pay Now', desc: 'Pay balance via card, UPI, netbanking', icon: 'card' },
    { key: 'cod', label: 'Cash on Delivery', desc: 'Pay balance when order is delivered', icon: 'cash' },
];

export default function BalancePayment({ route, navigation }) {
    const { openCheckout, closeCheckout, RazorpayUI } = useRazorpay();
    const { theme } = useTheme();
    const { showToast, showConfirm } = useToast();
    const { isAuthenticated, user, session, refreshSession } = useAuth();
    const { orderId, order, balanceAmount } = route.params || {};

    const [paymentMode, setPaymentMode] = useState('razorpay');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        const uid = isAuthenticated && user?.id ? user.id : null;
        if (!uid) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please sign in to pay.' });
            navigation.navigate('Login');
            return;
        }
        if (!orderId) {
            showToast({ variant: 'error', title: 'Error', message: 'No order specified.' });
            return;
        }

        if (paymentMode === 'cod') {
            showConfirm({
                title: 'Pay on Delivery',
                message: `Balance of ₹${(balanceAmount || 0).toLocaleString()} will be collected when your order is delivered.`,
                cancelLabel: 'Cancel',
                confirmLabel: 'Confirm',
                onConfirm: () => {
                    navigation.replace('OrderDetail', { orderId });
                },
            });
            return;
        }

        const sessionForPay = await refreshSession();
        const accessToken = sessionForPay?.access_token;
        if (!accessToken) {
            showToast({ variant: 'info', title: 'Login required', message: 'Please sign in again to pay.' });
            navigation.navigate('Login');
            return;
        }
        setSaving(true);
        const { data: paymentData, error: paymentErr } = await api.createBalancePaymentOrder(
            {
                order_id: orderId,
                user_id: uid,
            },
            accessToken
        );
        setSaving(false);
        if (paymentErr || !paymentData?.razorpay_order_id) {
            const errMsg = paymentErr?.message || paymentData?.error || 'Could not create payment.';
            showToast({ variant: 'error', title: 'Payment setup failed', message: errMsg });
            return;
        }
        openCheckout(
            {
                key: paymentData.key,
                amount: paymentData.amount,
                currency: 'INR',
                order_id: paymentData.razorpay_order_id,
                name: 'Ekatraa',
                description: `Balance payment - ₹${(paymentData.balance_amount || balanceAmount || 0).toLocaleString()}`,
                prefill: {
                    name: order?.contact_name || '',
                    email: order?.contact_email || user?.email || '',
                    contact: order?.contact_mobile || user?.phone || '',
                },
                theme: { color: colors.primary },
            },
            {
                onSuccess: async (data) => {
                    closeCheckout();
                    setSaving(true);
                    const verifySess = await refreshSession();
                    const verifyToken = verifySess?.access_token;
                    if (!verifyToken) {
                        setSaving(false);
                        showToast({
                            variant: 'error',
                            title: 'Session expired',
                            message: 'Sign in again to verify your payment.',
                        });
                        navigation.navigate('Login');
                        return;
                    }
                    const { data: updated, error: verifyErr } = await api.verifyBalancePayment(
                        {
                            razorpay_payment_id: data.razorpay_payment_id,
                            razorpay_order_id: data.razorpay_order_id,
                            razorpay_signature: data.razorpay_signature,
                            order_id: orderId,
                        },
                        verifyToken
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
                    navigation.replace('OrderDetail', { orderId });
                },
                onFailure: (err) => {
                    showToast({
                        variant: 'error',
                        title: 'Payment failed',
                        message: err?.description || 'Payment could not be completed.',
                    });
                },
                onClose: () => {},
            }
        );
    };

    const bal = balanceAmount ?? 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Pay Balance</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Balance Due</Text>
                    <Text style={[styles.balanceAmount, { color: colors.primary }]}>
                        ₹{bal.toLocaleString()}
                    </Text>
                    <Text style={[styles.hint, { color: theme.textLight }]}>
                        Pay the remaining amount for your accepted quotation.
                    </Text>
                </View>

                <View style={[styles.paymentInfo, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.paymentInfoTitle, { color: theme.text }]}>Payment Method</Text>
                    {PAYMENT_OPTIONS.map((opt) => {
                        const isSelected = paymentMode === opt.key;
                        return (
                            <TouchableOpacity
                                key={opt.key}
                                style={[
                                    styles.paymentOption,
                                    {
                                        borderColor: isSelected ? colors.primary : theme.border,
                                        backgroundColor: isSelected ? colors.primary + '08' : 'transparent',
                                    },
                                ]}
                                onPress={() => setPaymentMode(opt.key)}
                                activeOpacity={0.8}
                            >
                                <View
                                    style={[
                                        styles.paymentOptionRadio,
                                        { borderColor: isSelected ? colors.primary : theme.border },
                                    ]}
                                >
                                    {isSelected && (
                                        <View style={[styles.paymentOptionRadioInner, { backgroundColor: colors.primary }]} />
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.paymentOptionLabel, { color: theme.text }]}>{opt.label}</Text>
                                    <Text style={[styles.paymentOptionDesc, { color: theme.textLight }]}>{opt.desc}</Text>
                                </View>
                                <Ionicons name={opt.icon} size={20} color={isSelected ? colors.primary : theme.textLight} />
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity
                    style={[styles.placeOrderBtn, saving && styles.placeOrderBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.placeOrderBtnText}>
                            {paymentMode === 'cod'
                                ? 'Confirm Pay on Delivery'
                                : `Pay ₹${bal.toLocaleString()} Now`}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
            {RazorpayUI}
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
    scroll: { padding: 16, paddingBottom: 56 },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
    balanceAmount: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20 },
    paymentInfo: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    paymentInfoTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    paymentOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        borderWidth: 2,
        marginBottom: 10,
        gap: 12,
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
    paymentOptionDesc: { fontSize: 12, marginTop: 2 },
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
});
