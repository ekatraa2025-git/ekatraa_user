import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

/**
 * Floating toast — brand-aligned card, top placement, auto-dismiss.
 * @param {object | null} toast - { title?, message, variant?: 'success'|'error'|'info', duration?, action?: { label, onPress } }
 */
export default function AppToast({ toast, theme, topInset = 12, onDismiss }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-20)).current;
    const timerRef = useRef(null);

    const runDismiss = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
        ]).start(({ finished }) => {
            if (finished) onDismiss?.();
        });
    }, [opacity, translateY, onDismiss]);

    useEffect(() => {
        if (!toast) return undefined;
        opacity.setValue(0);
        translateY.setValue(-20);
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
        ]).start();
        const dur =
            toast.duration != null
                ? toast.duration
                : toast.action
                  ? 4800
                  : 3200;
        timerRef.current = setTimeout(() => runDismiss(), dur);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast, opacity, translateY, runDismiss]);

    if (!toast) return null;

    const variant = toast.variant || 'info';
    const accent =
        variant === 'success' ? colors.success : variant === 'error' ? colors.error : colors.primary;
    const icon =
        variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'alert-circle' : 'information-circle';

    const cardBg = theme?.card ?? colors.light.card;
    const borderCol = theme?.border ?? colors.light.border;
    const textMain = theme?.text ?? colors.light.text;
    const textSub = theme?.textLight ?? colors.light.textLight;

    return (
        <Modal visible={!!toast} animationType="none" transparent statusBarTranslucent onRequestClose={runDismiss}>
            <View style={styles.modalOverlay} pointerEvents="box-none">
                <Animated.View
                    pointerEvents="box-none"
                    style={[
                        styles.container,
                        {
                            top: topInset,
                            opacity,
                            transform: [{ translateY }],
                        },
                    ]}
                >
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <View style={[styles.accentBar, { backgroundColor: accent }]} />
                <Ionicons name={icon} size={24} color={accent} style={styles.leadIcon} />
                <View style={styles.textBlock}>
                    {toast.title ? (
                        <Text style={[styles.title, { color: textMain }]} numberOfLines={2}>
                            {toast.title}
                        </Text>
                    ) : null}
                    <Text style={[styles.message, { color: toast.title ? textSub : textMain }]} numberOfLines={4}>
                        {toast.message}
                    </Text>
                </View>
                {toast.action ? (
                    <TouchableOpacity
                        style={[styles.actionPill, { borderColor: accent + '55' }]}
                        onPress={() => {
                            try {
                                toast.action.onPress?.();
                            } finally {
                                runDismiss();
                            }
                        }}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.actionLabel, { color: accent }]}>{toast.action.label}</Text>
                    </TouchableOpacity>
                ) : null}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-start',
        pointerEvents: 'box-none',
    },
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
