import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase, dbService } from '../../services/supabase';
import BottomTabBar from '../../components/BottomTabBar';

const STATUS_COLORS = {
    pending: { bg: '#FEF3C7', text: '#D97706' },
    contacted: { bg: '#DBEAFE', text: '#2563EB' },
    quoted: { bg: '#E0E7FF', text: '#4F46E5' },
    confirmed: { bg: '#D1FAE5', text: '#059669' },
    completed: { bg: '#DCFCE7', text: '#16A34A' },
    cancelled: { bg: '#FEE2E2', text: '#DC2626' },
};

export default function MyEnquiries({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { user, isAuthenticated } = useAuth();
    
    const [enquiries, setEnquiries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (isAuthenticated && user) {
            fetchEnquiries();
        } else {
            setLoading(false);
        }
    }, [user, isAuthenticated]);

    const fetchEnquiries = async () => {
        if (!user?.id) return;
        
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('enquiries')
                .select(`
                    *,
                    vendors:vendor_id (id, business_name, logo_url, category, phone)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (data && !error) {
                setEnquiries(data);
            } else {
                console.log('[ENQUIRIES] Error:', error?.message);
            }
        } catch (error) {
            console.log('[ENQUIRIES ERROR]', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchEnquiries();
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

    const getVendorAvatar = (vendor) => {
        if (vendor?.logo_url) {
            return dbService.getPublicUrl('vendor-logos', vendor.logo_url);
        }
        const name = vendor?.business_name || 'V';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF4117&color=fff&size=100`;
    };

    const renderEnquiry = ({ item }) => {
        const statusStyle = getStatusStyle(item.status);
        
        return (
            <TouchableOpacity
                style={[styles.enquiryCard, { backgroundColor: theme.card }]}
                onPress={() => {
                    if (item.vendors) {
                        navigation.navigate('VendorDetail', { vendor: item.vendors });
                    }
                }}
            >
                <View style={styles.enquiryHeader}>
                    <View style={styles.vendorInfo}>
                        <Image 
                            source={{ uri: getVendorAvatar(item.vendors) }} 
                            style={styles.vendorLogo}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.vendorName, { color: theme.text }]} numberOfLines={1}>
                                {item.vendors?.business_name || 'Unknown Vendor'}
                            </Text>
                            <Text style={[styles.vendorCategory, { color: colors.primary }]}>
                                {item.vendors?.category || item.event_type || 'Service'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                            {item.status?.charAt(0).toUpperCase() + item.status?.slice(1) || 'Pending'}
                        </Text>
                    </View>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.enquiryDetails}>
                    <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={16} color={theme.textLight} />
                        <Text style={[styles.detailText, { color: theme.textLight }]}>
                            Event: {item.event_date ? formatDate(item.event_date) : 'Not specified'}
                        </Text>
                    </View>
                    
                    {item.guest_count && (
                        <View style={styles.detailRow}>
                            <Ionicons name="people-outline" size={16} color={theme.textLight} />
                            <Text style={[styles.detailText, { color: theme.textLight }]}>
                                {item.guest_count} Guests
                            </Text>
                        </View>
                    )}
                    
                    {item.budget && (
                        <View style={styles.detailRow}>
                            <Ionicons name="cash-outline" size={16} color={theme.textLight} />
                            <Text style={[styles.detailText, { color: theme.textLight }]}>
                                Budget: ₹{item.budget.toLocaleString('en-IN')}
                            </Text>
                        </View>
                    )}
                </View>

                {item.message && (
                    <View style={[styles.messageBox, { backgroundColor: isDarkMode ? '#1E1E1E' : '#F5F5F5' }]}>
                        <Text style={[styles.messageText, { color: theme.textLight }]} numberOfLines={2}>
                            "{item.message}"
                        </Text>
                    </View>
                )}

                <View style={styles.footerRow}>
                    <Text style={[styles.dateText, { color: theme.textLight }]}>
                        Sent on {formatDate(item.created_at)}
                    </Text>
                    {item.vendors?.phone && (
                        <TouchableOpacity 
                            style={[styles.callBtn, { backgroundColor: colors.primary + '20' }]}
                            onPress={() => {
                                // Open phone dialer
                            }}
                        >
                            <Ionicons name="call-outline" size={14} color={colors.primary} />
                            <Text style={[styles.callText, { color: colors.primary }]}>Call</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={80} color={theme.textLight} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Enquiries Yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textLight }]}>
                Browse vendors and send enquiries to get started!
            </Text>
            <TouchableOpacity
                style={[styles.browseBtn, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate('Home')}
            >
                <Text style={styles.browseBtnText}>Browse Vendors</Text>
            </TouchableOpacity>
        </View>
    );

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Enquiries</Text>
                    <View style={{ width: 40 }} />
                </View>
                
                <View style={styles.notLoggedIn}>
                    <Ionicons name="chatbubbles-outline" size={80} color={theme.textLight} />
                    <Text style={[styles.notLoggedInText, { color: theme.text }]}>
                        Please login to view your enquiries
                    </Text>
                    <TouchableOpacity
                        style={[styles.loginBtn, { backgroundColor: colors.primary }]}
                        onPress={() => navigation.navigate('Login')}
                    >
                        <Text style={styles.loginBtnText}>Login / Sign Up</Text>
                    </TouchableOpacity>
                </View>
                <BottomTabBar navigation={navigation} activeRoute="Menu" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>My Enquiries</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={enquiries}
                    renderItem={renderEnquiry}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmptyState}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                />
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
        padding: 16,
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
    listContent: {
        padding: 16,
    },
    enquiryCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    enquiryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    vendorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
    },
    vendorLogo: {
        width: 50,
        height: 50,
        borderRadius: 25,
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
    enquiryDetails: {
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    detailText: {
        fontSize: 14,
    },
    messageBox: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    messageText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        fontSize: 12,
    },
    callBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    callText: {
        fontSize: 12,
        fontWeight: '600',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 20,
    },
    emptySubtitle: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    browseBtn: {
        marginTop: 24,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
    },
    browseBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    notLoggedIn: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    notLoggedInText: {
        fontSize: 16,
        marginTop: 16,
        marginBottom: 24,
        textAlign: 'center',
    },
    loginBtn: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
    },
    loginBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
