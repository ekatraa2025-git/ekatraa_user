import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api, useBackendApi } from '../../services/api';
import { authService } from '../../services/supabase';
import { sanitizeAiDisplayText } from '../../utils/sanitizeAiDisplayText';
import BottomTabBar from '../../components/BottomTabBar';

function formatInr(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
}

export default function SavedRecommendationDetail({ route, navigation }) {
    const { snapshotId } = route.params || {};
    const { theme, isDarkMode } = useTheme();
    const { isAuthenticated } = useAuth();
    const useApi = useBackendApi();
    const [loading, setLoading] = useState(true);
    const [snap, setSnap] = useState(null);

    const load = useCallback(async () => {
        if (!useApi || !isAuthenticated || !snapshotId) {
            setSnap(null);
            setLoading(false);
            return;
        }
        const { session } = await authService.getSession();
        const token = session?.access_token;
        if (!token) {
            setSnap(null);
            setLoading(false);
            return;
        }
        const { data, error } = await api.getBudgetRecommendationSnapshot(snapshotId, token);
        if (!error && data) setSnap(data);
        else setSnap(null);
        setLoading(false);
    }, [useApi, isAuthenticated, snapshotId]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    const payload = snap?.recommendation_payload;
    const narrative = snap?.ai_narrative;
    const categories = payload?.categories || [];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <View style={[styles.backCircle, { backgroundColor: isDarkMode ? '#2D3142' : '#F3F4F6' }]}>
                        <Ionicons name="arrow-back" size={20} color={theme.text} />
                    </View>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                    Budget detail
                </Text>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : !snap ? (
                <Text style={[styles.hint, { color: theme.textLight }]}>Could not load this plan.</Text>
            ) : (
                <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                    <LinearGradient
                        colors={isDarkMode ? ['#312e81', '#1e1b4b'] : ['#4338CA', '#EA580C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.hero}
                    >
                        <Text style={styles.heroKicker}>SAVED PLAN</Text>
                        <Text style={styles.heroBudget}>{formatInr(snap.budget_inr)}</Text>
                        <Text style={styles.heroSub}>
                            {snap.created_at
                                ? new Date(snap.created_at).toLocaleString('en-IN', {
                                      dateStyle: 'long',
                                      timeStyle: 'short',
                                  })
                                : ''}
                        </Text>
                    </LinearGradient>

                    {narrative && (narrative.intro || (narrative.tips || []).length) ? (
                        <View style={[styles.aiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.aiBadgeRow}>
                                <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.aiBadge}>
                                    <Text style={styles.aiBadgeText}>AI insight</Text>
                                </LinearGradient>
                            </View>
                            {narrative.intro ? (
                                <Text style={[styles.aiIntro, { color: theme.text }]}>
                                    {sanitizeAiDisplayText(narrative.intro)}
                                </Text>
                            ) : null}
                            {(narrative.tips || []).length > 0 ? (
                                <View style={styles.tipsWrap}>
                                    {(narrative.tips || []).map((tip, i) => (
                                        <View
                                            key={`t-${i}`}
                                            style={[styles.tipPill, { borderColor: colors.primary + '55', backgroundColor: isDarkMode ? '#0f172a88' : '#FFF8F0' }]}
                                        >
                                            <Text style={[styles.tipText, { color: theme.text }]}>
                                                {sanitizeAiDisplayText(tip)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                            {(narrative.planning_reminders || []).length > 0 ? (
                                <View style={[styles.remindBox, { backgroundColor: isDarkMode ? '#0f172a' : '#FFF8F0' }]}>
                                    {(narrative.planning_reminders || []).map((line, i) => (
                                        <Text key={`r-${i}`} style={[styles.remindLine, { color: theme.textLight }]}>
                                            → {sanitizeAiDisplayText(line)}
                                        </Text>
                                    ))}
                                </View>
                            ) : null}
                            {narrative.disclaimer ? (
                                <Text style={[styles.disclaimer, { color: theme.textLight }]}>
                                    {sanitizeAiDisplayText(narrative.disclaimer)}
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Category breakdown</Text>
                    {categories.map((c) => (
                        <View key={c.id || c.name} style={[styles.catCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                            <View style={styles.catHeader}>
                                <Text style={[styles.catName, { color: theme.text }]}>{c.name}</Text>
                                <Text style={[styles.catPct, { color: colors.primary }]}>
                                    {c.percentage != null ? `${Number(c.percentage).toFixed(1)}%` : ''}
                                </Text>
                            </View>
                            <Text style={[styles.alloc, { color: theme.textLight }]}>
                                Allocated {formatInr(c.allocated_budget)}
                            </Text>
                            {(c.services || []).map((s) => (
                                <Text key={s.id || s.name} style={[styles.svcLine, { color: theme.text }]}>
                                    • {s.name}
                                </Text>
                            ))}
                        </View>
                    ))}
                </ScrollView>
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
    backCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    hint: { padding: 24, textAlign: 'center' },
    scroll: { padding: 16 },
    hero: {
        borderRadius: 18,
        padding: 20,
        marginBottom: 16,
    },
    heroKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    heroBudget: { color: '#FFF', fontSize: 28, fontWeight: '900', marginTop: 8 },
    heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 8 },
    aiCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 20,
    },
    aiBadgeRow: { marginBottom: 10 },
    aiBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    aiBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
    aiIntro: { fontSize: 15, lineHeight: 24 },
    tipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    tipPill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, maxWidth: '100%' },
    tipText: { fontSize: 13, lineHeight: 18 },
    remindBox: { marginTop: 12, padding: 12, borderRadius: 12 },
    remindLine: { fontSize: 13, lineHeight: 20, marginBottom: 6 },
    disclaimer: { fontSize: 11, marginTop: 12, lineHeight: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    catCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    catName: { fontSize: 16, fontWeight: '800', flex: 1 },
    catPct: { fontSize: 14, fontWeight: '800' },
    alloc: { fontSize: 12, marginTop: 4 },
    svcLine: { fontSize: 13, marginTop: 6, lineHeight: 19 },
});
