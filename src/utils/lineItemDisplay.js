/**
 * Shared helpers for cart / order line items (tier, qty label, sub variety).
 */

export const TIER_KEYS = [
    'price_basic',
    'price_classic_value',
    'price_signature',
    'price_prestige',
    'price_royal',
    'price_imperial',
];

export const TIER_LABELS_ARR = ['Basic', 'Classic Value', 'Signature', 'Prestige', 'Royal', 'Imperial'];

export const TIER_QTY_KEYS = [
    'qty_label_basic',
    'qty_label_classic_value',
    'qty_label_signature',
    'qty_label_prestige',
    'qty_label_royal',
    'qty_label_imperial',
];

export const TIER_SUB_KEYS = [
    'sub_variety_basic',
    'sub_variety_classic_value',
    'sub_variety_signature',
    'sub_variety_prestige',
    'sub_variety_royal',
    'sub_variety_imperial',
];

export const TIER_ACCENT_COLORS = ['#10B981', '#3B82F6', '#FF7A00', '#8B5CF6', '#F59E0B', '#EC4899'];

/**
 * Non-null tier rows for an offerable_services row (for pickers / special catalog).
 */
export function getOfferableTierRows(svc) {
    const out = [];
    if (!svc || typeof svc !== 'object') return out;
    TIER_KEYS.forEach((key, i) => {
        const v = svc[key];
        if (v != null && v !== '') {
            out.push({
                key,
                label: TIER_LABELS_ARR[i],
                value: Number(v),
                qtyLabel: svc[TIER_QTY_KEYS[i]] || null,
                subVariety: svc[TIER_SUB_KEYS[i]] || null,
                color: TIER_ACCENT_COLORS[i],
            });
        }
    });
    return out;
}

const LEGACY = {
    price_basic: 'Basic',
    price_classic_value: 'Classic Value',
    price_signature: 'Signature',
    price_prestige: 'Prestige',
    price_royal: 'Royal',
    price_imperial: 'Imperial',
    basic: 'Basic',
    classic: 'Classic Value',
    signature: 'Signature',
    prestige: 'Prestige',
    royal: 'Royal',
    imperial: 'Imperial',
};

function normalizeOptions(options) {
    if (options == null) return {};
    if (typeof options === 'object' && !Array.isArray(options)) return options;
    return {};
}

export function tierIndexFromOptions(options) {
    const opt = normalizeOptions(options);
    const tier = opt.tier || opt.tier_key || opt.selected_tier || opt.pricing_tier;
    if (!tier) return -1;
    let idx = TIER_KEYS.indexOf(tier);
    if (idx >= 0) return idx;
    const s = String(tier);
    idx = TIER_KEYS.indexOf(s.startsWith('price_') ? s : `price_${s}`);
    return idx;
}

export function getTierLabel(options) {
    const opt = normalizeOptions(options);
    const tier = opt.tier || opt.tier_key || opt.selected_tier || opt.pricing_tier;
    if (!tier) return null;
    if (LEGACY[tier]) return LEGACY[tier];
    const idx = tierIndexFromOptions(opt);
    if (idx >= 0) return TIER_LABELS_ARR[idx];
    const normalized = String(tier).replace(/^price_/, '');
    return LEGACY[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * @param {object} item cart or order line (may have service relation)
 */
export function getLineItemParts(item) {
    if (!item || typeof item !== 'object') {
        return {
            categoryName: null,
            serviceName: null,
            tierName: null,
            qtyLabel: null,
            subVariety: null,
            occasion: null,
            unitPrice: null,
            quantity: null,
        };
    }
    const opt = normalizeOptions(item.options);
    const rawSvc = item.service ?? item.offerable_services;
    const svc =
        rawSvc && typeof rawSvc === 'object' && !Array.isArray(rawSvc) ? rawSvc : {};
    const categoryName =
        svc.categories?.name ||
        svc.category?.name ||
        (typeof opt.category === 'string' ? opt.category : null) ||
        null;
    const serviceName = svc.name || item.name || null;
    const idx = tierIndexFromOptions(opt);
    const tierName =
        getTierLabel(opt) ||
        (typeof opt.tier_label === 'string' ? opt.tier_label : null) ||
        (typeof opt.tierName === 'string' ? opt.tierName : null) ||
        (typeof item.tier_label === 'string' ? item.tier_label : null) ||
        (typeof item.tier_name === 'string' ? item.tier_name : null) ||
        null;
    const qtyLabel =
        opt.qty_label ||
        opt.qtyLabel ||
        (typeof item.qty_label === 'string' ? item.qty_label : null) ||
        (idx >= 0 ? svc[TIER_QTY_KEYS[idx]] : null) ||
        null;
    const subVariety =
        opt.sub_variety ||
        opt.subVariety ||
        (typeof item.sub_variety === 'string' ? item.sub_variety : null) ||
        (idx >= 0 ? svc[TIER_SUB_KEYS[idx]] : null) ||
        null;
    const occasion =
        typeof opt.occasion === 'string' && opt.occasion.trim() ? opt.occasion.trim() : null;
    const unitRaw = item.unit_price;
    const unitPrice =
        unitRaw != null && unitRaw !== '' && Number.isFinite(Number(unitRaw)) ? Number(unitRaw) : null;
    const quantity =
        item.quantity != null && item.quantity !== '' && Number.isFinite(Number(item.quantity))
            ? Number(item.quantity)
            : null;
    return {
        categoryName,
        serviceName,
        tierName,
        qtyLabel,
        subVariety,
        occasion,
        unitPrice,
        quantity,
    };
}
