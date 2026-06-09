import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function AppToast({ toast, theme, topInset = 12, onDismiss }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-20)).current;
    const timerRef = useRef(null);
    const visibleRef = useRef(false);

    const runDismiss = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
        ]).start(({ finished }) => {
            if (finished) {
                visibleRef.current = false;
                onDismiss?.();
            }
        });
    }, [opacity, translateY, onDismiss]);

    useEffect(() => {
        if (!toast) {
            // If toast is cleared externally, snap out immediately
            opacity.setValue(0);
            translateY.setValue(-20);
            visibleRef.current = false;
            return;
        }

        visibleRef.current = true;
        opacity.setValue(0);
        translateY.setValue(-20);

        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
        ]).start();

        const dur = toast.duration != null ? toast.duration : toast.action ? 4800 : 3200;
        timerRef.current = setTimeout(() => runDismiss(), dur);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast, opacity, translateY, runDismiss]);

    // Always render — visibility controlled by opacity + pointerEvents
    const isVisible = !!toast;

    const variant = toast?.variant || 'info';
    const accent =
        variant === 'success' ? colors.success : variant === 'error' ? colors.error : colors.primary;
    const icon =
        variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle';

    const cardBg = theme?.card ?? '#fff';
    const borderCol = theme?.border ?? '#e5e7eb';
    const textMain = theme?.text ?? '#111';
    const textSub = theme?.textLight ?? '#6b7280';

    return (
        <Animated.View
            pointerEvents={isVisible ? 'box-none' : 'none'}  // ← passes touches through when hidden
            style={[
                styles.container,
                {
                    top: topInset,
                    opacity,
                    transform: [{ translateY }],
                },
            ]}
        >
            {isVisible && (
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
                    <View style={[styles.accentBar, { backgroundColor: accent }]} />
                    <Ionicons name={icon} size={24} color={accent} style={styles.leadIcon} />
                    <View style={styles.textBlock}>
                        {toast.title ? (
                            <Text style={[styles.title, { color: textMain }]} numberOfLines={2}>
                                {toast.title}
                            </Text>
                        ) : null}
                        <Text
                            style={[styles.message, { color: toast.title ? textSub : textMain }]}
                            numberOfLines={4}
                        >
                            {toast.message}
                        </Text>
                    </View>
                    {toast.action ? (
                        <TouchableOpacity
                            style={[styles.actionPill, { borderColor: accent + '55' }]}
                            onPress={() => {
                                runDismiss();
                                // Navigate after dismiss animation starts
                                setTimeout(() => toast.action.onPress?.(), 150);
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.actionLabel, { color: accent }]}>
                                {toast.action.label}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 10000,
        elevation: 40,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 14,
        paddingRight: 12,
        paddingLeft: 0,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12,
                shadowRadius: 16,
            },
            android: { elevation: 12 },
        }),
    },
    accentBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    leadIcon: { marginLeft: 12, marginRight: 10 },
    textBlock: { flex: 1, minWidth: 0 },
    title: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
    message: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
    actionPill: {
        marginLeft: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1.5,
        backgroundColor: 'transparent',
    },
    actionLabel: { fontSize: 14, fontWeight: '800' },
});