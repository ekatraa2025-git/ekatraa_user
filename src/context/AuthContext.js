import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, authService } from '../services/supabase';
import { api } from '../services/api';
import { getExpoPushToken } from '../lib/appNotifications';

/** Maps Supabase / provider OTP errors to short, user-friendly copy (no raw Twilio codes or doc URLs). */
function mapAuthOtpErrorToUserMessage(error) {
    const raw = String(error?.message ?? error ?? '').trim();
    const lower = raw.toLowerCase();

    if (!raw) {
        return "We couldn't send the verification code. Please try again.";
    }

    if (raw.includes('20003') || lower.includes('twilio.com/docs/errors/20003')) {
        return 'SMS sign-in is temporarily unavailable. Please try again in a few minutes, or use Google sign-in.';
    }

    if (lower.includes('error sending confirmation otp') || lower.includes('sending confirmation otp to provider')) {
        if (lower.includes('authenticate') || lower.includes('twilio') || lower.includes('20003')) {
            return 'We could not deliver the SMS code right now. Please try again shortly, or use Google sign-in.';
        }
        return 'We could not send the verification code. Please check your phone number and try again.';
    }

    if (
        (lower.includes('rate') && lower.includes('limit')) ||
        lower.includes('too many requests') ||
        lower.includes('over_email_send_rate_limit') ||
        lower.includes('sms_send_rate_limit')
    ) {
        return 'Too many code requests. Please wait a minute before trying again.';
    }

    if (lower.includes('invalid otp') || lower.includes('token has expired') || lower.includes('otp_expired')) {
        return 'That code is invalid or has expired. Request a new code and try again.';
    }

    if (raw.length > 160 || lower.includes('http://') || lower.includes('https://')) {
        return "Something went wrong with SMS verification. Please try again, or use Google sign-in if you can.";
    }

    return raw;
}

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check initial session
        checkSession();

        // Listen for auth changes
        const { data: { subscription } } = authService.onAuthStateChange(
            async (event, session) => {
                console.log('[AUTH] State changed:', event);
                setSession(session);
                setUser(session?.user ?? null);
                setIsAuthenticated(!!session?.user);
            }
        );

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const checkSession = async () => {
        try {
            const { session, error } = await authService.getSession();
            const refreshInvalid =
                error &&
                (String(error.message || '')
                    .toLowerCase()
                    .includes('refresh token') ||
                    String(error.code || '').toLowerCase().includes('refresh'));
            if (refreshInvalid) {
                await authService.signOut();
                setSession(null);
                setUser(null);
                setIsAuthenticated(false);
                return;
            }
            if (error) {
                console.error('[AUTH] Session check error:', error);
            }
            setSession(session);
            setUser(session?.user ?? null);
            setIsAuthenticated(!!session?.user);
        } catch (error) {
            console.error('[AUTH] Session check failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const sendOtp = async (phone) => {
        try {
            const { data, error } = await authService.sendOtp(phone);
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('[AUTH] Send OTP error:', error);
            return { success: false, error: mapAuthOtpErrorToUserMessage(error) };
        }
    };

    const verifyOtp = async (phone, token) => {
        try {
            const { data, error } = await authService.verifyOtp(phone, token);
            if (error) throw error;
            // Persisted session in AsyncStorage is source of truth (fixes payment / API token race)
            const { session: persisted } = await authService.getSession();
            const session = persisted ?? data?.session ?? null;
            const user = session?.user ?? data?.user ?? null;
            setSession(session);
            setUser(user);
            setIsAuthenticated(!!user);
            return { success: true, data: { ...data, session, user } };
        } catch (error) {
            console.error('[AUTH] Verify OTP error:', error);
            return { success: false, error: mapAuthOtpErrorToUserMessage(error) };
        }
    };

    const refreshSession = useCallback(async () => {
        const { session, error } = await authService.refreshSessionTokens();
        if (error) {
            console.error('[AUTH] refreshSession:', error);
        }
        setSession(session);
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);
        return session;
    }, []);

    const signInWithGoogle = async () => {
        try {
            const { data, error } = await authService.signInWithGoogle();
            if (error) {
                if (error.silent || error.message === 'CANCELLED') return { success: false, error: null };
                throw error;
            }
            return { success: true, data };
        } catch (error) {
            console.error('[AUTH] Google sign-in error:', error);
            return { success: false, error: error.message };
        }
    };

    const signOut = async () => {
        try {
            const accessToken = session?.access_token || null;
            if (accessToken) {
                try {
                    const pushToken = await getExpoPushToken();
                    if (pushToken) {
                        await api.unregisterPushToken(pushToken, accessToken);
                    }
                } catch {
                    /* non-fatal */
                }
            }
            const { error } = await authService.signOut();
            if (error) {
                console.warn('[AUTH] Sign out:', error.message || error);
            }
        } catch (error) {
            console.warn('[AUTH] Sign out:', error?.message || error);
        } finally {
            setUser(null);
            setSession(null);
            setIsAuthenticated(false);
        }
        return { success: true };
    };

    const value = {
        user,
        session,
        loading,
        isAuthenticated,
        sendOtp,
        verifyOtp,
        signInWithGoogle,
        signOut,
        checkSession,
        refreshSession,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;

