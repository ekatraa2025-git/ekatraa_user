import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, Platform, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/supabase';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { useToast } from '../context/ToastContext';

export default function BookingModal({ visible, onClose, eventType, navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { showToast, showConfirm } = useToast();
    const { isAuthenticated, user } = useAuth();
    
    const [role, setRole] = useState(null);
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [guestCount, setGuestCount] = useState('');
    const [venue, setVenue] = useState('');
    const [budget, setBudget] = useState('');
    const [notes, setNotes] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const resetForm = () => {
        setRole(null);
        setDate(new Date());
        setGuestCount('');
        setVenue('');
        setBudget('');
        setNotes('');
        setContactName('');
        setContactPhone('');
    };

    const handleSubmit = async () => {
        const typeId = eventType?.id || eventType;
        
        // Validation
        if (!role && (typeId === 'wedding' || typeId === 'janayu')) {
            showToast({
                variant: 'info',
                title: 'Selection required',
                message: 'Please select if you are the Groom, Bride, or Host.',
            });
            return;
        }

        if (!contactName.trim()) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter your name.' });
            return;
        }

        if (!contactPhone.trim() || contactPhone.replace(/\D/g, '').length < 10) {
            showToast({ variant: 'info', title: 'Required', message: 'Please enter a valid phone number.' });
            return;
        }

        // Check if user is logged in for booking
        if (!isAuthenticated) {
            showConfirm({
                title: 'Login required',
                message: 'Please login to submit your booking request.',
                cancelLabel: 'Cancel',
                confirmLabel: 'Login',
                onConfirm: () => {
                    onClose();
                    navigation?.navigate('Login', { redirect: 'Home' });
                },
            });
            return;
        }

        setLoading(true);
        
        try {
            // Prepare enquiry data
            const enquiryData = {
                user_id: user?.id,
                event_type: eventType?.name || typeId,
                event_date: date.toISOString(),
                role: role,
                guest_count: parseInt(guestCount) || null,
                preferred_venue: venue || null,
                budget_range: budget || null,
                additional_notes: notes || null,
                contact_name: contactName,
                contact_phone: contactPhone.replace(/\D/g, ''),
                status: 'pending',
            };

            const { data, error } = await dbService.submitEnquiry(enquiryData);

            if (error) {
                throw error;
            }

            showToast({
                variant: 'success',
                title: 'Request received',
                message: 'An Ekatraa manager will connect with you shortly with relevant quotes and venue options.',
                action: {
                    label: 'OK',
                    onPress: () => {
                        resetForm();
                        onClose();
                    },
                },
            });
        } catch (error) {
            console.error('[ENQUIRY ERROR]', error);
            showToast({
                variant: 'error',
                title: 'Error',
                message: 'Failed to submit your request. Please try again.',
            });
        } finally {
            setLoading(false);
        }
    };

    const onDateChange = (event, selectedDate) => {
        const currentDate = selectedDate || date;
        setShowDatePicker(Platform.OS === 'ios');
        setDate(currentDate);
    };

    const renderRoleSelection = () => {
        const typeId = eventType?.id || eventType;
        if (typeId === 'wedding') {
            return (
                <View style={styles.roleContainer}>
                    <Text style={[styles.label, { color: theme.text }]}>Who is this for? *</Text>
                    <View style={styles.roleOptions}>
                        <TouchableOpacity
                            style={[
                                styles.roleChip,
                                { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                role === 'groom' && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setRole('groom')}
                        >
                            <Text style={[
                                styles.roleText,
                                { color: theme.text },
                                role === 'groom' && { color: '#FFF', fontWeight: 'bold' }
                            ]}>🤵 Groom</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.roleChip,
                                { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                role === 'bride' && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setRole('bride')}
                        >
                            <Text style={[
                                styles.roleText,
                                { color: theme.text },
                                role === 'bride' && { color: '#FFF', fontWeight: 'bold' }
                            ]}>👰 Bride</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }
        
        if (typeId === 'janayu' || typeId === 'birthday' || typeId === 'social' || typeId === 'corporate' || typeId === 'funeral') {
            return (
                <View style={styles.roleContainer}>
                    <Text style={[styles.label, { color: theme.text }]}>Role</Text>
                    <TouchableOpacity
                        style={[
                            styles.roleChip,
                            { backgroundColor: theme.inputBackground, borderColor: theme.border },
                            role === 'host' && { backgroundColor: colors.primary, borderColor: colors.primary }
                        ]}
                        onPress={() => setRole('host')}
                    >
                        <Text style={[
                            styles.roleText,
                            { color: theme.text },
                            role === 'host' && { color: '#FFF', fontWeight: 'bold' }
                        ]}>🎤 Event Host</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        
        return null;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.text }]}>
                            Plan {eventType?.name || 'Event'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={theme.textLight} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView 
                        contentContainerStyle={styles.scrollBody}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Role Selection */}
                        {renderRoleSelection()}

                        {/* Contact Name */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Your Name *</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Enter your full name"
                                placeholderTextColor={theme.textLight}
                                value={contactName}
                                onChangeText={setContactName}
                            />
                        </View>

                        {/* Contact Phone */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Phone Number *</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Enter 10-digit mobile number"
                                placeholderTextColor={theme.textLight}
                                value={contactPhone}
                                onChangeText={setContactPhone}
                                keyboardType="phone-pad"
                                maxLength={10}
                            />
                        </View>

                        {/* Event Date */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Event Date *</Text>
                            <TouchableOpacity
                                style={[styles.dateBtn, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                <Text style={[styles.dateText, { color: theme.text }]}>{date.toDateString()}</Text>
                            </TouchableOpacity>
                            {showDatePicker && (
                                <DateTimePicker
                                    value={date}
                                    mode="date"
                                    display="default"
                                    minimumDate={new Date()}
                                    onChange={onDateChange}
                                />
                            )}
                        </View>

                        {/* Guest Count */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Expected Guests</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Approximate number of guests"
                                placeholderTextColor={theme.textLight}
                                value={guestCount}
                                onChangeText={setGuestCount}
                                keyboardType="number-pad"
                            />
                        </View>

                        {/* Preferred Venue */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Preferred Venue / Location</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Any specific area or venue in mind?"
                                placeholderTextColor={theme.textLight}
                                value={venue}
                                onChangeText={setVenue}
                            />
                        </View>

                        {/* Budget / Price Range - Select options */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Budget / Price Range</Text>
                            <View style={styles.priceOptionsRow}>
                                {[
                                    { id: 'under1', label: 'Under ₹1L' },
                                    { id: '1-2', label: '₹1-2 Lakhs' },
                                    { id: '2-5', label: '₹2-5 Lakhs' },
                                    { id: '5+', label: '₹5+ Lakhs' },
                                ].map((opt) => (
                                    <TouchableOpacity
                                        key={opt.id}
                                        style={[
                                            styles.priceChip,
                                            { backgroundColor: theme.inputBackground, borderColor: theme.border },
                                            budget === opt.label && { backgroundColor: colors.primary + '22', borderColor: colors.primary }
                                        ]}
                                        onPress={() => setBudget(budget === opt.label ? '' : opt.label)}
                                    >
                                        <Text style={[
                                            styles.priceChipText,
                                            { color: theme.text },
                                            budget === opt.label && { color: colors.primary, fontWeight: '700' }
                                        ]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput
                                style={[styles.input, { marginTop: 10, backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Or type custom range (e.g., ₹3 Lakhs)"
                                placeholderTextColor={theme.textLight}
                                value={budget}
                                onChangeText={setBudget}
                            />
                        </View>

                        {/* Additional Notes */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.text }]}>Additional Details</Text>
                            <TextInput
                                style={[styles.inputMultiline, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                                placeholder="Specific preferences, requirements, theme ideas..."
                                placeholderTextColor={theme.textLight}
                                multiline
                                numberOfLines={4}
                                value={notes}
                                onChangeText={setNotes}
                            />
                        </View>

                        {/* Info Box */}
                        <View style={[styles.infoBox, { backgroundColor: isDarkMode ? '#1a2733' : '#FFF3E0' }]}>
                            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                            <Text style={[styles.infoText, { color: isDarkMode ? '#FFB74D' : '#E65100' }]}>
                                Our team will contact you within 24 hours with personalized quotes. No upfront charges.
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Button 
                            title={loading ? "Submitting..." : "Get Quotes"} 
                            onPress={handleSubmit} 
                            loading={loading}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        paddingTop: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 8,
    },
    scrollBody: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    roleContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 10,
    },
    roleOptions: {
        flexDirection: 'row',
        gap: 12,
    },
    priceOptionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    priceChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    priceChipText: {
        fontSize: 13,
        fontWeight: '500',
    },
    roleChip: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    roleText: {
        fontSize: 15,
    },
    field: {
        marginBottom: 20,
    },
    input: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        fontSize: 15,
    },
    inputMultiline: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        fontSize: 15,
        textAlignVertical: 'top',
        minHeight: 100,
    },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 10,
    },
    dateText: {
        fontSize: 15,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 19,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 30 : 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.1)',
    },
});
