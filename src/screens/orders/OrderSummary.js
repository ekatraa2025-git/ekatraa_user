import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import BottomTabBar from '../../components/BottomTabBar';
import OrderLineItemRows from '../../components/OrderLineItemRows';
import OrderVendorSelector from '../../components/OrderVendorSelector';

export default function OrderSummary({ route, navigation }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const { session } = useAuth();
    const {
        orderId,
        order,
        cartItems = [],
        totalAmount = 0,
        servicesSubtotal,
        protectionAmount: protectionParam,
        grandTotal: grandParam,
        advanceAmount,
        balanceAmount,
        plannedBudget,
        paymentMode,
    } = route.params || {};

    const svcSub = servicesSubtotal != null ? Number(servicesSubtotal) : null;
    const prot = protectionParam != null ? Number(protectionParam) : 0;
    const displayGrand = grandParam != null ? Number(grandParam) : Number(totalAmount);

    const eInviteCartItem = (cartItems || []).find(
        (it) =>
            it?.options?.line_kind === 'e_invite' ||
            it?.options?.user_e_invite_id != null
    );
    const eInviteIdFromCart = eInviteCartItem?.options?.user_e_invite_id;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('order_summary_title')}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.successCard, { backgroundColor: theme.card }]}>
                    <View style={styles.successIconWrap}>
                        <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
                    </View>
                    <Text style={[styles.successTitle, { color: theme.text }]}>{tr('order_placed_success')}</Text>
                    {orderId && (
                        <Text style={[styles.orderId, { color: theme.textLight }]}>Order #{(orderId + '').slice(-8)}</Text>
                    )}
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('order_services_selected')}</Text>
                {(cartItems || []).map((item, index) => (
                    <View
                        key={item.id || index}
                        style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                    >
                        <OrderLineItemRows item={item} theme={theme} tr={tr} />
                    </View>
                ))}

                <View style={[styles.totalCard, { backgroundColor: theme.card }]}>
                    {svcSub != null && prot > 0 ? (
                        <>
                            <View style={styles.totalRow}>
                                <Text style={[styles.totalLabel, { color: theme.textLight }]}>{tr('order_services_subtotal')}</Text>
                                <Text style={[styles.totalValue, { color: theme.text }]}>₹{svcSub.toLocaleString()}</Text>
                            </View>
                            <View style={styles.totalRow}>
                                <Text style={[styles.totalLabel, { color: theme.textLight }]}>{tr('order_booking_protection')}</Text>
                                <Text style={[styles.totalValue, { color: theme.text }]}>₹{prot.toLocaleString()}</Text>
                            </View>
                        </>
                    ) : null}
                    <View style={styles.totalRow}>
                        <Text style={[styles.totalLabel, { color: theme.text }]}>{tr('order_total_amount')}</Text>
                        <Text style={[styles.totalValue, { color: theme.text }]}>₹{displayGrand.toLocaleString()}</Text>
                    </View>
                    {advanceAmount != null && advanceAmount > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: theme.textLight }]}>{tr('order_advance_paid_20')}</Text>
                            <Text style={[styles.totalValue, { color: '#16a34a' }]}>₹{Number(advanceAmount).toLocaleString()}</Text>
                        </View>
                    )}
                    {balanceAmount != null && balanceAmount > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: theme.textLight }]}>
                                {paymentMode === 'on_finalization' ? tr('order_pay_on_finalization') : tr('order_balance_payable')}
                            </Text>
                            <Text style={[styles.totalValue, { color: theme.text }]}>₹{Number(balanceAmount).toLocaleString()}</Text>
                        </View>
                    )}
                    {plannedBudget != null && plannedBudget > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: theme.textLight }]}>{tr('order_your_budget')}</Text>
                            <Text style={[styles.totalValue, { color: theme.text }]}>₹{Number(plannedBudget).toLocaleString()}</Text>
                        </View>
                    )}
                </View>

                <OrderVendorSelector
                    orderId={orderId}
                    accessToken={session?.access_token}
                    theme={theme}
                    navigation={navigation}
                    selectionRequest={route?.params?.vendorSelectionRequest || null}
                    onSelectionApplied={() => {
                        // Clear the route param so the same selection isn't reapplied
                        // on every focus.
                        navigation.setParams({ vendorSelectionRequest: undefined });
                    }}
                />
                {!session?.access_token ? (
                    <View style={[styles.signInNoteCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                        <Text style={[styles.signInNoteText, { color: theme.textLight }]}>
                            Sign in on this device to view your matched vendors and confirm allocations.
                        </Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => navigation.navigate('OrderDetail', { orderId })}
                >
                    <Text style={styles.primaryBtnText}>{tr('order_view_details')}</Text>
                </TouchableOpacity>
                {eInviteIdFromCart ? (
                    <TouchableOpacity
                        style={[styles.secondaryBtn, { borderColor: colors.primary, marginBottom: 12 }]}
                        onPress={() =>
                            navigation.navigate('GuestManage', {
                                activeTab: 'Invite',
                                userEInviteId: eInviteIdFromCart,
                            })
                        }
                    >
                        <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Open E-Invite Studio</Text>
                    </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.primary }]}
                    onPress={() => navigation.navigate('Home')}
                >
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>{tr('order_back_home')}</Text>
                </TouchableOpacity>
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
    scroll: { padding: 16, paddingBottom: 52 },
    successCard: {
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    successIconWrap: { marginBottom: 12 },
    successTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    orderId: { fontSize: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
    itemCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#00000010',
    },
    itemCat: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    itemName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    itemTier: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    itemSub: { fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemMeta: { fontSize: 14 },
    itemTotal: { fontSize: 15, fontWeight: '700' },
    totalCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#00000010',
    },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    totalLabel: { fontSize: 15 },
    totalValue: { fontSize: 18, fontWeight: '700' },
    signInNoteCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
    },
    signInNoteText: { fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 17 },
    primaryBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 5,
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    secondaryBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 2,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: '600' },
});
