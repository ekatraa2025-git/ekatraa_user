import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import BottomTabBar from '../../components/BottomTabBar';
import { computeProtectionAmountInr } from '../../utils/bookingProtection';
import {
    getLineItemParts,
    tierIndexFromOptions,
    TIER_ACCENT_COLORS,
} from '../../utils/lineItemDisplay';

export default function Cart({ route, navigation }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const insets = useSafeAreaInsets();
    const { isAuthenticated, user, session } = useAuth();
    const { cartId: globalCartId, cartOwnerAnonSession, refreshCartCount, clearCart } = useCart();
    const { showToast, showConfirm } = useToast();
    const cartId = route.params?.cartId || globalCartId;

    const [cart, setCart] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [qtyDraftById, setQtyDraftById] = useState({});
    const [guestSyncedIds, setGuestSyncedIds] = useState({});
    const [protectionSettings, setProtectionSettings] = useState(null);

    const loadCart = useCallback(async () => {
        if (!cartId) {
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await api.getCart(cartId, {
                cartOwnerSession: cartOwnerAnonSession,
                accessToken: session?.access_token || null,
            });
            if (error) {
                showToast({ variant: 'error', title: 'Error', message: error.message });
                setCart(null);
            } else {
                setCart(data);
            }
        } catch (e) {
            console.warn('[Cart] loadCart', e?.message || e);
            setCart(null);
        }
        setLoading(false);
    }, [cartId, cartOwnerAnonSession, session?.access_token, showToast]);

    useEffect(() => {
        loadCart();
    }, [loadCart]);

    useEffect(() => {
        (async () => {
            const { data } = await api.getBookingProtection();
            if (data) setProtectionSettings(data);
        })();
    }, []);

    const normalizedItems = useMemo(
        () =>
            (Array.isArray(cart?.items) ? cart.items : [])
                .map((item, idx) => {
                    if (!item || typeof item !== 'object') return null;
                    return {
                        ...item,
                        _safeId: item.id || `fallback-${idx}`,
                    };
                })
                .filter(Boolean),
        [cart?.items]
    );
    const MAX_QTY = 9999;
    const guestCount = useMemo(() => {
        const raw = cart?.guest_count ?? cart?.total_guests ?? cart?.planned_guests;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 1) return 0;
        return Math.min(Math.floor(n), MAX_QTY);
    }, [cart?.guest_count, cart?.planned_guests, cart?.total_guests]);

    const isSingleUnitItem = useCallback((item, parts) => {
        const unitText = [
            item?.price_unit,
            item?.unit,
            item?.options?.price_unit,
            parts?.qtyLabel,
            parts?.subVariety,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        if (!unitText) return false;
        if (/\b(per\s*(guest|person|head|pax))\b/.test(unitText)) return true;
        if (/\b(single\s*(unit|qty|piece|service))\b/.test(unitText)) return true;
        return /\b(1|one)\s*(unit|qty|piece|pc|service)\b/.test(unitText);
    }, []);

    useEffect(() => {
        if (!normalizedItems.length) return;
        setQtyDraftById((prev) => {
            const next = { ...prev };
            for (const i of normalizedItems) {
                if (next[i._safeId] === undefined) next[i._safeId] = String(Number(i.quantity) || 1);
            }
            return next;
        });
    }, [normalizedItems]);

    useEffect(() => {
        if (!guestCount || !normalizedItems.length) return;
        let cancelled = false;
        (async () => {
            let changed = false;
            const syncedNow = {};
            for (const item of normalizedItems) {
                if (!item?.id || !item?._safeId) continue;
                let parts;
                try {
                    parts = getLineItemParts(item);
                } catch {
                    parts = {};
                }
                if (!isSingleUnitItem(item, parts)) continue;
                const currentQty = Number(item.quantity) || 1;
                const targetQty = guestCount;
                if (targetQty < 1 || currentQty === targetQty || guestSyncedIds[item._safeId]) continue;
                // eslint-disable-next-line no-await-in-loop
                const { error } = await api.updateCartItem(item.id, { quantity: targetQty });
                if (!error) {
                    changed = true;
                    syncedNow[item._safeId] = true;
                }
            }
            if (cancelled) return;
            if (Object.keys(syncedNow).length) {
                setGuestSyncedIds((prev) => ({ ...prev, ...syncedNow }));
            }
            if (changed) {
                await loadCart();
                refreshCartCount();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [guestCount, normalizedItems, isSingleUnitItem, guestSyncedIds, loadCart, refreshCartCount]);

    const getDisplayQty = (item) => {
        if (!item || !item._safeId) return 1;
        const raw = qtyDraftById[item._safeId];
        if (raw === undefined) return Number(item.quantity) || 1;
        const n = parseInt(String(raw).replace(/\D/g, ''), 10);
        if (!Number.isFinite(n) || n < 1) return Number(item.quantity) || 1;
        return Math.min(n, MAX_QTY);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadCart();
        setRefreshing(false);
    }, [loadCart]);

    const handleUpdateQty = async (itemId, quantity) => {
        if (!itemId) return;
        if (quantity < 1) return;
        if (quantity > MAX_QTY) quantity = MAX_QTY;
        setQtyDraftById((prev) => ({ ...prev, [itemId]: String(quantity) }));
        const { error } = await api.updateCartItem(itemId, { quantity });
        if (error) showToast({ variant: 'error', title: 'Error', message: error.message });
        else {
            await loadCart();
            refreshCartCount();
        }
    };

    const handleRemove = async (itemId) => {
        if (!itemId) return;
        const { error } = await api.removeCartItem(itemId);
        if (error) showToast({ variant: 'error', title: 'Error', message: error.message });
        else { await loadCart(); refreshCartCount(); }
    };

    const handleCheckout = () => {
        if (!cart?.items?.length) {
            showToast({ variant: 'info', title: 'Cart is empty', message: 'Add services first.' });
            return;
        }
        navigation.navigate('Checkout', {
            cartId: cart.id,
            userId: isAuthenticated && user?.id ? user.id : null,
            cart,
        });
    };

    const handleClearCart = () => {
        const items = normalizedItems.filter((row) => !!row.id);
        if (!items.length) return;
        showConfirm({
            title: 'Clear cart?',
            message: 'Remove every item from your cart.',
            cancelLabel: 'Cancel',
            confirmLabel: 'Clear all',
            destructive: true,
            onConfirm: async () => {
                try {
                    await Promise.all(
                        items.map(async (row) => {
                            const { error } = await api.removeCartItem(row.id);
                            if (error) throw new Error(error.message);
                        })
                    );
                    await clearCart();
                    setCart(null);
                    setQtyDraftById({});
                    await refreshCartCount();
                } catch (e) {
                    showToast({ variant: 'error', title: 'Cart', message: e?.message || 'Could not clear cart.' });
                }
            },
        });
    };

    // BottomTabBar now reserves its own layout space; only account for safe inset here.
    const footerBottom = Math.max(insets.bottom, 10);
    const listBottomPad = footerBottom + 168;

    if (!cartId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('cart_title')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Ionicons name="cart-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>{tr('cart_empty_title')}</Text>
                    <Text style={[styles.emptyText, { color: theme.textLight }]}>{tr('cart_empty_hint')}</Text>
                    <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Home')}>
                        <Text style={styles.shopBtnText}>{tr('cart_browse')}</Text>
                    </TouchableOpacity>
                </View>
                <BottomTabBar navigation={navigation} activeRoute="Cart" />
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    const items = normalizedItems;
    const servicesSubtotal = items.reduce((sum, i) => sum + getDisplayQty(i) * Number(i.unit_price || 0), 0);
    const protectionAmount = computeProtectionAmountInr(servicesSubtotal, protectionSettings, true);
    const cartOrderTotal = servicesSubtotal + protectionAmount;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('cart_title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="cart-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>{tr('cart_empty_title')}</Text>
                    <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Home')}>
                        <Text style={styles.shopBtnText}>{tr('cart_browse_lower')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.mainCol}>
                    <View style={[styles.summaryHeader, { borderBottomColor: theme.border }]}>
                        <View>
                            <Text style={[styles.summaryTitle, { color: theme.text }]}>{tr('cart_order_summary')}</Text>
                            {cart?.event_name ? (
                                <Text style={[styles.occasionHint, { color: theme.textLight }]} numberOfLines={1}>
                                    {cart.event_name}
                                </Text>
                            ) : null}
                        </View>
                        <View style={styles.summaryRight}>
                            <Text style={[styles.summaryCount, { color: theme.textLight }]}>
                                {items.length} {items.length === 1 ? tr('cart_item') : tr('cart_items')}
                            </Text>
                            <TouchableOpacity onPress={handleClearCart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={styles.clearLink}>{tr('cart_clear')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.listWrap}>
                    <FlatList
                        data={items}
                        keyExtractor={(item, index) => item?._safeId || `row-${index}`}
                        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                        }
                        renderItem={({ item }) => {
                            let parts;
                            try {
                                parts = getLineItemParts(item);
                            } catch {
                                parts = {
                                    categoryName: '',
                                    serviceName: item?.name || 'Service',
                                    tierName: '',
                                    qtyLabel: '',
                                    subVariety: '',
                                };
                            }
                            const price = Number(item.unit_price || 0);
                            const qty = getDisplayQty(item);
                            const occ = cart?.event_name;
                            const metaParts = [parts.categoryName, occ].filter(Boolean);
                            const accentIdx = tierIndexFromOptions(item.options);
                            const accent =
                                accentIdx >= 0
                                    ? TIER_ACCENT_COLORS[accentIdx % TIER_ACCENT_COLORS.length]
                                    : colors.primary;
                            const tierLine = [parts.tierName, parts.qtyLabel].filter(Boolean).join(' · ');
                            const isSingleUnit = isSingleUnitItem(item, parts);
                            return (
                                <View
                                    style={[
                                        styles.itemCard,
                                        {
                                            backgroundColor: theme.card,
                                            borderColor: theme.border,
                                            borderLeftWidth: 4,
                                            borderLeftColor: accent,
                                        },
                                        isSingleUnit && guestCount > 0
                                            ? styles.singleUnitCard
                                            : null,
                                    ]}
                                >
                                    {metaParts.length > 0 ? (
                                        <Text style={[styles.itemCategoryOccasion, { color: theme.textLight }]}>
                                            {metaParts.join(' · ')}
                                        </Text>
                                    ) : null}
                                    <Text style={[styles.itemName, { color: theme.text }]}>{parts.serviceName}</Text>
                                    {tierLine ? (
                                        <Text style={[styles.itemTier, { color: accent }]}>{tierLine}</Text>
                                    ) : null}
                                    {parts.subVariety ? (
                                        <Text style={[styles.itemSubVariety, { color: theme.textLight }]}>
                                            {parts.subVariety}
                                        </Text>
                                    ) : null}
                                    <Text style={[styles.itemPrice, { color: theme.textLight }]}>
                                        ₹{price.toLocaleString()} × {qty} = ₹{(price * qty).toLocaleString()}
                                    </Text>
                                    {isSingleUnit && guestCount > 0 ? (
                                        <Text style={[styles.singleUnitHint, { color: colors.primary }]}>
                                            Single-unit service: quantity synced to guest count ({guestCount}) for auto total.
                                        </Text>
                                    ) : null}
                                    <View style={styles.itemActions}>
                                        <View style={styles.qtyRow}>
                                            <TouchableOpacity
                                                style={[styles.qtyBtn, { borderColor: theme.border }]}
                                                onPress={() => handleUpdateQty(item.id, qty - 1)}
                                            >
                                                <Ionicons name="remove" size={18} color={theme.text} />
                                            </TouchableOpacity>
                                            <TextInput
                                                style={[styles.qtyInput, { color: theme.text, borderColor: theme.border }]}
                                                value={qtyDraftById[item._safeId] ?? String(qty)}
                                                onChangeText={(t) =>
                                                    setQtyDraftById((prev) => ({ ...prev, [item._safeId]: t }))
                                                }
                                                onBlur={() => {
                                                    const raw = qtyDraftById[item._safeId] ?? String(qty);
                                                    let n = parseInt(String(raw).replace(/\D/g, ''), 10);
                                                    if (!Number.isFinite(n) || n < 1) n = 1;
                                                    if (n > MAX_QTY) n = MAX_QTY;
                                                    setQtyDraftById((prev) => ({ ...prev, [item._safeId]: String(n) }));
                                                    if (n !== (Number(item.quantity) || 1) && item.id) handleUpdateQty(item.id, n);
                                                }}
                                                keyboardType="number-pad"
                                                maxLength={4}
                                                selectTextOnFocus
                                            />
                                            <TouchableOpacity
                                                style={[styles.qtyBtn, { borderColor: theme.border }]}
                                                onPress={() => handleUpdateQty(item.id, qty + 1)}
                                            >
                                                <Ionicons name="add" size={18} color={theme.text} />
                                            </TouchableOpacity>
                                        </View>
                                        <TouchableOpacity onPress={() => handleRemove(item.id)}>
                                            <Ionicons name="trash-outline" size={22} color="#E11D48" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        }}
                    />
                    </View>
                    <View
                        style={[
                            styles.footer,
                            {
                                borderTopColor: 'rgba(255,255,255,0.12)',
                                backgroundColor: '#1B2235',
                                bottom: footerBottom,
                            },
                        ]}
                    >
                        {protectionAmount > 0 ? (
                            <>
                                <View style={styles.cartTotalRow}>
                                    <Text style={[styles.cartTotalMuted, { color: 'rgba(255,255,255,0.78)' }]}>Services</Text>
                                    <Text style={[styles.cartTotalMuted, { color: '#FFFFFF' }]}>₹{servicesSubtotal.toLocaleString()}</Text>
                                </View>
                                <View style={styles.cartTotalRow}>
                                    <Text style={[styles.cartTotalMuted, { color: 'rgba(255,255,255,0.78)' }]}>Booking protection</Text>
                                    <Text style={[styles.cartTotalMuted, { color: '#FFFFFF' }]}>₹{protectionAmount.toLocaleString()}</Text>
                                </View>
                            </>
                        ) : null}
                        <View style={styles.cartTotalRow}>
                            <Text style={[styles.totalLabel, { color: '#FFFFFF' }]}>Order total</Text>
                            <Text style={[styles.totalValue, { color: '#FFFFFF' }]}>₹{cartOrderTotal.toLocaleString()}</Text>
                        </View>
                        <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
                            <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            <BottomTabBar navigation={navigation} activeRoute="Cart" cartItemCount={items.length} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    mainCol: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    headerTitle: { fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'left' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    summaryRight: { alignItems: 'flex-end', gap: 4 },
    summaryTitle: { fontSize: 16, fontWeight: '600' },
    occasionHint: { fontSize: 12, marginTop: 4, maxWidth: 200 },
    summaryCount: { fontSize: 14 },
    clearLink: { fontSize: 13, fontWeight: '700', color: colors.primary },
    listWrap: { flex: 1 },
    listContent: { padding: 16 },
    itemCategoryOccasion: { fontSize: 12, marginBottom: 4, lineHeight: 17 },
    itemCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    itemName: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    itemTier: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    itemSubVariety: { fontSize: 12, marginBottom: 6, fontStyle: 'italic' },
    itemPrice: { fontSize: 14, marginBottom: 12 },
    singleUnitCard: { borderWidth: 1.6, borderColor: colors.primary + '66' },
    singleUnitHint: { fontSize: 12, fontWeight: '600', marginBottom: 10 },
    itemActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qtyBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    qtyText: { fontSize: 16, fontWeight: '600', minWidth: 24, textAlign: 'center' },
    qtyInput: {
        minWidth: 44,
        height: 36,
        paddingHorizontal: 6,
        borderWidth: 1,
        borderRadius: 8,
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    footer: {
        position: 'absolute',
        left: 16,
        right: 16,
        padding: 14,
        borderWidth: 1,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 4,
    },
    cartTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    cartTotalMuted: { fontSize: 14 },
    totalLabel: { fontSize: 15, fontWeight: '700' },
    totalValue: { fontSize: 20, fontWeight: 'bold', marginVertical: 8 },
    checkoutBtn: {
        backgroundColor: '#0F172A',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    checkoutBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
    emptyText: { fontSize: 14, marginTop: 8 },
    shopBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.primary, borderRadius: 10 },
    shopBtnText: { color: '#FFF', fontWeight: '600' },
});
