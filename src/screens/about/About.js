import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import BottomTabBar from '../../components/BottomTabBar';
import Logo from '../../components/Logo';

export default function About({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { t: tr } = useLocale();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>{tr('about_title')}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <LinearGradient
                    colors={[colors.primary + '15', colors.primary + '05']}
                    style={styles.heroCard}
                >
                    <View style={[styles.logoWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFFFFF' }]}>
                        <Logo width={48} height={48} />
                    </View>
                    <Text style={[styles.appName, { color: theme.text }]}>Ekatraa</Text>
                    <Text style={[styles.tagline, { color: theme.textLight }]}>
                        {tr('about_tagline')}
                    </Text>
                    <Text style={[styles.version, { color: theme.textLight }]}>Version 1.0.0</Text>
                </LinearGradient>

                <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('about_what_title')}</Text>
                    <Text style={[styles.body, { color: theme.textLight }]}>
                        {tr('about_what_body')}
                    </Text>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('about_mission_title')}</Text>
                    <Text style={[styles.body, { color: theme.textLight }]}>
                        {tr('about_mission_body')}
                    </Text>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{tr('about_contact_title')}</Text>
                    <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => Linking.openURL('mailto:help@ekatraa.in')}
                    >
                        <Ionicons name="mail-outline" size={18} color={colors.primary} />
                        <Text style={[styles.contactText, { color: colors.primary }]}>help@ekatraa.in</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => Linking.openURL('tel:+918422948781')}
                    >
                        <Ionicons name="call-outline" size={18} color={colors.primary} />
                        <Text style={[styles.contactText, { color: colors.primary }]}>+91 84229 48781</Text>
                    </TouchableOpacity>
                </View>

                <Text style={[styles.copyright, { color: theme.textLight }]}>
                    {tr('about_copyright')}
                </Text>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '700', marginLeft: 8 },
    scroll: { padding: 20 },
    heroCard: {
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        marginBottom: 20,
    },
    logoWrap: {
        width: 64,
        height: 64,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    appName: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
    tagline: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 10 },
    version: { fontSize: 12 },
    infoCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 18,
        marginBottom: 14,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
    body: { fontSize: 14, lineHeight: 22 },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    contactText: { fontSize: 14, fontWeight: '600' },
    copyright: { textAlign: 'center', fontSize: 12, marginTop: 20 },
});
