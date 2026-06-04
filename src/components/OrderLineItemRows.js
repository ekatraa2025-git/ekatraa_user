import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getLineItemParts, tierIndexFromOptions, TIER_ACCENT_COLORS } from '../utils/lineItemDisplay';
import { colors } from '../theme/colors';

/**
 * Rich line item block for order summary & order detail (category, occasion, tier, variety, pricing).
 * @param {object} props
 * @param {object} props.item - cart or order line
 * @param {object} props.theme
 * @param {(k: string) => string} props.tr
 */
export default function OrderLineItemRows({ item, theme, tr }) {
    const parts = getLineItemParts(item);
    const accentIdx = tierIndexFromOptions(item.options || {});
    const accent =
        accentIdx >= 0 ? TIER_ACCENT_COLORS[accentIdx % TIER_ACCENT_COLORS.length] : colors.primary;
    const tierLine = [parts.tierName, parts.qtyLabel].filter(Boolean).join(' · ');
    const qty = Number(item.quantity) || 1;
    const unit = parts.unitPrice != null && Number.isFinite(parts.unitPrice) ? parts.unitPrice : Number(item.unit_price) || 0;
    const lineTotal = unit * qty;
    const unitLabel = item?.price_unit || item?.unit || parts?.priceUnit || null;

    return (
        <View style={[styles.wrap, { borderLeftColor: accent }]}>
            {parts.categoryName ? (
                <Text style={[styles.cat, { color: theme.textLight }]}>
                    {tr('line_item_category')}: {parts.categoryName}
                </Text>
            ) : null}
            {parts.occasion ? (
                <Text style={[styles.occ, { color: theme.textLight }]}>
                    {tr('line_item_occasion')}: {parts.occasion}
                </Text>
            ) : null}
            {parts.serviceName ? (
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={3}>
                    {parts.serviceName}
                </Text>
            ) : null}
            {tierLine ? (
                <Text style={[styles.tier, { color: accent }]}>
                    {tr('line_item_tier_pricing')}: {tierLine}
                </Text>
            ) : null}
            {parts.subVariety ? (
                <Text style={[styles.sub, { color: theme.textLight }]}>
                    {tr('line_item_variety')}: {parts.subVariety}
                </Text>
            ) : null}
            <View style={styles.priceRow}>
                <Text style={[styles.meta, { color: theme.textLight }]}>
                    {tr('line_item_unit')}: ₹{unit.toLocaleString('en-IN')} × {qty}
                </Text>
                <Text style={[styles.total, { color: theme.text }]}>
                    ₹{lineTotal.toLocaleString('en-IN')}
                </Text>
            </View>
            {unitLabel ? (
                <Text style={[styles.meta, { color: theme.textLight, marginTop: 2 }]}>
                    Unit detail: {String(unitLabel)}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        borderLeftWidth: 4,
        paddingLeft: 12,
        paddingVertical: 4,
        marginBottom: 14,
    },
    cat: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    occ: { fontSize: 12, marginBottom: 2 },
    name: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    tier: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
    sub: { fontSize: 12, marginBottom: 6, lineHeight: 16 },
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    meta: { fontSize: 13 },
    total: { fontSize: 16, fontWeight: '800' },
});
