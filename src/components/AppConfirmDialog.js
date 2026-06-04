import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Pressable,
    Platform,
} from 'react-native';
import { colors } from '../theme/colors';

/**
 * Two-action dialog matching AppToast / Ekatraa card styling.
 */
export default function AppConfirmDialog({ visible, config, theme, onConfirm, onCancel }) {
    if (!visible || !config) return null;

    const {
        title = '',
        message = '',
        confirmLabel = 'OK',
        cancelLabel = 'Cancel',
        destructive = false,
    } = config;

    const cardBg = theme?.card ?? colors.light.card;
    const borderCol = theme?.border ?? colors.light.border;
    const textMain = theme?.text ?? colors.light.text;
    const textSub = theme?.textLight ?? colors.light.textLight;
    const confirmColor = destructive ? colors.error : colors.primary;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <Pressable style={styles.overlay} onPress={onCancel}>
                <Pressable style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]} onPress={(e) => e.stopPropagation()}>
                    <View style={[styles.accent, { backgroundColor: confirmColor }]} />
                    <View style={styles.inner}>
                        {title ? (
                            <Text style={[styles.title, { color: textMain }]} numberOfLines={4}>
                                {title}
                            </Text>
                        ) : null}
                        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text style={[styles.message, { color: title ? textSub : textMain }]}>{message}</Text>
                        </ScrollView>
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={[styles.btn, styles.btnGhost, { borderColor: borderCol }]}
                                onPress={onCancel}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.btnGhostText, { color: textMain }]}>{cancelLabel}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.btn, styles.btnPrimary, { backgroundColor: confirmColor }]}
                                onPress={onConfirm}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        maxHeight: '80%',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.2,
                shadowRadius: 20,
            },
            android: { elevation: 20 },
        }),
    },
    accent: {
        height: 4,
        width: '100%',
    },
    inner: { paddingHorizontal: 18, paddingBottom: 16, paddingTop: 14 },
    title: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    scroll: { maxHeight: 280 },
    message: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 18,
        flexWrap: 'wrap',
    },
    btn: {
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 14,
        minWidth: 100,
        alignItems: 'center',
    },
    btnGhost: { borderWidth: 1.5, backgroundColor: 'transparent' },
    btnGhostText: { fontSize: 15, fontWeight: '700' },
    btnPrimary: {},
    btnPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
