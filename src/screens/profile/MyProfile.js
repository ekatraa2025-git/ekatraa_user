import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import LocationMapPickerModal from '../../components/LocationMapPickerModal';
import BottomTabBar from '../../components/BottomTabBar';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';

const MAX_LOCATION_PREFERENCES = 5;

function normalizeLocationPreferences(rawList = []) {
    if (!Array.isArray(rawList)) return [];
    const out = [];
    const seen = new Set();
    for (const row of rawList) {
        const value = String(row || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= MAX_LOCATION_PREFERENCES) break;
    }
    return out;
}

function appendLocationPreference(list, value) {
    const text = String(value || '').trim();
    if (!text) return normalizeLocationPreferences(list);
    const merged = [...normalizeLocationPreferences(list), text];
    return normalizeLocationPreferences(merged);
}

export default function MyProfile({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { showToast, showConfirm } = useToast();
    const { user, isAuthenticated, session, signOut } = useAuth();
    
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [profile, setProfile] = useState({
        full_name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        location_preferences: [],
    });
    const [mapPickerVisible, setMapPickerVisible] = useState(false);
    const [currentLocLoading, setCurrentLocLoading] = useState(false);

    useEffect(() => {
        if (isAuthenticated && user) {
            loadProfile();
        }
    }, [user, isAuthenticated]);

    const loadProfile = async () => {
        setLoading(true);
        try {
            // Get user metadata
            const userData = {
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                phone: user.phone || user.user_metadata?.phone || '',
                email: user.email || '',
                address: user.user_metadata?.address || '',
                city: user.user_metadata?.city || '',
                location_preferences: normalizeLocationPreferences(user.user_metadata?.location_preferences || []),
            };
            
            // Try to fetch from user_profiles table if it exists
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
            
            if (data && !error) {
                setProfile({
                    full_name: data.full_name || userData.full_name,
                    phone: data.phone || userData.phone,
                    email: userData.email,
                    address: data.address || userData.address,
                    city: data.city || userData.city,
                    location_preferences: normalizeLocationPreferences(
                        data.location_preferences || userData.location_preferences || []
                    ),
                });
            } else {
                setProfile(userData);
            }
        } catch (err) {
            console.log('[PROFILE] Error loading:', err);
            // Use user metadata as fallback
            setProfile({
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                phone: user.phone || user.user_metadata?.phone || '',
                email: user.email || '',
                address: '',
                city: '',
                location_preferences: normalizeLocationPreferences(user.user_metadata?.location_preferences || []),
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const trimmedName = profile.full_name.trim();
        if (!trimmedName) {
            showToast({ variant: 'error', title: 'Error', message: 'Please enter your name' });
            return;
        }
        if (trimmedName.length > 100) {
            showToast({ variant: 'error', title: 'Error', message: 'Name must be under 100 characters' });
            return;
        }
        if (profile.phone) {
            const digits = profile.phone.replace(/\D/g, '');
            if (digits.length < 10 || digits.length > 15) {
                showToast({ variant: 'error', title: 'Error', message: 'Please enter a valid phone number' });
                return;
            }
        }
        if (profile.city && profile.city.length > 100) {
            showToast({ variant: 'error', title: 'Error', message: 'City name must be under 100 characters' });
            return;
        }
        if (profile.address && profile.address.length > 300) {
            showToast({ variant: 'error', title: 'Error', message: 'Address must be under 300 characters' });
            return;
        }
        if ((profile.location_preferences || []).length > MAX_LOCATION_PREFERENCES) {
            showToast({ variant: 'error', title: 'Error', message: `You can save up to ${MAX_LOCATION_PREFERENCES} preferred locations.` });
            return;
        }

        setSaving(true);
        try {
            // Update user metadata
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    full_name: profile.full_name,
                    phone: profile.phone,
                    address: profile.address,
                    city: profile.city,
                    location_preferences: normalizeLocationPreferences(profile.location_preferences),
                }
            });

            if (updateError) throw updateError;

            // Also try to upsert in user_profiles table
            await supabase
                .from('user_profiles')
                .upsert({
                    id: user.id,
                    full_name: profile.full_name,
                    phone: profile.phone,
                    address: profile.address,
                    city: profile.city,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });

            showToast({ variant: 'success', title: 'Success', message: 'Profile updated successfully!' });
        } catch (err) {
            console.log('[PROFILE] Save error:', err);
            showToast({ variant: 'error', title: 'Error', message: 'Failed to update profile. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const handleUseCurrentLocation = async () => {
        setCurrentLocLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showToast({ variant: 'info', title: 'Permission needed', message: 'Allow location to add your current place.' });
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [rev] = await Location.reverseGeocodeAsync({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
            const line = [rev?.name, rev?.street, rev?.district, rev?.city, rev?.region, rev?.postalCode]
                .filter(Boolean)
                .join(', ');
            if (!line) {
                showToast({ variant: 'info', title: 'Location', message: 'Could not read address from current location.' });
                return;
            }
            setProfile((p) => ({
                ...p,
                location_preferences: appendLocationPreference(p.location_preferences, line),
            }));
        } catch (err) {
            showToast({ variant: 'error', title: 'Location', message: err?.message || 'Could not fetch current location.' });
        } finally {
            setCurrentLocLoading(false);
        }
    };

    const removeLocationPreference = (index) => {
        setProfile((p) => ({
            ...p,
            location_preferences: (p.location_preferences || []).filter((_, i) => i !== index),
        }));
    };

    const getUserAvatar = () => {
        if (user?.user_metadata?.avatar_url) {
            return user.user_metadata.avatar_url;
        }
        const name = profile.full_name || 'User';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF4117&color=fff&size=200`;
    };

    const handleLogout = () => {
        showConfirm({
            title: 'Logout',
            message: 'Are you sure you want to logout?',
            cancelLabel: 'Cancel',
            confirmLabel: 'Logout',
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

    /**
     * Two-step destructive flow: a confirmation prompt, then a second prompt
     * that names the consequences. Server handles the actual erasure; on
     * success we sign out locally and reset navigation back to Home so the
     * user is prompted to login/signup if they tap a protected screen.
     */
    const handleDeleteAccount = () => {
        if (deleting) return;
        showConfirm({
            title: 'Delete account',
            message:
                'This will permanently remove your Ekatraa profile, carts, saved budgets, e-invites, and personal data. Your past orders stay with vendors but are anonymized. This cannot be undone.',
            cancelLabel: 'Cancel',
            confirmLabel: 'Continue',
            destructive: true,
            onConfirm: () => {
                showConfirm({
                    title: 'Are you absolutely sure?',
                    message:
                        'Tap "Delete forever" to erase your account immediately. You will be signed out and asked to login or sign up again.',
                    cancelLabel: 'Keep my account',
                    confirmLabel: 'Delete forever',
                    destructive: true,
                    onConfirm: async () => {
                        setDeleting(true);
                        const { data, error } = await api.deleteOwnAccount(session?.access_token);
                        if (error) {
                            setDeleting(false);
                            showToast({
                                variant: 'error',
                                title: 'Could not delete account',
                                message:
                                    error.message ||
                                    'Please try again, or email privacy@ekatraa.com to complete the request.',
                                duration: 5000,
                            });
                            return;
                        }
                        showToast({
                            variant: 'success',
                            title: 'Account deleted',
                            message: data?.message || 'Your Ekatraa account has been erased.',
                            duration: 3500,
                        });
                        await signOut();
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    },
                });
            },
        });
    };

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
                
                <View style={styles.notLoggedIn}>
                    <Ionicons name="person-circle-outline" size={80} color={theme.textLight} />
                    <Text style={[styles.notLoggedInText, { color: theme.text }]}>
                        Please login to view your profile
                    </Text>
                    <TouchableOpacity
                        style={[styles.loginBtn, { backgroundColor: colors.primary }]}
                        onPress={() => navigation.navigate('Login')}
                    >
                        <Text style={styles.loginBtnText}>Login / Sign Up</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Profile</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>My Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <Image
                        source={{ uri: getUserAvatar() }}
                        style={styles.avatar}
                    />
                    <View style={[styles.verifiedBadge, { backgroundColor: user.email_confirmed_at ? '#22C55E' : theme.textLight }]}>
                        <Ionicons name={user.email_confirmed_at ? "checkmark" : "time"} size={12} color="#FFF" />
                    </View>
                </View>

                {/* Profile Form */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.textLight }]}>Full Name</Text>
                        <TextInput
                            style={[styles.input, { 
                                backgroundColor: theme.inputBackground, 
                                color: theme.text,
                                borderColor: theme.border,
                            }]}
                            value={profile.full_name}
                            onChangeText={(text) => setProfile({ ...profile, full_name: text })}
                            placeholder="Enter your name"
                            placeholderTextColor={theme.textLight}
                            maxLength={100}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.textLight }]}>Phone Number</Text>
                        <TextInput
                            style={[styles.input, { 
                                backgroundColor: theme.inputBackground, 
                                color: theme.text,
                                borderColor: theme.border,
                            }]}
                            value={profile.phone}
                            onChangeText={(text) => setProfile({ ...profile, phone: text })}
                            placeholder="+91 XXXXX XXXXX"
                            placeholderTextColor={theme.textLight}
                            keyboardType="phone-pad"
                            maxLength={15}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.textLight }]}>Email</Text>
                        <View style={[styles.input, styles.disabledInput, { 
                            backgroundColor: isDarkMode ? '#333' : '#F5F5F5', 
                            borderColor: theme.border,
                        }]}>
                            <Text style={[styles.disabledText, { color: theme.textLight }]}>
                                {profile.email}
                            </Text>
                            <Ionicons name="lock-closed" size={16} color={theme.textLight} />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.textLight }]}>Address</Text>
                        <TextInput
                            style={[styles.input, styles.textArea, { 
                                backgroundColor: theme.inputBackground, 
                                color: theme.text,
                                borderColor: theme.border,
                            }]}
                            value={profile.address}
                            onChangeText={(text) => setProfile({ ...profile, address: text })}
                            placeholder="Enter your address"
                            placeholderTextColor={theme.textLight}
                            multiline
                            numberOfLines={2}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.textLight }]}>City</Text>
                        <TextInput
                            style={[styles.input, { 
                                backgroundColor: theme.inputBackground, 
                                color: theme.text,
                                borderColor: theme.border,
                            }]}
                            value={profile.city}
                            onChangeText={(text) => setProfile({ ...profile, city: text })}
                            placeholder="Enter your city"
                            placeholderTextColor={theme.textLight}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <View style={styles.prefHeaderRow}>
                            <Text style={[styles.label, { color: theme.textLight, marginBottom: 0 }]}>Location Preferences</Text>
                            <Text style={[styles.prefCount, { color: theme.textLight }]}>
                                {(profile.location_preferences || []).length}/{MAX_LOCATION_PREFERENCES}
                            </Text>
                        </View>
                        <View style={styles.prefActionRow}>
                            <TouchableOpacity
                                style={[styles.prefActionBtn, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}
                                onPress={handleUseCurrentLocation}
                                disabled={currentLocLoading}
                            >
                                {currentLocLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <Ionicons name="navigate" size={16} color={colors.primary} />
                                )}
                                <Text style={[styles.prefActionText, { color: theme.text }]}>Use current location</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.prefActionBtn, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}
                                onPress={() => setMapPickerVisible(true)}
                                disabled={(profile.location_preferences || []).length >= MAX_LOCATION_PREFERENCES}
                            >
                                <Ionicons name="map" size={16} color={colors.primary} />
                                <Text style={[styles.prefActionText, { color: theme.text }]}>Select on map</Text>
                            </TouchableOpacity>
                        </View>
                        {(profile.location_preferences || []).length > 0 ? (
                            <View style={styles.prefChipWrap}>
                                {profile.location_preferences.map((loc, idx) => (
                                    <View key={`${loc}-${idx}`} style={[styles.prefChip, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                                        <Text style={[styles.prefChipText, { color: theme.text }]} numberOfLines={2}>
                                            {loc}
                                        </Text>
                                        <TouchableOpacity onPress={() => removeLocationPreference(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                            <Ionicons name="close-circle" size={18} color={theme.textLight} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <Text style={[styles.prefHint, { color: theme.textLight }]}>
                                Add up to 5 preferred locations for quick updates.
                            </Text>
                        )}
                    </View>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.saveBtnText}>Save Profile</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Account Info */}
                <View style={[styles.accountInfo, { borderTopColor: theme.border }]}>
                    <Text style={[styles.accountInfoTitle, { color: theme.textLight }]}>Account Information</Text>
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textLight }]}>User ID:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
                            {user.id?.substring(0, 12)}...
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textLight }]}>Account Created:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>
                            {new Date(user.created_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })}
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textLight }]}>Auth Provider:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>
                            {user.app_metadata?.provider || 'Email/Phone'}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[
                        styles.logoutBtn,
                        {
                            backgroundColor: isDarkMode ? '#2D1012' : '#FEF2F2',
                            borderColor: isDarkMode ? '#4A1E22' : '#FECACA',
                        },
                    ]}
                    onPress={handleLogout}
                >
                    <Ionicons name="log-out-outline" size={20} color={theme.error} style={{ marginRight: 8 }} />
                    <Text style={[styles.logoutText, { color: theme.error }]}>Logout</Text>
                </TouchableOpacity>

                <View style={styles.dangerZone}>
                    <Text style={[styles.dangerZoneLabel, { color: theme.textLight }]}>
                        DANGER ZONE
                    </Text>
                    <View
                        style={[
                            styles.dangerCard,
                            {
                                backgroundColor: isDarkMode ? '#1A0A0C' : '#FFF8F8',
                                borderColor: isDarkMode ? '#3A1418' : '#FEE2E2',
                            },
                        ]}
                    >
                        <Text style={[styles.dangerTitle, { color: theme.error }]}>
                            Delete account
                        </Text>
                        <Text style={[styles.dangerBody, { color: theme.textLight }]}>
                            Permanently remove your profile, carts, saved budgets, e-invites and
                            personal data from Ekatraa. Past orders remain with vendors but are
                            anonymized. You will be signed out and asked to login or sign up again.
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.dangerBtn,
                                { borderColor: theme.error, opacity: deleting ? 0.6 : 1 },
                            ]}
                            onPress={handleDeleteAccount}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <ActivityIndicator size="small" color={theme.error} />
                            ) : (
                                <Ionicons name="trash-outline" size={18} color={theme.error} />
                            )}
                            <Text style={[styles.dangerBtnText, { color: theme.error }]}>
                                {deleting ? 'Deleting your account…' : 'Delete my account'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
            <LocationMapPickerModal
                visible={mapPickerVisible}
                onClose={() => setMapPickerVisible(false)}
                onConfirm={({ address }) => {
                    setProfile((p) => ({
                        ...p,
                        location_preferences: appendLocationPreference(p.location_preferences, address),
                    }));
                }}
            />
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
    scrollContent: {
        padding: 20,
        paddingBottom: 120,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    avatarSection: {
        alignItems: 'center',
        marginBottom: 32,
        position: 'relative',
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 4,
        borderColor: colors.primary,
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 0,
        right: '35%',
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#FFF',
    },
    form: {
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 20,
    },
    prefHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    prefCount: {
        fontSize: 12,
        fontWeight: '600',
    },
    prefActionRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 10,
    },
    prefActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 8,
        gap: 6,
    },
    prefActionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    prefChipWrap: {
        gap: 8,
    },
    prefChip: {
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    prefChipText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    prefHint: {
        fontSize: 12,
        lineHeight: 17,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    disabledInput: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    disabledText: {
        fontSize: 16,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        marginBottom: 32,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    accountInfo: {
        paddingTop: 24,
        borderTopWidth: 1,
    },
    accountInfoTitle: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    infoLabel: {
        fontSize: 14,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    logoutBtn: {
        marginTop: 20,
        marginBottom: 8,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '700',
    },
    dangerZone: {
        marginTop: 24,
        marginBottom: 32,
    },
    dangerZoneLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },
    dangerCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
    },
    dangerTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 6,
    },
    dangerBody: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 14,
    },
    dangerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    dangerBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});
