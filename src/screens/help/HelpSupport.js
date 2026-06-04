import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import BottomTabBar from '../../components/BottomTabBar';

const FAQ_KEYS = [
    ['faq_q1', 'faq_a1'],
    ['faq_q2', 'faq_a2'],
    ['faq_q3', 'faq_a3'],
    ['faq_q4', 'faq_a4'],
    ['faq_q5', 'faq_a5'],
];

export default function HelpSupport({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('help_title')}</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{tr('help_contact_title')}</Text>

                    <TouchableOpacity
                        style={[styles.contactBtn, { backgroundColor: colors.primary + '10' }]}
                        onPress={() => Linking.openURL('tel:+918422948781')}
                    >
                        <Ionicons name="call-outline" size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.contactLabel, { color: theme.text }]}>{tr('help_call_us')}</Text>
                            <Text style={[styles.contactValue, { color: theme.textLight }]}>+91 84229 48781</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.contactBtn, { backgroundColor: colors.primary + '10' }]}
                        onPress={() => Linking.openURL('mailto:help@ekatraa.in')}
                    >
                        <Ionicons name="mail-outline" size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.contactLabel, { color: theme.text }]}>{tr('help_email_us')}</Text>
                            <Text style={[styles.contactValue, { color: theme.textLight }]}>help@ekatraa.in</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.contactBtn, { backgroundColor: '#25D366' + '15' }]}
                        onPress={() => Linking.openURL('https://wa.me/918422948781')}
                    >
                        <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.contactLabel, { color: theme.text }]}>{tr('help_whatsapp_label')}</Text>
                            <Text style={[styles.contactValue, { color: theme.textLight }]}>{tr('help_chat_with_us')}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
                    </TouchableOpacity>
                </View>

                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{tr('help_faq_title')}</Text>
                    {FAQ_KEYS.map(([qk, ak], idx) => (
                        <View key={qk} style={[styles.faqItem, idx < FAQ_KEYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                            <Text style={[styles.faqQ, { color: theme.text }]}>{tr(qk)}</Text>
                            <Text style={[styles.faqA, { color: theme.textLight }]}>{tr(ak)}</Text>
                        </View>
                    ))}
                </View>
                <View style={{ height: 80 }} />
            </ScrollView>
            <BottomTabBar navigation={navigation} activeRoute="About" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    scroll: { padding: 16, paddingBottom: 40 },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
    contactBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
    },
    contactLabel: { fontSize: 15, fontWeight: '600' },
    contactValue: { fontSize: 13, marginTop: 2 },
    faqItem: { paddingVertical: 14 },
    faqQ: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
    faqA: { fontSize: 13, lineHeight: 20 },
});
