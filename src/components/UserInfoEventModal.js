import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { PLANNED_BUDGET_CHIPS } from '../utils/plannedBudgetChips';

const STEPS = 4;
const WINDOW_H = Dimensions.get('window').height;
/** Top inset so the sheet starts slightly above vertical center; height fills to bottom. */
const SHEET_TOP = Math.round(WINDOW_H * 0.38);

function formatBudgetInrLabel(inr) {
    if (!Number.isFinite(inr) || inr < 0) return '';
    if (inr === 0) return '₹0';
    const lakhs = inr / 100000;
    if (lakhs >= 100) {
        const cr = lakhs / 100;
        const s = cr >= 10 ? cr.toFixed(1) : cr.toFixed(2);
        return `₹${s.replace(/\.?0+$/, '')} Cr`;
    }
    const s = lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2);
    return `₹${s.replace(/\.?0+$/, '')} Lakhs`;
}

/**
 * Multi-step user info wizard for occasion flow. Uses parent `form` / `setForm` and budget state.
 */
export default function UserInfoEventModal({
    visible,
    onClose,
    onSkip,
    onSubmit,
    onStepValidationError,
    form,
    setForm,
    plannedBudgetInr,
    setPlannedBudgetInr,
    occasionName,
    isWeddingOccasion = false,
    tr,
    theme,
    isDarkMode,
    formSubmitting,
    minBudgetInr,
    maxBudgetInr,
    onPressMap,
    onPressCurrentLocation,
    eventLocLoading,
    showDatePicker,
    setShowDatePicker,
}) {
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (visible) setStep(0);
    }, [visible]);

    const validateStep = useCallback(
        (s) => {
            if (s === 0) {
                if (!form.contact_name?.trim()) {
                    return tr('userinfo_err_name');
                }
                if (!form.contact_mobile?.trim()) {
                    return tr('userinfo_err_phone');
                }
                const d = form.contact_mobile.replace(/\D/g, '');
                if (d.length < 10) {
                    return tr('userinfo_err_phone_len');
                }
            }
            if (s === 1) {
                if (form.contact_email?.trim()) {
                    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim());
                    if (!ok) return tr('userinfo_err_email');
                }
                if (form.guest_count?.trim()) {
                    const n = parseInt(form.guest_count, 10);
                    if (!Number.isFinite(n) || n < 0) return tr('userinfo_err_guests');
                }
            }
            if (s === 2) {
                if (!form.location_kind?.trim()) {
                    return tr('userinfo_err_location_kind');
                }
                if (!form.location_preference?.trim()) {
                    return tr('userinfo_err_location_pick');
                }
                if (form.location_kind === 'venue' && form.venue_detail?.trim()) {
                    /* optional */
                }
            }
            return null;
        },
        [form, tr]
    );

    const goNext = useCallback(() => {
        const err = validateStep(step);
        if (err) {
            onStepValidationError?.(err);
            return;
        }
        if (step < STEPS - 1) setStep((x) => x + 1);
    }, [step, validateStep, onStepValidationError]);

    const goBack = () => {
        if (step > 0) setStep((x) => x - 1);
        else onClose();
    };

    const chipActive = (inr) => Number.isFinite(plannedBudgetInr) && Number.isFinite(inr) && plannedBudgetInr === inr;

    const submitAll = () => {
        for (let s = 0; s < STEPS - 1; s++) {
            const err = validateStep(s);
            if (err) {
                setStep(s);
                onStepValidationError?.(err);
                return;
            }
        }
        if (!Number.isFinite(plannedBudgetInr) || plannedBudgetInr < minBudgetInr || plannedBudgetInr > maxBudgetInr) {
            setStep(STEPS - 1);
            onStepValidationError?.(tr('userinfo_err_budget'));
            return;
        }
        onSubmit?.();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.sheetShell}>
                    <SafeAreaView style={[styles.sheet, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
                        <View style={[styles.header, { borderBottomColor: theme.border }]}>
                            <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                                <Ionicons name={step > 0 ? 'chevron-back' : 'close'} size={26} color={theme.text} />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                                    {tr('home_form_title')}
                                </Text>
                                <Text style={[styles.headerSub, { color: theme.textLight }]}>
                                    {String(tr('userinfo_step_progress'))
                                        .replace('{current}', String(step + 1))
                                        .replace('{total}', String(STEPS))}
                                </Text>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>

                        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
                            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                                <Text style={[styles.help, { color: theme.textLight }]}>
                                    {tr('home_form_help')} {occasionName || tr('home_your_occasion')}
                                </Text>

                                {step === 0 && (
                                    <>
                                        <Text style={[styles.stepTitle, { color: theme.text }]}>{tr('userinfo_step_contact')}</Text>
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_i_am')}</Text>
                                        <View style={styles.roleRow}>
                                            {[
                                                ...(isWeddingOccasion
                                                    ? [
                                                          { key: 'Groom', label: tr('home_role_groom') },
                                                          { key: 'Bride', label: tr('home_role_bride') },
                                                      ]
                                                    : []),
                                                { key: 'Host', label: tr('home_role_host') },
                                                { key: 'Other', label: tr('home_role_other') },
                                            ].map(({ key: role, label: roleLabel }) => (
                                                <TouchableOpacity
                                                    key={role}
                                                    style={[
                                                        styles.roleChip,
                                                        { backgroundColor: isDarkMode ? '#252840' : '#FFF', borderColor: theme.border },
                                                        form.role === role && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}
                                                    onPress={() => setForm((p) => ({ ...p, role }))}
                                                >
                                                    <Text style={[styles.roleText, { color: theme.text }, form.role === role && { color: '#FFF', fontWeight: '700' }]}>
                                                        {roleLabel}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_name')}</Text>
                                        <View style={[styles.inputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                            <TextInput
                                                style={[styles.inputLg, { color: theme.text }]}
                                                placeholder={tr('userinfo_ph_name')}
                                                placeholderTextColor={theme.textLight}
                                                value={form.contact_name}
                                                onChangeText={(t) => setForm((p) => ({ ...p, contact_name: t }))}
                                            />
                                        </View>
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_phone')}</Text>
                                        <View style={[styles.inputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                            <TextInput
                                                style={[styles.inputLg, { color: theme.text }]}
                                                placeholder={tr('userinfo_ph_phone')}
                                                placeholderTextColor={theme.textLight}
                                                value={form.contact_mobile}
                                                onChangeText={(t) => setForm((p) => ({ ...p, contact_mobile: t }))}
                                                keyboardType="phone-pad"
                                            />
                                        </View>
                                    </>
                                )}

                                {step === 1 && (
                                    <>
                                        <Text style={[styles.stepTitle, { color: theme.text }]}>{tr('userinfo_step_event')}</Text>
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_email')}</Text>
                                        <View style={[styles.inputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                            <TextInput
                                                style={[styles.inputLg, { color: theme.text }]}
                                                placeholder={tr('userinfo_ph_email')}
                                                placeholderTextColor={theme.textLight}
                                                value={form.contact_email}
                                                onChangeText={(t) => setForm((p) => ({ ...p, contact_email: t }))}
                                                keyboardType="email-address"
                                            />
                                        </View>
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_event_date')}</Text>
                                        <TouchableOpacity
                                            style={[styles.inputWrap, styles.dateBtn, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                            <Text style={[styles.dateTextLg, { color: form.event_date ? theme.text : theme.textLight }]}>
                                                {form.event_date
                                                    ? new Date(form.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : tr('home_select_date')}
                                            </Text>
                                        </TouchableOpacity>
                                        {showDatePicker ? (
                                            <DateTimePicker
                                                value={form.event_date ? new Date(form.event_date) : new Date()}
                                                mode="date"
                                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                minimumDate={new Date()}
                                                onChange={(e, d) => {
                                                    setShowDatePicker(false);
                                                    if (d) setForm((p) => ({ ...p, event_date: d.toISOString() }));
                                                }}
                                            />
                                        ) : null}
                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_guest_count')}</Text>
                                        <View style={[styles.inputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                            <TextInput
                                                style={[styles.inputLg, { color: theme.text }]}
                                                placeholder={tr('userinfo_ph_guests')}
                                                placeholderTextColor={theme.textLight}
                                                value={form.guest_count}
                                                onChangeText={(t) => setForm((p) => ({ ...p, guest_count: t }))}
                                                keyboardType="number-pad"
                                            />
                                        </View>
                                    </>
                                )}

                                {step === 2 && (
                                    <>
                                        <Text style={[styles.stepTitle, { color: theme.text }]}>{tr('userinfo_step_location')}</Text>
                                        <Text style={[styles.formHint, { color: theme.textLight }]}>{tr('home_event_location_hint')}</Text>
                                        <View style={styles.roleRow}>
                                            {[
                                                { key: 'own_place', label: tr('home_own_place') },
                                                { key: 'venue', label: tr('home_venue') },
                                            ].map((opt) => (
                                                <TouchableOpacity
                                                    key={opt.key}
                                                    style={[
                                                        styles.roleChip,
                                                        { backgroundColor: isDarkMode ? '#252840' : '#FFF', borderColor: theme.border },
                                                        form.location_kind === opt.key && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}
                                                    onPress={() => setForm((p) => ({ ...p, location_kind: opt.key }))}
                                                >
                                                    <Text style={[styles.roleText, { color: theme.text }, form.location_kind === opt.key && { color: '#FFF', fontWeight: '700' }]}>
                                                        {opt.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        {form.location_kind ? (
                                            <>
                                                <View style={styles.locActionRow}>
                                                    <TouchableOpacity
                                                        style={[styles.locActionBtn, { borderColor: theme.border, backgroundColor: isDarkMode ? '#1F2333' : '#FFF' }]}
                                                        onPress={onPressCurrentLocation}
                                                        disabled={eventLocLoading}
                                                    >
                                                        {eventLocLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="navigate" size={20} color={colors.primary} />}
                                                        <Text style={[styles.locActionTextLg, { color: theme.text }]}>{tr('home_use_current_location')}</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.locActionBtn, { borderColor: theme.border, backgroundColor: isDarkMode ? '#1F2333' : '#FFF' }]}
                                                        onPress={onPressMap}
                                                    >
                                                        <Ionicons name="map" size={20} color={colors.primary} />
                                                        <Text style={[styles.locActionTextLg, { color: theme.text }]}>{tr('home_select_on_map')}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {form.location_preference ? (
                                                    <View style={[styles.locPreview, { borderColor: theme.border, backgroundColor: isDarkMode ? '#1A1D27' : '#F9FAFB' }]}>
                                                        <Ionicons name="location" size={18} color={colors.primary} />
                                                        <Text style={[styles.locPreviewText, { color: theme.text }]} numberOfLines={4}>
                                                            {form.location_preference}
                                                        </Text>
                                                    </View>
                                                ) : (
                                                    <Text style={[styles.formHint, { color: theme.textLight }]}>{tr('home_pick_location_hint')}</Text>
                                                )}
                                                {form.location_kind === 'venue' ? (
                                                    <View style={{ marginTop: 12 }}>
                                                        <Text style={[styles.formLabel, { color: theme.textLight }]}>{tr('home_venue_optional')}</Text>
                                                        <View style={[styles.inputWrap, { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: theme.border }]}>
                                                            <TextInput
                                                                style={[styles.inputLg, { color: theme.text }]}
                                                                placeholder={tr('home_venue_ph')}
                                                                placeholderTextColor={theme.textLight}
                                                                value={form.venue_detail}
                                                                onChangeText={(t) => setForm((p) => ({ ...p, venue_detail: t }))}
                                                            />
                                                        </View>
                                                    </View>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </>
                                )}

                                {step === 3 && (
                                    <>
                                        <Text style={[styles.stepTitle, { color: theme.text }]}>{tr('userinfo_step_budget')}</Text>
                                        <Text style={[styles.formHint, { color: theme.textLight }]}>{tr('home_budget_slider_hint')}</Text>
                                        <Text style={[styles.budgetValue, { color: colors.primary }]}>
                                            {formatBudgetInrLabel(plannedBudgetInr)} (₹{Math.round(plannedBudgetInr).toLocaleString()})
                                        </Text>
                                        <Slider
                                            style={styles.slider}
                                            minimumValue={minBudgetInr}
                                            maximumValue={maxBudgetInr}
                                            value={Math.max(minBudgetInr, Math.min(maxBudgetInr, plannedBudgetInr))}
                                            onValueChange={(v) => setPlannedBudgetInr(Math.round(v))}
                                            onSlidingComplete={(v) => {
                                                const x = Math.round(v);
                                                setPlannedBudgetInr(x);
                                                setForm((p) => ({ ...p, planned_budget: formatBudgetInrLabel(x) }));
                                            }}
                                            minimumTrackTintColor={colors.primary}
                                            maximumTrackTintColor={theme.border}
                                            thumbTintColor={colors.primary}
                                        />
                                        <View style={styles.budgetGrid}>
                                            {PLANNED_BUDGET_CHIPS.map(({ slug, inr }) => (
                                                <TouchableOpacity
                                                    key={slug}
                                                    style={[
                                                        styles.budgetChip,
                                                        { backgroundColor: isDarkMode ? '#252840' : '#FFF', borderColor: theme.border },
                                                        chipActive(inr) && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}
                                                    onPress={() => {
                                                        setPlannedBudgetInr(inr);
                                                        setForm((p) => ({ ...p, planned_budget: formatBudgetInrLabel(inr) }));
                                                    }}
                                                >
                                                    <Text style={[styles.budgetChipText, { color: theme.text }, chipActive(inr) && { color: '#FFF', fontWeight: '700' }]}>
                                                        {tr(`budget_chip_${slug}`)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </>
                                )}

                                <View style={styles.actions}>
                                    {step < STEPS - 1 ? (
                                        <TouchableOpacity
                                            style={[styles.primaryBtn]}
                                            onPress={goNext}
                                            activeOpacity={0.85}
                                        >
                                            <LinearGradient colors={[colors.primary, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryGrad}>
                                                <Text style={styles.primaryBtnText}>{tr('userinfo_next')}</Text>
                                                <Ionicons name="arrow-forward" size={20} color="#FFF" />
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={styles.primaryBtn} onPress={submitAll} activeOpacity={0.85} disabled={formSubmitting}>
                                            <LinearGradient colors={[colors.primary, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryGrad}>
                                                {formSubmitting && <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />}
                                                <Text style={styles.primaryBtnText}>{tr('home_continue')}</Text>
                                                <Ionicons name="arrow-forward" size={20} color="#FFF" />
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={[styles.skipBtn, { borderColor: theme.border }]} onPress={onSkip} activeOpacity={0.8}>
                                        <Text style={[styles.skipText, { color: theme.text }]}>{tr('home_skip_browse')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </KeyboardAvoidingView>
                    </SafeAreaView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheetShell: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: SHEET_TOP,
        bottom: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    sheet: {
        flex: 1,
        width: '100%',
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1 },
    headerBtn: { padding: 8, width: 44 },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 14, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: 52 },
    help: { fontSize: 16, lineHeight: 22, marginBottom: 16 },
    stepTitle: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
    formLabel: { fontSize: 16, fontWeight: '700', marginBottom: 8, marginTop: 10 },
    formHint: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
    roleChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5 },
    roleText: { fontSize: 16, fontWeight: '600' },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, minHeight: 52 },
    inputLg: { flex: 1, fontSize: 18, paddingVertical: 12 },
    dateBtn: { gap: 10 },
    dateTextLg: { fontSize: 18, flex: 1 },
    locActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    locActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5 },
    locActionTextLg: { fontSize: 16, fontWeight: '600', flex: 1 },
    locPreview: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 10 },
    locPreviewText: { flex: 1, fontSize: 16, lineHeight: 22 },
    budgetValue: { fontSize: 20, fontWeight: '800', marginVertical: 10 },
    slider: { width: '100%', height: 44, marginVertical: 8 },
    budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
    budgetChip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5 },
    budgetChipText: { fontSize: 15, fontWeight: '600' },
    actions: { marginTop: 22, gap: 12, paddingBottom: 12 },
    primaryBtn: { borderRadius: 16, overflow: 'hidden' },
    primaryGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
    primaryBtnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    skipBtn: { paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
    skipText: { fontSize: 16, fontWeight: '700' },
});
