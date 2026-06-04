import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useLocale } from '../context/LocaleContext';
import { useCart } from '../context/CartContext';
import { colors } from '../theme/colors';

const TAB_BAR_TOP_PADDING = 6;
const TAB_BAR_BOTTOM_MIN = 6;
const TAB_BAR_CONTENT_HEIGHT = 56;

const TABS = [
    { key: 'Home', icon: 'home', iconOutline: 'home-outline', labelKey: 'tab_home' },
    { key: 'MyOrders', icon: 'receipt', iconOutline: 'receipt-outline', labelKey: 'tab_orders' },
    { key: 'Cart', icon: 'cart', iconOutline: 'cart-outline', labelKey: 'tab_cart' },
    { key: 'About', icon: 'information-circle', iconOutline: 'information-circle-outline', labelKey: 'tab_about' },
    { key: 'Menu', icon: 'menu', iconOutline: 'menu-outline', labelKey: 'tab_more' },
];

export default function BottomTabBar({ navigation, activeRoute, cartItemCount: propCount }) {
    const { theme, isDarkMode } = useTheme();
    const { t } = useLocale();
    const { cartItemCount: contextCount } = useCart();
    const cartItemCount = propCount ?? contextCount ?? 0;
    const insets = useSafeAreaInsets();
    const tabBarBottomInset = Math.max(insets.bottom, TAB_BAR_BOTTOM_MIN);
    const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + tabBarBottomInset;

    const handlePress = (tab) => {
        // Menu acts as a toggle on every screen — tapping it while already on
        // Menu pops back to the previous screen (close), tapping from anywhere
        // else pushes Menu (open). This matches the user's mental model of a
        // drawer-style button.
        if (tab.key === 'Menu' && activeRoute === 'Menu') {
            if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('Home');
            }
            return;
        }
        if (tab.key === activeRoute) return;
        if (tab.key === 'Home') {
            navigation.navigate('Home');
        } else {
            navigation.navigate(tab.key);
        }
    };

    return (
        <>
            <View style={{ height: tabBarHeight }} pointerEvents="none" />
            <View
                style={[
                    styles.container,
                    {
                        backgroundColor: isDarkMode ? '#181B25' : '#FFFFFF',
                        borderTopColor: isDarkMode ? '#2D3142' : '#E5E7EB',
                        paddingBottom: tabBarBottomInset,
                        minHeight: tabBarHeight,
                        ...Platform.select({
                            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 8 },
                            android: { elevation: 8 },
                        }),
                    },
                ]}
            >
                {TABS.map((tab) => {
                    const isActive = tab.key === activeRoute || (tab.key === 'Home' && activeRoute === 'Home');
                    const iconName = isActive ? tab.icon : tab.iconOutline;
                    const iconColor = isActive ? colors.primary : (isDarkMode ? '#6B7280' : '#9CA3AF');
                    const showBadge = tab.key === 'Cart' && cartItemCount > 0;

                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tab}
                            onPress={() => handlePress(tab)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.iconWrap,
                                isActive && { backgroundColor: colors.primary + '12', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
                            ]}>
                                <Ionicons name={iconName} size={22} color={iconColor} />
                                {showBadge && (
                                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.badgeText}>{cartItemCount > 99 ? '99+' : cartItemCount}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={[
                                styles.label,
                                { color: iconColor },
                                isActive && { color: colors.primary, fontWeight: '700' },
                            ]}>
                                {t(tab.labelKey)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderTopWidth: 1,
        paddingTop: TAB_BAR_TOP_PADDING,
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1100,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    iconWrap: {
        position: 'relative',
        marginBottom: 2,
    },
    badge: {
        position: 'absolute',
        top: -5,
        right: -10,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '800',
    },
    label: {
        fontSize: 11,
        fontWeight: '500',
        marginTop: 1,
    },
});
