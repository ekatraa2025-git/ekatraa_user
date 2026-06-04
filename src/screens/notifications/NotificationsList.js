import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useUserNotifications } from '../../context/UserNotificationContext';
import BottomTabBar from '../../components/BottomTabBar';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';

export default function NotificationsList({ navigation }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const { notifications, loading, markAsRead, markAllAsRead, unreadCount } = useUserNotifications();

    const renderItem = useCallback(({ item }) => (
        <TouchableOpacity
            style={[
                styles.row,
                { backgroundColor: theme.card, borderColor: theme.border },
                !item.read && { borderLeftWidth: 3, borderLeftColor: colors.primary },
            ]}
            onPress={() => {
                if (!item.read) markAsRead(item.id);
            }}
            activeOpacity={0.75}
        >
            <View style={styles.rowIcon}>
                <Ionicons
                    name="notifications"
                    size={22}
                    color={item.read ? theme.textLight : colors.primary}
                />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                    {item.title}
                </Text>
                <Text style={[styles.body, { color: theme.textLight }]} numberOfLines={4}>
                    {item.message}
                </Text>
                {item.created_at ? (
                    <Text style={[styles.time, { color: theme.textLight }]}>
                        {new Date(item.created_at).toLocaleString()}
                    </Text>
                ) : null}
            </View>
        </TouchableOpacity>
    ), [theme, markAsRead]);

    const keyExtractor = useCallback((item) => item.id, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('notifications_title')}</Text>
                {unreadCount > 0 ? (
                    <TouchableOpacity onPress={() => markAllAsRead()} style={styles.markAll}>
                        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                            {tr('notifications_mark_all')}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 72 }} />
                )}
            </View>

            {loading ? (
                <View style={styles.list}>
                    {[0, 1, 2, 3, 4].map((idx) => (
                        <SkeletonCard key={idx} theme={theme} style={{ backgroundColor: theme.card }}>
                            <View style={{ flexDirection: 'row' }}>
                                <SkeletonBlock theme={theme} width={28} height={28} radius={14} />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <SkeletonBlock theme={theme} width="60%" height={14} />
                                    <View style={{ height: 8 }} />
                                    <SkeletonBlock theme={theme} width="95%" height={12} />
                                    <View style={{ height: 6 }} />
                                    <SkeletonBlock theme={theme} width="75%" height={12} />
                                </View>
                            </View>
                        </SkeletonCard>
                    ))}
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    initialNumToRender={8}
                    maxToRenderPerBatch={10}
                    windowSize={7}
                    removeClippedSubviews
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="notifications-off-outline" size={48} color={theme.textLight} />
                            <Text style={[styles.emptyText, { color: theme.textLight }]}>
                                {tr('notifications_empty')}
                            </Text>
                        </View>
                    }
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
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 8, width: 44 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    markAll: { paddingHorizontal: 8, paddingVertical: 4 },
    list: { padding: 16, paddingBottom: 100 },
    row: {
        flexDirection: 'row',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
    },
    rowIcon: { marginRight: 12, paddingTop: 2 },
    title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    body: { fontSize: 14, lineHeight: 20 },
    time: { fontSize: 11, marginTop: 8 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
    emptyText: { marginTop: 12, fontSize: 15, textAlign: 'center' },
});
