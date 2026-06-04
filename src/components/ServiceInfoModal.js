import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Platform,
    Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { useToast } from '../context/ToastContext';
import { StorageVideoCover } from './StorageVideoCover';

const TIER_LABELS = [
    { key: 'classic', label: 'Classic Value', priceKey: 'price_classic_value' },
    { key: 'signature', label: 'Signature', priceKey: 'price_signature' },
    { key: 'prestige', label: 'Prestige', priceKey: 'price_prestige' },
    { key: 'royal', label: 'Royal', priceKey: 'price_royal' },
    { key: 'imperial', label: 'Imperial', priceKey: 'price_imperial' },
];

export default function ServiceInfoModal({
    visible,
    onClose,
    service,
    onSubmitRequest,
    occasionId,
    occasionName,
}) {
    const { theme, isDarkMode } = useTheme();
    const { showToast } = useToast();
    const { isAuthenticated, user } = useAuth();

    const [role, setRole] = useState(null);
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [eventDate, setEventDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [guestCount, setGuestCount] = useState('');
    const [venuePreference, setVenuePreference] = useState('');
    const [budget, setBudget] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedTier, setSelectedTier] = useState(null);
    const [loading, setLoading] = useState(false);

    const getTierPrice = (priceKey) => {
        if (!service) return null;
        const v = service[priceKey];
        if (v != null && v !== '') return Number(v);
        return null;
    };

    const hasAnyTierPrice = TIER_LABELS.some((t) => getTierPrice(t.priceKey) != null);
    const fromPrice = service?.price_min != null ? Number(service.price_min) : (service?.price_max != null ? Number(service.price_max) : null);

    const renderRoleSelection = () => {
        const typeId = occasionId || (service && (service.occasion_id || service.event_type_id));
        if (typeId === 'wedding' || (occasionName && occasionName.toLowerCase().includes('wedding'))) {
            return (
                <View style={styles.roleContainer}>
                    <Text style={[styles.sectionLabel, { color: theme.text }]}>Who is this for?</Text>
                    <View style={styles.roleOptions}>
                        <TouchableOpacity
                            style={[
                                styles.roleChip,
                                { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                role === 'groom' && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setRole('groom')}
                        >
                            <Text style={[styles.roleText, { color: theme.text }, role === 'groom' && { color: '#FFF', fontWeight: 'bold' }]}>
                                🤵 Groom
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.roleChip,
                                { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                role === 'bride' && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setRole('bride')}
                        >
                            <Text style={[styles.roleText, { color: theme.text }, role === 'bride' && { color: '#FFF', fontWeight: 'bold' }]}>
                                👰 Bride
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.roleChip,
                                { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                role === 'host' && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setRole('host')}
                        >
                            <Text style={[styles.roleText, { color: theme.text }, role === 'host' && { color: '#FFF', fontWeight: 'bold' }]}>
                                🎤 Host
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }
        return (
            <View style={styles.roleContainer}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Role</Text>
                <TouchableOpacity
                    style={[
                        styles.roleChip,
                        { backgroundColor: theme.inputBackground, borderColor: theme.border },
                        role === 'host' && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setRole('host')}
                >
                    <Text style={[styles.roleText, { color: theme.text }, role === 'host' && { color: '#FFF', fontWeight: 'bold' }]}>
                        🎤 Event Host
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    const handleSubmitRequest = () => {
        if (!contactName.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter your name.' });
            return;
        }
        if (!contactPhone.trim() || contactPhone.replace(/\D/g, '').length < 10) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter a valid phone number.' });
            return;
        }
        if (onSubmitRequest) {
            setLoading(true);
            onSubmitRequest({
                service,
                role,
                contact_name: contactName,
                contact_phone: contactPhone,
                event_date: eventDate,
                guest_count: guestCount ? parseInt(guestCount, 10) : null,
                venue_preference: venuePreference || null,
                budget: budget || null,
                notes: notes || null,
            }).finally(() => setLoading(false));
            onClose();
        } else {
            showToast({
                variant: 'success',
                title: 'Request submitted',
                message: 'Services under this category can be added to cart from the list below.',
            });
            onClose();
        }
    };

    if (!service) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{service.name}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={26} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.scrollBody}
                        showsVerticalScrollIndicator={false}
                    >
                        {service.video_url ? (
                            <StorageVideoCover
                                uri={service.video_url}
                                fallbackImageUri={service.image_url}
                                style={styles.serviceImage}
                                resizeMode="cover"
                            />
                        ) : service.image_url ? (
                            <Image source={{ uri: service.image_url }} style={styles.serviceImage} resizeMode="cover" />
                        ) : (
                            <View style={[styles.serviceImagePlaceholder, { backgroundColor: theme.inputBackground }]}>
                                <Text style={{ fontSize: 48 }}>{service.icon || '🎯'}</Text>
                            </View>
                        )}

                        {service.description ? (
                            <Text style={[styles.description, { color: theme.textLight }]}>{service.description}</Text>
                        ) : null}

                        {/* Pricing tiers */}
                        <Text style={[styles.sectionLabel, { color: theme.text }]}>Pricing</Text>
                        {hasAnyTierPrice ? (
                            <View style={[styles.tierList, { backgroundColor: theme.inputBackground }]}>
                                {TIER_LABELS.map((t) => {
                                    const price = getTierPrice(t.priceKey);
                                    const isSelected = selectedTier === t.key;
                                    return (
                                        <TouchableOpacity
                                            key={t.key}
                                            style={[
                                                styles.tierRow,
                                                isSelected && { backgroundColor: colors.primary + '22', borderColor: colors.primary },
                                            ]}
                                            onPress={() => price != null && setSelectedTier(isSelected ? null : t.key)}
                                            disabled={price == null}
                                        >
                                            <Text style={[styles.tierLabel, { color: theme.text }]}>{t.label}</Text>
                                            <Text style={[styles.tierPrice, { color: price != null ? colors.primary : theme.textLight }]}>
                                                {price != null ? `₹${price.toLocaleString()}` : '—'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <View style={[styles.fromPriceRow, { backgroundColor: theme.inputBackground }]}>
                                <Text style={[styles.fromPriceLabel, { color: theme.text }]}>From</Text>
                                <Text style={[styles.fromPriceValue, { color: colors.primary }]}>
                                    {fromPrice != null ? `₹${fromPrice.toLocaleString()}` : '—'}
                                </Text>
                            </View>
                        )}

                        <Text style={[styles.sectionLabel, { color: theme.text }]}>Request details (optional)</Text>
                        {renderRoleSelection()}
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Your name"
                            placeholderTextColor={theme.textLight}
                            value={contactName}
                            onChangeText={setContactName}
                        />
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Phone"
                            placeholderTextColor={theme.textLight}
                            value={contactPhone}
                            onChangeText={setContactPhone}
                            keyboardType="phone-pad"
                        />
                        <TouchableOpacity
                            style={[styles.input, styles.dateBtn, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                            <Text style={[styles.dateText, { color: theme.text }]}>{eventDate.toDateString()}</Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                            <DateTimePicker
                                value={eventDate}
                                mode="date"
                                display="default"
                                minimumDate={new Date()}
                                onChange={(e, d) => {
                                    setShowDatePicker(Platform.OS === 'ios');
                                    if (d) setEventDate(d);
                                }}
                            />
                        )}
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Guest count"
                            placeholderTextColor={theme.textLight}
                            value={guestCount}
                            onChangeText={setGuestCount}
                            keyboardType="number-pad"
                        />
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Venue / location preference"
                            placeholderTextColor={theme.textLight}
                            value={venuePreference}
                            onChangeText={setVenuePreference}
                        />
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Budget (e.g. ₹1-2 Lakhs)"
                            placeholderTextColor={theme.textLight}
                            value={budget}
                            onChangeText={setBudget}
                        />
                        <TextInput
                            style={[styles.input, styles.notesInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                            placeholder="Additional notes"
                            placeholderTextColor={theme.textLight}
                            value={notes}
                            onChangeText={setNotes}
                            multiline
                            numberOfLines={3}
                        />

                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={[styles.primaryBtn, styles.singleBtn]}
                                onPress={handleSubmitRequest}
                                disabled={loading}
                            >
                                <Ionicons name="document-text-outline" size={20} color="#FFF" />
                                <Text style={styles.primaryBtnText}>Submit request</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '92%',
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        flex: 1,
    },
    closeBtn: { padding: 8 },
    scrollBody: { paddingHorizontal: 20, paddingBottom: 32 },
    serviceImage: {
        width: '100%',
        height: 180,
        borderRadius: 12,
        marginBottom: 16,
    },
    serviceImagePlaceholder: {
        width: '100%',
        height: 120,
        borderRadius: 12,
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 10,
    },
    tierList: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
    },
    tierRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    tierLabel: { fontSize: 15, fontWeight: '500' },
    tierPrice: { fontSize: 15, fontWeight: '600' },
    fromPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 20,
        gap: 8,
    },
    fromPriceLabel: { fontSize: 15 },
    fromPriceValue: { fontSize: 18, fontWeight: '700' },
    input: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 15,
        marginBottom: 12,
    },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dateText: { fontSize: 15 },
    notesInput: { minHeight: 80, textAlignVertical: 'top' },
    actions: { marginTop: 8, gap: 12 },
    singleBtn: { marginTop: 4 },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    roleContainer: { marginBottom: 16 },
    roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    roleChip: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    roleText: { fontSize: 15, fontWeight: '500' },
    secondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: '600' },
});
