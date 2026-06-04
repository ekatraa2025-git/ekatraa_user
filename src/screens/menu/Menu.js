import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useBackendApi } from '../../services/api';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';

export default function Menu({ navigation }) {
    const { isDarkMode, toggleTheme, theme } = useTheme();
    const { t: tr } = useLocale();
    const { showConfirm } = useToast();
    const { user, isAuthenticated, signOut } = useAuth();
    const useApi = useBackendApi();

    // Get user display info
    const getUserName = () => {
        if (!user) return 'Guest';
        return user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    };

    const getUserPhone = () => {
        if (!user) return '';
        return user.phone || user.user_metadata?.phone || '';
    };

    const getUserEmail = () => {
        if (!user) return '';
        return user.email || '';
    };

    const getUserAvatar = () => {
        if (user?.user_metadata?.avatar_url) {
            return user.user_metadata.avatar_url;
        }
        const name = getUserName();
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF7A00&color=fff&size=120`;
    };

    const handleLogout = () => {
        showConfirm({
            title: tr('menu_logout'),
            message: tr('menu_logout_confirm'),
            cancelLabel: tr('button_cancel'),
            confirmLabel: tr('menu_logout'),
            destructive: true,
            onConfirm: async () => {
                await signOut();
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'Home' }],
                });
            },
        });
    };

    const containerStyle = { flex: 1, backgroundColor: theme.background };
    const textStyle = { color: theme.text };
    const subTextStyle = { color: theme.textLight };
    const borderStyle = { borderBottomColor: theme.border };

    return (
        <SafeAreaView style={containerStyle} edges={['top', 'left', 'right']}>
            <View style={[styles.header, borderStyle]}>
                <Text style={[styles.title, textStyle]}>{tr('menu_title')}</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')} style={styles.closeBtn}>
                        <Ionicons name="close" size={28} color={theme.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Section */}
                {isAuthenticated ? (
                    <View style={styles.profileSection}>
                        <Image
                            source={{ uri: getUserAvatar() }}
                            style={styles.profileImage}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileName, textStyle]}>{getUserName()}</Text>
                            {getUserPhone() ? (
                                <Text style={[styles.profilePhone, subTextStyle]}>
                                    {getUserPhone().startsWith('+') ? getUserPhone() : `+91 ${getUserPhone()}`}
                                </Text>
                            ) : null}
                            {getUserEmail() ? (
                                <Text style={[styles.profileEmail, subTextStyle]} numberOfLines={1}>
                                    {getUserEmail()}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.loginPrompt}
                        onPress={() => navigation.navigate('Login')}
                    >
                        <View style={[styles.guestAvatar, { backgroundColor: isDarkMode ? '#2D3142' : '#F3F4F6' }]}>
                            <Ionicons name="person-outline" size={32} color={theme.textLight} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileName, textStyle]}>{tr('menu_welcome_guest')}</Text>
                            <Text style={[styles.loginText, { color: colors.primary }]}>
                                {tr('menu_tap_login')}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <Text style={[styles.sectionLabel, { color: theme.textLight }]}>{tr('menu_items_label')}</Text>

                {useApi ? (
                    <TouchableOpacity
                        style={[styles.menuItem, borderStyle]}
                        onPress={() => {
                            if (!isAuthenticated) {
                                showConfirm({
                                    title: tr('menu_sign_in_title'),
                                    message: tr('menu_sign_in_msg'),
                                    cancelLabel: tr('button_cancel'),
                                    confirmLabel: tr('button_login'),
                                    onConfirm: () => navigation.navigate('Login'),
                                });
                                return;
                            }
                            navigation.navigate('SavedRecommendations');
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="albums-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.menuText, textStyle]}>{tr('menu_saved_plans')}</Text>
                                <Text style={[styles.menuSub, { color: theme.textLight }]}>
                                    {tr('menu_saved_plans_sub')}
                                </Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                    </TouchableOpacity>
                ) : null}

                {/* Settings */}
                <View style={[styles.menuItem, borderStyle]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="moon-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_dark_mode')}</Text>
                    </View>
                    <Switch
                        value={isDarkMode}
                        onValueChange={toggleTheme}
                        trackColor={{ false: "#767577", true: colors.primary }}
                        thumbColor={isDarkMode ? colors.secondary : "#f4f3f4"}
                    />
                </View>

                <TouchableOpacity style={[styles.menuItem, borderStyle]} onPress={() => navigation.navigate('MyProfile')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="person-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_profile')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, borderStyle]} onPress={() => navigation.navigate('MyOrders')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="receipt-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_orders')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, borderStyle]} onPress={() => navigation.navigate('GuestManage')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="people-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_guest')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, borderStyle]} onPress={() => navigation.navigate('HelpSupport')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="help-circle-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_help')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.menuItem, borderStyle]} onPress={() => navigation.navigate('About')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="information-circle-outline" size={22} color={theme.text} style={{ marginRight: 10 }} />
                        <Text style={[styles.menuText, textStyle]}>{tr('menu_about')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textLight} />
                </TouchableOpacity>
            </ScrollView>

            {/* Footer actions */}
            <View style={[styles.footer, { borderTopColor: theme.border }]}>
                {isAuthenticated ? (
                    <TouchableOpacity onPress={handleLogout} style={[styles.logoutBtn, { backgroundColor: isDarkMode ? '#2D1012' : '#FEF2F2' }]}>
                        <Ionicons name="log-out-outline" size={20} color={theme.error} style={{ marginRight: 8 }} />
                        <Text style={[styles.logoutText, { color: theme.error }]}>{tr('menu_logout')}</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={() => navigation.navigate('Login')} style={[styles.loginBtn, { backgroundColor: colors.primary }]}>
                        <Ionicons name="log-in-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.loginBtnText}>{tr('menu_login_signup')}</Text>
                    </TouchableOpacity>
                )}
                <Text style={styles.version}>v1.0.0</Text>
            </View>
            <BottomTabBar navigation={navigation} activeRoute="Menu" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIconBtn: {
        padding: 6,
        marginRight: 4,
        position: 'relative',
    },
    notifBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    notifBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '800',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    scrollContent: {
        padding: 20,
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    profileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
    },
    profileName: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    profilePhone: {
        fontSize: 14,
    },
    profileEmail: {
        fontSize: 12,
        marginTop: 2,
    },
    loginPrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    guestAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginText: {
        fontSize: 14,
        fontWeight: '600',
        marginTop: 4,
    },
    loginBtn: {
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    loginBtnText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFF',
    },
    divider: {
        height: 1,
        marginVertical: 20,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    menuSub: {
        fontSize: 12,
        marginTop: 2,
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    menuText: {
        fontSize: 16,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
    },
    logoutBtn: {
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    version: {
        textAlign: 'center',
        marginTop: 10,
        color: '#ccc',
        fontSize: 12,
    }
});
