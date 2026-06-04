/**
 * Maps order rows to occasion name, role, and contact fields from carts / orders.
 * New flow: event_name = occasion title, event_role = Groom|Bride|Host|Other.
 * Legacy: event_name sometimes stored only as role — treat as role when it matches known roles and event_role is empty.
 */

const ROLE_LABELS = /^(Groom|Bride|Host|Other)$/i;

/**
 * @returns {{
 *   occasionName: string | null,
 *   roleLabel: string | null,
 *   contactName: string | null,
 *   contactMobile: string | null,
 *   contactEmail: string | null,
 * }}
 */
export function getOrderEventContext(order) {
    if (!order || typeof order !== 'object') {
        return {
            occasionName: null,
            roleLabel: null,
            contactName: null,
            contactMobile: null,
            contactEmail: null,
        };
    }
    const er = typeof order.event_role === 'string' ? order.event_role.trim() : '';
    const en = typeof order.event_name === 'string' ? order.event_name.trim() : '';

    let occasionName = null;
    let roleLabel = er || null;

    if (en) {
        if (ROLE_LABELS.test(en) && !er) {
            roleLabel = en;
        } else {
            occasionName = en;
        }
    }

    const contactName = typeof order.contact_name === 'string' ? order.contact_name.trim() || null : null;
    const contactMobile = typeof order.contact_mobile === 'string' ? order.contact_mobile.trim() || null : null;
    const contactEmail = typeof order.contact_email === 'string' ? order.contact_email.trim() || null : null;

    return {
        occasionName,
        roleLabel,
        contactName,
        contactMobile,
        contactEmail,
    };
}

/** Localize known event_role values (Groom, Bride, …) using app locale; pass through unknown values. */
export function localizeEventRole(role, tr) {
    if (role == null || String(role).trim() === '') return null;
    if (typeof tr !== 'function') return String(role).trim();
    const r = String(role).trim().toLowerCase();
    const map = {
        groom: 'home_role_groom',
        bride: 'home_role_bride',
        host: 'home_role_host',
        other: 'home_role_other',
    };
    const key = map[r];
    return key ? tr(key) : String(role).trim();
}

/** @deprecated Use getOrderEventContext for structured fields */
export function getOccasionAndApplicant(order) {
    const ctx = getOrderEventContext(order);
    const applicantParts = [ctx.roleLabel, ctx.contactName, ctx.contactMobile].filter(Boolean);
    return {
        occasionLabel: ctx.occasionName,
        applicantLabel: applicantParts.length ? applicantParts.join(' · ') : null,
    };
}
