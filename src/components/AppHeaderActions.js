import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useLocale } from '../context/LocaleContext';
import { useCart } from '../context/CartContext';
import { useUserNotifications } from '../context/UserNotificationContext';

/**
 * Language + cart controls shown app-wide (positioned by parent overlay).
 */
export default function AppHeaderActions() {
    const navigation = useNavigation();
    const { theme, isDarkMode } = useTheme();
    const { t: tr, language, setLanguage } = useLocale();
    const { cartItemCount } = useCart();
    const { unreadCount } = useUserNotifications();
    const [langModalVisible, setLangModalVisible] = useState(false);

    const iconBg = isDarkMode ? '#1F2333' : '#F3F4F6';

    return (
        <>
            <View style={styles.row} pointerEvents="box-none">
                <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: iconBg }]}
                    onPress={() => setLangModalVisible(true)}
                    activeOpacity={0.7}
                    accessibilityLabel={tr('select_language')}
                >
                    <Ionicons name="language-outline" size={19} color={theme.text} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: iconBg }]}
                    onPress={() => navigation.navigate('Notifications')}
                    activeOpacity={0.7}
                    accessibilityLabel={tr('notifications_title')}
                >
                    <Ionicons name="notifications-outline" size={19} color={theme.text} />
                    {unreadCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.badgeText}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: iconBg }]}
                    onPress={() => navigation.navigate('Cart')}
                    activeOpacity={0.7}
                    accessibilityLabel={tr('tab_cart')}
                >
                    <Ionicons name="cart-outline" size={19} color={theme.text} />
                    {cartItemCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.badgeText}>
                                {cartItemCount > 99 ? '99+' : cartItemCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <Modal visible={langModalVisible} animationType="fade" transparent>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    onPress={() => setLangModalVisible(false)}
                    activeOpacity={1}
                >
                    <View
                        style={[styles.pickerContent, { backgroundColor: theme.card }]}
                        onStartShouldSetResponder={() => true}
                    >
                        <View style={styles.pickerHandle} />
                        <Text style={[styles.pickerTitle, { color: theme.text }]}>
                            {tr('select_language')}
                        </Text>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {[
                                { code: 'en', label: tr('lang_en') },
                                { code: 'hi', label: tr('lang_hi') },
                                { code: 'or', label: tr('lang_or') },
                            ].map((opt) => {
                                const isSel = language === opt.code;
                                return (
                                    <TouchableOpacity
                                        key={opt.code}
                                        style={[
                                            styles.pickerItem,
                                            { borderBottomColor: theme.border },
                                            isSel && { backgroundColor: colors.primary + '10' },
                                        ]}
                                        onPress={() => {
                                            setLanguage(opt.code);
                                            setLangModalVisible(false);
                                        }}
                                    >
                                        <Ionicons
                                            name="globe-outline"
                                            size={18}
                                            color={isSel ? colors.primary : theme.textLight}
                                        />
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                { color: theme.text },
                                                isSel && { color: colors.primary, fontWeight: '700' },
                                            ]}
                                        >
                                            {opt.label}
                                        </Text>
                                        {isSel ? (
                                            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                        ) : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -2,
        right: -2,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '800',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 28,
        paddingHorizontal: 16,
        maxHeight: '55%',
    },
    pickerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CCC',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 12,
    },
    pickerTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 12,
    },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    pickerItemText: {
        flex: 1,
        fontSize: 16,
    },
});
