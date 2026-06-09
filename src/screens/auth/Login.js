import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, TouchableOpacity, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import UserTermsModal from '../../components/UserTermsModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../../context/ToastContext';
import Logo from '../../components/Logo';

export default function Login({ navigation, route }) {
    const { theme } = useTheme();
    const { t: tr } = useLocale();
    const { showToast } = useToast();
    const { sendOtp, signInWithGoogle, isAuthenticated, user, session, loading: authLoading } = useAuth();
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [userTermsVisible, setUserTermsVisible] = useState(false);
    const { width: windowWidth } = useWindowDimensions();
    const formMaxWidth = Math.min(440, windowWidth - 40);

    // Get redirect info if passed from booking flow
    const redirectAfterLogin = route?.params?.redirect;

    const handleSendOtp = async () => {
        // Validate phone
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length < 10) {
            showToast({
                variant: 'error',
                title: 'Invalid phone',
                message: 'Please enter a valid 10-digit phone number.',
            });
            return;
        }

        setLoading(true);
        try {
            const result = await sendOtp(cleanPhone);
            if (result.success) {
                navigation.navigate('Otp', { 
                    phone: cleanPhone,
                    redirect: redirectAfterLogin,
                });
            } else {
                showToast({ variant: 'error', title: 'Error', message: result.error || 'Failed to send OTP. Please try again.' });
            }
        } catch (error) {
            showToast({ variant: 'error', title: 'Error', message: 'Something went wrong. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        try {
            const result = await signInWithGoogle();
            if (result.success) {
                // Will be handled by auth state change
                if (redirectAfterLogin) {
                    navigation.navigate(redirectAfterLogin);
                } else {
                    navigation.replace('Home');
                }
            } else if (result.error) {
                showToast({ variant: 'error', title: 'Error', message: result.error || 'Google sign-in failed. Please try again.' });
            }
        } catch (error) {
            showToast({ variant: 'error', title: 'Error', message: 'Something went wrong. Please try again.' });
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleSkip = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.replace('Home');
        }
    };

    const isLoggedIn = !!isAuthenticated || !!user || !!session;

    if (!authLoading && isLoggedIn) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.alreadyLoggedInWrap}>
                    <View style={styles.logoContainer}>
                        <Logo width={74} height={74} />
                    </View>
                    <Text style={[styles.alreadyLoggedInTitle, { color: theme.text }]}>User already logged in</Text>
                    <Text style={[styles.alreadyLoggedInSub, { color: theme.textLight }]}>
                        You are already authenticated on this device.
                    </Text>
                    <Button
                        title="Continue to Home"
                        onPress={() => navigation.replace('Home')}
                        style={styles.alreadyLoggedInBtn}
                    />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView
                    behavior="padding"
                    style={styles.keyboardView}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                    >
                    <View style={[styles.formColumn, { maxWidth: formMaxWidth }]}>
                    {/* Header with close button */}
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={handleSkip} style={styles.closeButton}>
                            <Ionicons name="close" size={28} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    {/* Logo and Title */}
                    <View style={styles.header}>
                        <View style={styles.logoContainer}>
                            <Logo width={80} height={80} />
                        </View>
                        <Text style={[styles.title, { color: theme.text }]}>{tr('login_welcome_title')}</Text>
                        <Text style={[styles.subtitle, { color: theme.textLight }]}>
                            {tr('login_subtitle')}
                        </Text>
                    </View>

                    {/* Login Form */}
                    <View style={styles.form}>
                        <Input
                            label={tr('login_phone_label')}
                            placeholder={tr('login_phone_ph')}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            maxLength={10}
                            leftIcon={
                                <Text style={[styles.countryCode, { color: theme.text }]}>+91</Text>
                            }
                        />

                        <Button
                            title={loading ? tr('login_sending_otp') : tr('login_continue_otp')}
                            onPress={handleSendOtp}
                            loading={loading}
                            style={styles.otpButton}
                        />

                        {/* Divider */}
                        {/* <View style={styles.dividerContainer}>
                            <View style={[styles.divider, { backgroundColor: theme.border }]} />
                            <Text style={[styles.dividerText, { color: theme.textLight }]}>{tr('login_or')}</Text>
                            <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        </View> */}

                        {/* Google Sign In */}
                        {/* <TouchableOpacity
                            style={[styles.googleButton, { borderColor: theme.border }]}
                            onPress={handleGoogleSignIn}
                            disabled={googleLoading}
                        >
                            {googleLoading ? (
                                <ActivityIndicator color={theme.text} />
                            ) : (
                                <>
                                    <Ionicons name="logo-google" size={22} color="#DB4437" />
                                    <Text style={[styles.googleText, { color: theme.text }]}>
                                        {tr('login_google')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity> */}
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={[styles.footerText, { color: theme.textLight }]}>
                            {tr('login_footer_agree')}{' '}
                        </Text>
                        <View style={styles.footerLinks}>
                            <TouchableOpacity onPress={() => setUserTermsVisible(true)} activeOpacity={0.7}>
                                <Text style={[styles.link, { color: colors.primary }]}>{tr('login_terms')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.footerText, { color: theme.textLight }]}> {tr('login_footer_same')}</Text>
                        </View>
                    </View>
                    <UserTermsModal visible={userTermsVisible} onClose={() => setUserTermsVisible(false)} />
                    </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 20,
        paddingBottom: 32,
        alignItems: 'center',
    },
    formColumn: {
        width: '100%',
        alignSelf: 'center',
    },
    alreadyLoggedInWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    alreadyLoggedInTitle: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 8,
    },
    alreadyLoggedInSub: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 21,
    },
    alreadyLoggedInBtn: {
        marginTop: 22,
        alignSelf: 'stretch',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 10,
    },
    closeButton: {
        padding: 8,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
        paddingHorizontal: 20,
        lineHeight: 22,
    },
    form: {
        flex: 1,
    },
    countryCode: {
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    },
    otpButton: {
        marginTop: 20,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 30,
    },
    divider: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        marginHorizontal: 16,
        fontSize: 14,
        fontWeight: '500',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 12,
    },
    googleText: {
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        marginBottom: 20,
    },
    footerText: {
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    footerLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
    },
    link: {
        fontWeight: '600',
    },
});
