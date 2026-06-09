import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { dbService, getVendorImageUrl } from '../../services/supabase';
import BottomTabBar from '../../components/BottomTabBar';
import VendorGallerySlider from '../../components/VendorGallerySlider';
import { SkeletonBlock, SkeletonCard } from '../../components/SkeletonLoader';

const { width } = Dimensions.get('window');

function parseGallery(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    }
    return [];
}

export default function VendorsList({ route, navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();
    const { service, city, state } = route.params || {};
    
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchVendors();
    }, [service, city, state]);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            console.log('[VENDORS] Fetching for:', service?.name, 'in', city);
            const { data, error } = await dbService.getVendorsByService({
                serviceCategory: service?.name || service?.category,
                city: city,
                state: state,
            });
            
            console.log('[VENDORS] Result:', data?.length, 'vendors', error ? 'Error: ' + error.message : '');
            
            if (data && !error) {
                setVendors(data);
            } else if (error) {
                console.log('[VENDORS ERROR]', error);
            }
        } catch (error) {
            console.log('[VENDORS ERROR]', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchVendors();
        setRefreshing(false);
    }, [service, city, state]);

    const renderVendor = ({ item }) => {
        const galleryPaths = parseGallery(item.gallery_urls);
        const sliderUris =
            galleryPaths.length > 0
                ? galleryPaths.map((uri) => getVendorImageUrl(uri, item.business_name))
                : [getVendorImageUrl(item.logo_url, item.business_name)];
        return (
        <TouchableOpacity
            style={[styles.vendorCard, { backgroundColor: theme.card }]}
            onPress={() => navigation.navigate('VendorDetail', { 
                vendor: { ...item, business_name: tr('order_vendor_masked') },
                city: city,
                contactLocked: true,
            })}
            activeOpacity={0.9}
        >
            {/* Vendor Image with Gradient Overlay */}
            <View style={styles.imageContainer}>
                <VendorGallerySlider
                    imageUris={sliderUris}
                    height={styles.vendorImage.height}
                    borderRadius={styles.vendorImage.borderRadius}
                    showDots={sliderUris.length > 1}
                    autoSlide={sliderUris.length > 1}
                />
                {item.is_verified && (
                    <View style={styles.verifiedBadgeTop}>
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                    </View>
                )}
                {item.rating && (
                    <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={12} color="#FFB800" />
                        <Text style={styles.ratingBadgeText}>{item.rating}</Text>
                    </View>
                )}
            </View>

            {/* Vendor Details */}
            <View style={styles.vendorInfo}>
                <Text style={[styles.vendorName, { color: theme.text }]} numberOfLines={1}>
                    {tr('order_vendor_masked')}
                </Text>
                
                <View style={styles.categoryRow}>
                    <View style={[styles.categoryBadge, { backgroundColor: isDarkMode ? colors.primary + '20' : colors.primary + '10' }]}>
                        <Text style={styles.categoryBadgeText}>{item.category || 'Service Provider'}</Text>
                    </View>
                </View>

                {item.address && (
                    <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={14} color={theme.textLight} />
                        <Text style={[styles.vendorAddress, { color: theme.textLight }]} numberOfLines={1}>
                            {item.city || item.address?.split(',').slice(-2).join(',')}
                        </Text>
                    </View>
                )}

                {item.description && (
                    <Text style={[styles.vendorDescription, { color: theme.textLight }]} numberOfLines={2}>
                        {item.description}
                    </Text>
                )}

                {/* Services Tags */}
                {item.services && item.services.length > 0 && (
                    <View style={styles.servicesRow}>
                        {item.services.slice(0, 2).map((svc, idx) => (
                            <View key={idx} style={[styles.serviceTag, { backgroundColor: theme.inputBackground }]}>
                                <Text style={[styles.serviceTagText, { color: theme.text }]} numberOfLines={1}>
                                    {svc.name}
                                </Text>
                            </View>
                        ))}
                        {item.services.length > 2 && (
                            <Text style={[styles.moreServices, { color: colors.primary }]}>
                                +{item.services.length - 2} more
                            </Text>
                        )}
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                    <TouchableOpacity 
                        style={[styles.callBtn, { borderColor: colors.primary }]}
                        onPress={() => item.phone && console.log('Call:', item.phone)}
                    >
                        <Ionicons name="call-outline" size={18} color={colors.primary} />
                        <Text style={[styles.callBtnText, { color: colors.primary }]}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.enquiryBtn]}
                        onPress={() => navigation.navigate('VendorDetail', { 
                            vendor: item,
                            city: city,
                            openEnquiry: true,
                        })}
                    >
                        <LinearGradient
                            colors={[colors.primary, '#FFA040']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.enquiryBtnGradient}
                        >
                            <Ionicons name="chatbubble-outline" size={16} color="#FFFFFF" />
                            <Text style={styles.enquiryBtnText}>Enquire Now</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
        );
    };

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
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>
                        {service?.name || 'Vendors'}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: theme.textLight }]}>
                        {city ? `in ${city}` : 'All Locations'}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    {[0, 1, 2].map((idx) => (
                        <SkeletonCard key={idx} theme={theme} style={{ width: width - 32, backgroundColor: theme.card }}>
                            <SkeletonBlock theme={theme} width="100%" height={170} radius={16} />
                            <View style={{ height: 10 }} />
                            <SkeletonBlock theme={theme} width="68%" height={16} />
                            <View style={{ height: 8 }} />
                            <SkeletonBlock theme={theme} width="45%" height={12} />
                        </SkeletonCard>
                    ))}
                </View>
            ) : vendors.length > 0 ? (
                <FlatList
                    data={vendors}
                    renderItem={renderVendor}
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
                    <Ionicons name="business-outline" size={64} color={theme.textLight} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>
                        No Vendors Found
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textLight }]}>
                        We couldn't find vendors for {service?.name} in {city}.
                        Try a different location or service.
                    </Text>
                </View>
            )}
            <BottomTabBar navigation={navigation} activeRoute="Home" />
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
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
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
    vendorCard: {
        borderRadius: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 5,
        overflow: 'hidden',
    },
    imageContainer: {
        width: '100%',
        height: 140,
        position: 'relative',
    },
    vendorImage: {
        width: '100%',
        height: '100%',
        backgroundColor: '#F0F0F0',
    },
    verifiedBadgeTop: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: '#10B981',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    ratingBadge: {
        position: 'absolute',
        bottom: 12,
        left: 12,
        backgroundColor: 'rgba(0,0,0,0.75)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    ratingBadgeText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    vendorInfo: {
        padding: 16,
    },
    vendorName: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    categoryRow: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    categoryBadge: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
    },
    categoryBadgeText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '600',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 8,
    },
    vendorAddress: {
        fontSize: 13,
        flex: 1,
    },
    vendorDescription: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 12,
    },
    servicesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
    },
    serviceTag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    serviceTagText: {
        fontSize: 11,
        fontWeight: '500',
    },
    moreServices: {
        fontSize: 12,
        fontWeight: '600',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    callBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 6,
    },
    callBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    enquiryBtn: {
        flex: 2,
        borderRadius: 12,
        overflow: 'hidden',
    },
    enquiryBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
    },
    enquiryBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
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
    },
});
