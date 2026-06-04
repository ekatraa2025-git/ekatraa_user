/**
 * Ekatraa planning agent may append:
 * CART_ACTIONS:{"items":[{"service_id":"uuid","quantity":1,"label":"...","unit_price_inr":12000,"category":"Decor","recommended":true}]}
 * (from tool-grounded service IDs). Strip from display; parse for in-app selectable "Add to cart".
 */

const CART_LINE = /(?:^|\n)CART_ACTIONS:(\{[\s\S]*\})\s*$/m;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @returns {{ display: string, items: { service_id: string, quantity: number, label?: string }[] }}
 */
export function splitCartActions(fullText) {
    const t = String(fullText ?? '');
    const m = t.match(CART_LINE);
    if (!m) {
        return { display: t.trim(), items: [] };
    }
    let items = [];
    try {
        const j = JSON.parse(m[1]);
        if (j && Array.isArray(j.items)) {
            for (const row of j.items) {
                const sid = row && typeof row.service_id === 'string' ? row.service_id.trim() : '';
                if (!UUID_RE.test(sid)) continue;
                const q = Math.min(100, Math.max(1, Math.floor(Number(row.quantity)) || 1));
                const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null;
                const priceRaw = Number(row.unit_price_inr);
                const unitPriceInr = Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) : null;
                const category = typeof row.category === 'string' && row.category.trim() ? row.category.trim() : null;
                const recommended = row.recommended === true;
                items.push({
                    service_id: sid,
                    quantity: q,
                    ...(label ? { label } : {}),
                    ...(unitPriceInr != null ? { unitPriceInr } : {}),
                    ...(category ? { category } : {}),
                    recommended,
                });
            }
        }
    } catch {
        /* ignore */
    }
    const display = t.replace(CART_LINE, '').trim();
    return { display, items };
}
