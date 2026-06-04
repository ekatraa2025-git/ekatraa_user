import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { dbService, getVendorImageUrl } from '../../services/supabase';
import BottomTabBar from '../../components/BottomTabBar';

const STATUS_COLORS = {
    pending: { bg: '#FEF3C7', text: '#D97706' },
    confirmed: { bg: '#D1FAE5', text: '#059669' },
    completed: { bg: '#DBEAFE', text: '#2563EB' },
    cancelled: { bg: '#FEE2E2', text: '#DC2626' },
};

export default function MyBookings({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { user, isAuthenticated } = useAuth();
    
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (isAuthenticated && user) {
            fetchBookings();
        } else {
            setLoading(false);
        }
    }, [user, isAuthenticated]);

    const fetchBookings = async () => {
        if (!user?.id) return;
        
        setLoading(true);
        try {
            const { data, error } = await dbService.getAllUserBookings(user.id);
            
            if (data && !error) {
                setBookings(data);
            }
        } catch (error) {
            console.log('[BOOKINGS ERROR]', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchBookings();
        setRefreshing(false);
    }, [user]);

    const getStatusStyle = (status) => {
        return STATUS_COLORS[status] || STATUS_COLORS.pending;
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    const renderBooking = ({ item }) => {
        const statusStyle = getStatusStyle(item.status);
        
        return (
            <TouchableOpacity
                style={[styles.bookingCard, { backgroundColor: theme.card }]}
                onPress={() => navigation.navigate('BookingDetail', { booking: item })}
            >
                <View style={styles.bookingHeader}>
                    <View style={styles.vendorInfo}>
                        <Image 
                            source={{ uri: getVendorImageUrl(item.vendor?.logo_url, item.vendor?.business_name || 'Vendor') }} 
                            style={styles.vendorLogo} 
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.vendorName, { color: theme.text }]} numberOfLines={1}>
                                {item.vendor?.business_name || 'Vendor'}
                            </Text>
                            <Text style={[styles.vendorCategory, { color: theme.textLight }]} numberOfLines={1}>
                                {item.vendor?.category || item.service_type || 'Service'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                            {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
                        </Text>
                    </View>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.bookingDetails}>
                    <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={16} color={theme.textLight} />
                        <Text style={[styles.detailText, { color: theme.text }]}>
                            {formatDate(item.event_date || item.created_at)}
                        </Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Ionicons name="location-outline" size={16} color={theme.textLight} />
                        <Text style={[styles.detailText, { color: theme.text }]} numberOfLines={1}>
                            {item.event_location || item.city || 'Location TBD'}
                        </Text>
                    </View>
                    {item.total_amount && (
                        <View style={styles.detailRow}>
                            <Ionicons name="wallet-outline" size={16} color={theme.textLight} />
                            <Text style={[styles.detailText, { color: colors.primary, fontWeight: '600' }]}>
                                ₹{item.total_amount.toLocaleString('en-IN')}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.bookingFooter}>
                    <Text style={[styles.bookingId, { color: theme.textLight }]}>
                        #{item.id?.slice(0, 8).toUpperCase()}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </View>
            </TouchableOpacity>
        );
    };

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity 
                        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')} 
                        style={styles.backBtn}
                    >
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Bookings</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.authContainer}>
                    <Ionicons name="lock-closed-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.authTitle, { color: theme.text }]}>Login Required</Text>
                    <Text style={[styles.authSubtitle, { color: theme.textLight }]}>
                        Please login to view your bookings
                    </Text>
                    <TouchableOpacity 
                        style={[styles.loginBtn, { backgroundColor: colors.primary }]}
                        onPress={() => navigation.navigate('Login')}
                    >
                        <Text style={styles.loginBtnText}>Login Now</Text>
                    </TouchableOpacity>
                </View>
                <BottomTabBar navigation={navigation} activeRoute="Menu" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity 
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')} 
                    style={styles.backBtn}
                >
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>My Bookings</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: theme.textLight }]}>
                        Loading bookings...
                    </Text>
                </View>
            ) : bookings.length > 0 ? (
                <FlatList
                    data={bookings}
                    renderItem={renderBooking}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Ionicons name="calendar-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>
                        No Bookings Yet
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textLight }]}>
                        Start planning your event and book services to see them here.
                    </Text>
                    <TouchableOpacity 
                        style={[styles.exploreBtn, { backgroundColor: colors.primary }]}
                        onPress={() => navigation.navigate('Home')}
                    >
                        <Text style={styles.exploreBtnText}>Explore Services</Text>
                    </TouchableOpacity>
                </View>
            )}
            <BottomTabBar navigation={navigation} activeRoute="Menu" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    listContent: {
        padding: 16,
    },
    bookingCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    bookingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    vendorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    vendorLogo: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 12,
        backgroundColor: '#EEE',
    },
    vendorName: {
        fontSize: 16,
        fontWeight: '600',
    },
    vendorCategory: {
        fontSize: 13,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        marginVertical: 12,
    },
    bookingDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 14,
        flex: 1,
    },
    bookingFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    bookingId: {
        fontSize: 12,
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    exploreBtn: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    exploreBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    authContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    authTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    authSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    loginBtn: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    loginBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
