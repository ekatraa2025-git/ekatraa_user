import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api, useBackendApi } from '../../services/api';
import { authService } from '../../services/supabase';
import BottomTabBar from '../../components/BottomTabBar';

function formatInr(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
}

export default function SavedRecommendations({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { isAuthenticated } = useAuth();
    const useApi = useBackendApi();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [items, setItems] = useState([]);
    const [occasionNames, setOccasionNames] = useState({});
    const [loadError, setLoadError] = useState(null);

    const load = useCallback(async () => {
        setLoadError(null);
        if (!useApi || !isAuthenticated) {
            setItems([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const { session } = await authService.getSession();
        const token = session?.access_token;
        if (!token) {
            setItems([]);
            setLoadError('No session token. Try signing out and back in.');
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const [occRes, snapRes] = await Promise.all([
            api.getOccasions(),
            api.getBudgetRecommendationSnapshots(token),
        ]);
        if (Array.isArray(occRes.data)) {
            const map = {};
            occRes.data.forEach((o) => {
                if (o?.id) map[o.id] = o.name || o.id;
            });
            setOccasionNames(map);
        }
        if (snapRes.error) {
            setItems([]);
            setLoadError(snapRes.error.message || 'Could not load saved plans.');
        } else if (Array.isArray(snapRes.data)) {
            setItems(snapRes.data);
        } else {
            setItems([]);
        }
        setLoading(false);
        setRefreshing(false);
    }, [useApi, isAuthenticated]);

    useFocusEffect(
        useCallback(() => {
            if (!useApi || !isAuthenticated) {
                setLoading(false);
                return;
            }
            setLoading(true);
            load();
        }, [useApi, isAuthenticated, load])
    );

    const onRefresh = () => {
        setRefreshing(true);
        load();
    };

    const occasionLabel = (id) => occasionNames[id] || id || 'Occasion';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <View style={[styles.backCircle, { backgroundColor: isDarkMode ? '#2D3142' : '#F3F4F6' }]}>
                        <Ionicons name="arrow-back" size={20} color={theme.text} />
                    </View>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Saved budget plans</Text>
            </View>

            {!useApi ? (
                <Text style={[styles.hint, { color: theme.textLight }]}>Connect the app API to load saved plans.</Text>
            ) : !isAuthenticated ? (
                <Text style={[styles.hint, { color: theme.textLight }]}>Sign in to see plans you saved.</Text>
            ) : loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : items.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <Text style={[styles.hint, { color: theme.textLight }]}>
                        {loadError ||
                            'No saved plans yet. Save from the recommendations screen after you generate a budget.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(it) => String(it.id)}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => navigation.navigate('SavedRecommendationDetail', { snapshotId: item.id })}
                        >
                            <LinearGradient
                                colors={isDarkMode ? ['#1e293b', '#0f172a'] : ['#FFFBF5', '#FFF5EB']}
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <View style={styles.cardTop}>
                                    <Ionicons name="sparkles" size={22} color={colors.primary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                                            {occasionLabel(item.occasion_id)}
                                        </Text>
                                        <Text style={[styles.cardMeta, { color: theme.textLight }]}>
                                            {item.created_at
                                                ? new Date(item.created_at).toLocaleString('en-IN', {
                                                      dateStyle: 'medium',
                                                      timeStyle: 'short',
                                                  })
                                                : ''}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                                </View>
                                <Text style={[styles.budgetLine, { color: colors.primary }]}>
                                    {formatInr(item.budget_inr)} planned
                                </Text>
                                {item.contact_name ? (
                                    <Text style={[styles.small, { color: theme.textLight }]}>{item.contact_name}</Text>
                                ) : null}
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                />
            )}

            <BottomTabBar navigation={navigation} activeRoute="Menu" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 8,
    },
    backBtn: {},
    backCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    hint: { textAlign: 'center', fontSize: 14, lineHeight: 21 },
    list: { padding: 16, paddingBottom: 100 },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardTitle: { fontSize: 17, fontWeight: '800' },
    cardMeta: { fontSize: 12, marginTop: 4 },
    budgetLine: { fontSize: 18, fontWeight: '800', marginTop: 12 },
    small: { fontSize: 12, marginTop: 4 },
});
