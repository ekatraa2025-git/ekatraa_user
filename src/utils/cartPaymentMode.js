import { computeAdvanceInrFromBase } from './bookingProtection';

export function lineRequiresFullPayment(item) {
    const opt =
        item?.options && typeof item.options === 'object' && !Array.isArray(item.options)
            ? item.options
            : {};
    if (opt.line_kind === 'e_invite' || opt.user_e_invite_id != null) return true;
    const svc = item?.service;
    if (svc && svc.is_special_catalog === true) return true;
    return false;
}

export function cartRequiresFullPayment(items) {
    return Array.isArray(items) && items.some(lineRequiresFullPayment);
}

/**
 * INR to charge online: full grand total if cart has e-invite / special-catalog lines, else 20% advance.
 */
export function computeOnlineChargeInr(cartSubtotalInr, protectionInr, fullPayment, advancePercent = 20) {
    if (fullPayment) {
        return Math.max(1, Math.round(Number(cartSubtotalInr || 0) + Number(protectionInr || 0)));
    }
    return Math.max(1, computeAdvanceInrFromBase(cartSubtotalInr, protectionInr, advancePercent));
}
