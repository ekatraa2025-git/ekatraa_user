import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { colors as brandColors } from '../theme/colors';
import { USER_TERMS_VERSION, getUserAgreementFullText } from '../legal/userAgreementSections';

const STORAGE_KEY = 'ekatraa_user_terms_acceptance';

async function loadAccepted() {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.version === USER_TERMS_VERSION && parsed?.acceptedAt) return parsed;
    } catch {
        /* ignore */
    }
    return null;
}

export default function TermsAcceptanceGate({ children }) {
    const { theme } = useTheme();
    const [ready, setReady] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const row = await loadAccepted();
            if (!cancelled) {
                setAccepted(!!row);
                setReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onAccept = useCallback(async () => {
        if (!checked) return;
        const acceptedAt = new Date().toISOString();
        await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: USER_TERMS_VERSION, acceptedAt })
        );
        setAccepted(true);
    }, [checked]);

    if (!ready) {
        return (
            <View style={[styles.boot, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={brandColors.primary} />
            </View>
        );
    }

    if (accepted) {
        return children;
    }

    const fullText = getUserAgreementFullText();

    return (
            <Modal visible animationType="fade" transparent={false}>
                <View style={[styles.shell, { backgroundColor: theme.background }]}>
                    <Text style={[styles.title, { color: theme.text }]}>Terms & Conditions</Text>
                    <Text style={[styles.sub, { color: theme.textLight }]}>
                        Please read and accept to continue using Ekatraa.
                    </Text>
                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator
                    >
                        <Text style={[styles.body, { color: theme.text }]}>{fullText}</Text>
                    </ScrollView>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => setChecked(!checked)}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={checked ? brandColors.primary : theme.textLight}
                        />
                        <Text style={[styles.checkLabel, { color: theme.text }]}>
                            I agree to the Terms & Conditions
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.cta, !checked && styles.ctaDisabled, { backgroundColor: brandColors.primary }]}
                        onPress={onAccept}
                        disabled={!checked}
                    >
                        <Text style={styles.ctaText}>Accept & Continue</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
    );
}

const styles = StyleSheet.create({
    boot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    shell: { flex: 1, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24 },
    title: { fontSize: 22, fontWeight: '800' },
    sub: { fontSize: 14, marginTop: 6, marginBottom: 12 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 16 },
    body: { fontSize: 13, lineHeight: 20 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 12,
        paddingVertical: 8,
    },
    checkLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
    cta: {
        marginTop: 12,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    ctaDisabled: { opacity: 0.45 },
    ctaText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
