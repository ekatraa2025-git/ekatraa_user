/**
 * Mirrors backend `booking-protection` pricing rules for checkout UI.
 */

export function computeProtectionAmountInr(cartSubtotalInr, settings, userWantsProtection) {
    if (!userWantsProtection || !settings) return 0;
    const mode = settings.booking_protection_mode || 'none';
    if (mode === 'none') return 0;
    if (mode === 'fixed') {
        return Math.max(0, Math.round(Number(settings.booking_protection_fixed_inr || 0)));
    }
    if (mode === 'percent') {
        const p = Number(settings.booking_protection_percent || 0);
        return Math.round((cartSubtotalInr * p) / 100);
    }
    return 0;
}

export function computeAdvanceInrFromBase(cartSubtotalInr, protectionInr, advancePercent = 20) {
    const base = cartSubtotalInr + protectionInr;
    return Math.round((base * advancePercent) / 100);
}
