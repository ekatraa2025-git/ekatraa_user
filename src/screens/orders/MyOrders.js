import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BottomTabBar from '../../components/BottomTabBar';
import { formatFriendlyDate } from '../../utils/formatFriendlyDate';
import { getOccasionAndApplicant } from '../../utils/orderDisplay';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';

function applyDateFilter(orders, filterKey) {
    if (filterKey === 'all' || !Array.isArray(orders)) return orders || [];
    const days = { week: 7, month: 30, '90d': 90 }[filterKey];
    if (!days) return orders;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return orders.filter((o) => {
        const t = o.created_at ? new Date(o.created_at).getTime() : 0;
        return t >= cutoff;
    });
}

export default function MyOrders({ navigation }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const { isAuthenticated, user } = useAuth();
    const filters = useMemo(
        () => [
            { key: 'all', label: tr('orders_filter_all') },
            { key: 'week', label: tr('orders_filter_week') },
            { key: 'month', label: tr('orders_filter_month') },
            { key: '90d', label: tr('orders_filter_90d') },
        ],
        [tr]
    );
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filterKey, setFilterKey] = useState('all');

    const load = useCallback(async () => {
        if (!isAuthenticated || !user?.id) {
            setOrders([]);
            setLoading(false);
            return;
        }
        const { data, error } = await api.getOrders(user.id);
        if (!error && Array.isArray(data)) setOrders(data);
        else setOrders([]);
        setLoading(false);
    }, [isAuthenticated, user?.id]);

    const listLoading = loading && orders.length === 0;

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const filteredOrders = useMemo(() => applyDateFilter(orders, filterKey), [orders, filterKey]);

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('orders_title')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: theme.text }]}>{tr('orders_sign_in')}</Text>
                </View>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    const renderOrderItem = useCallback(({ item, index }) => {
        const { occasionLabel, applicantLabel } = getOccasionAndApplicant(item);
        return (
            <TouchableOpacity
                style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
                activeOpacity={0.85}
            >
                <View style={styles.orderTop}>
                    <View style={[styles.numBadge, { backgroundColor: colors.primary + '18' }]}>
                        <Text style={[styles.numText, { color: colors.primary }]}>#{index + 1}</Text>
                    </View>
                    <Text style={[styles.orderId, { color: theme.textLight }]} numberOfLines={1}>
                        {item.id?.slice(0, 8)}…
                    </Text>
                    <View style={[styles.orderStatusBadge, { backgroundColor: colors.primary + '14' }]}>
                        <Text style={[styles.orderStatus, { color: colors.primary }]}>{item.status}</Text>
                    </View>
                </View>
                <Text style={[styles.metaLineLabel, { color: theme.textLight }]}>Occasion</Text>
                {occasionLabel ? (
                    <Text style={[styles.occasionName, { color: theme.text }]} numberOfLines={2}>
                        {occasionLabel}
                    </Text>
                ) : (
                    <Text style={[styles.occasionFallback, { color: theme.textLight }]}>Not set</Text>
                )}
                <Text style={[styles.metaLineLabel, { color: theme.textLight, marginTop: 6 }]}>Who applied</Text>
                {applicantLabel ? (
                    <Text style={[styles.applicantLine, { color: theme.text }]} numberOfLines={1}>
                        {applicantLabel}
                    </Text>
                ) : (
                    <Text style={[styles.occasionFallback, { color: theme.textLight }]}>Not set</Text>
                )}
                <Text style={[styles.orderTotal, { color: theme.text, marginTop: 8 }]}>
                    ₹{Number(item.total_amount || 0).toLocaleString('en-IN')}
                </Text>
                <Text style={[styles.orderDate, { color: theme.textLight }]}>
                    Placed {item.created_at ? formatFriendlyDate(item.created_at) : '—'}
                </Text>
            </TouchableOpacity>
        );
    }, [navigation, theme]);

    const keyExtractor = useCallback((item) => item.id, []);

    if (listLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('orders_title')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={{ padding: 12 }}>
                    {[0, 1, 2, 3].map((idx) => (
                        <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.card }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                <SkeletonBlock theme={theme} width={50} height={18} radius={9} />
                                <SkeletonBlock theme={theme} width={90} height={14} />
                            </View>
                            <SkeletonBlock theme={theme} width="72%" height={14} />
                            <View style={{ height: 8 }} />
                            <SkeletonBlock theme={theme} width="58%" height={14} />
                            <View style={{ height: 10 }} />
                            <SkeletonBlock theme={theme} width="40%" height={12} />
                        </SkeletonCard>
                    ))}
                </View>
                <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('orders_title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {orders.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="receipt-outline" size={56} color={theme.textLight} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>{tr('orders_empty_title')}</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textLight }]}>
                        {tr('orders_empty_sub')}
                    </Text>
                </View>
            ) : (
                <View style={styles.listSection}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterRow}
                        style={styles.filterScroll}
                        keyboardShouldPersistTaps="handled"
                    >
                        {filters.map((f) => {
                            const on = filterKey === f.key;
                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    style={[
                                        styles.filterChip,
                                        {
                                            backgroundColor: on ? colors.primary + '22' : theme.card,
                                            borderColor: on ? colors.primary : theme.border,
                                        },
                                    ]}
                                    onPress={() => setFilterKey(f.key)}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: on ? colors.primary : theme.textLight },
                                        ]}
                                    >
                                        {f.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <Text style={[styles.filterHint, { color: theme.textLight }]}>
                        {filteredOrders.length}{' '}
                        {filteredOrders.length === 1 ? tr('orders_order') : tr('orders_orders')}
                        {filterKey !== 'all' ? ` ${tr('orders_in_range')}` : ''}
                    </Text>
                    <FlatList
                        style={styles.orderList}
                        data={filteredOrders}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={styles.listContent}
                        initialNumToRender={8}
                        maxToRenderPerBatch={10}
                        windowSize={7}
                        removeClippedSubviews
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                        }
                        renderItem={renderOrderItem}
                    />
                </View>
            )}
            <BottomTabBar navigation={navigation} activeRoute="MyOrders" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    listSection: { flex: 1, minHeight: 0 },
    orderList: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    headerTitle: { fontSize: 17, fontWeight: 'bold', flex: 1, textAlign: 'left' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    filterScroll: { maxHeight: 48, flexGrow: 0 },
    filterRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        marginRight: 8,
    },
    filterChipText: { fontSize: 13, fontWeight: '700' },
    filterHint: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
    listContent: { padding: 12, paddingBottom: 94 },
    orderCard: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
    },
    orderTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
    numBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    numText: { fontSize: 12, fontWeight: '800' },
    orderId: { fontSize: 11, fontFamily: 'monospace', flex: 1 },
    orderStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    orderStatus: { fontSize: 11, textTransform: 'capitalize', fontWeight: '700' },
    metaLineLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
    occasionName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    applicantLine: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    occasionFallback: { fontSize: 13, marginBottom: 2, fontStyle: 'italic' },
    orderTotal: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
    orderDate: { fontSize: 12 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
    emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center' },
    emptyText: { fontSize: 14 },
});
