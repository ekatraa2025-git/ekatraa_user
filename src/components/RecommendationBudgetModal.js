import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Pressable,
    Modal,
    ActivityIndicator,
    Share,
    StyleSheet,
    Dimensions,
    Switch,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { sanitizeAiDisplayText } from '../utils/sanitizeAiDisplayText';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MIN_BUDGET_INR = 0;
const MAX_BUDGET_INR = 20000000;
const USE_AGENTIC_PLANNING_BRAIN = String(process.env.EXPO_PUBLIC_AI_PLANNING || '') === '1';

function parseMastraBudgetNarrative(replyText) {
    const raw = String(replyText || '').trim();
    if (!raw) return null;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && typeof parsed === 'object') {
                return {
                    intro: String(parsed.intro || '').trim() || raw,
                    tips: Array.isArray(parsed.tips) ? parsed.tips.map((x) => String(x)).slice(0, 6) : [],
                    planning_reminders: Array.isArray(parsed.planning_reminders)
                        ? parsed.planning_reminders.map((x) => String(x)).slice(0, 6)
                        : [],
                    disclaimer: String(parsed.disclaimer || 'AI suggestions are guidance, not final quotations.').trim(),
                };
            }
        } catch (_) {
            // fall through to line parsing
        }
    }
    const lines = raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    const intro = lines[0] || raw;
    const bullets = lines
        .slice(1)
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
    return {
        intro,
        tips: bullets.slice(0, 4),
        planning_reminders: bullets.slice(4, 8),
        disclaimer: 'AI suggestions are guidance, not final quotations.',
    };
}

/** API may send DECIMAL as string; always normalize for display and cart. */
function numPrice(v) {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function formatRupees(n) {
    const x = numPrice(n);
    if (x == null) return '';
    return `₹${Math.round(x).toLocaleString('en-IN')}`;
}

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

function rebalanceCategoryPercents(catId, newPct, allIds, current) {
    const clamped = Math.max(0, Math.min(100, newPct));
    const rest = allIds.filter((id) => id !== catId);
    const o = {};
    if (rest.length === 0) {
        o[catId] = 100;
        return o;
    }
    const oldSum = rest.reduce((s, id) => s + (current[id] ?? 0), 0);
    const remaining = 100 - clamped;
    o[catId] = clamped;
    if (oldSum <= 0) {
        const eq = remaining / rest.length;
        rest.forEach((id) => {
            o[id] = eq;
        });
        return o;
    }
    rest.forEach((id) => {
        o[id] = ((current[id] ?? 0) / oldSum) * remaining;
    });
    return o;
}

function defaultTierForService(svc) {
    const tiers = svc.tiers || [];
    const fit = tiers.find((t) => t.fits_allocation && numPrice(t.price) != null);
    if (fit) {
        const p = numPrice(fit.price);
        return { tierKey: fit.key, price: p ?? 0 };
    }
    const any = tiers.find((t) => numPrice(t.price) != null);
    if (any) {
        const p = numPrice(any.price);
        return { tierKey: any.key, price: p ?? 0 };
    }
    return { tierKey: 'price_basic', price: 0 };
}

export default function RecommendationBudgetModal({
    visible,
    onClose,
    theme,
    colors,
    city,
    occasionId,
    occasionName,
    data,
    setData,
    fetchRecommendationPage,
    cartId,
    setCartId,
    isAuthenticated,
    user,
    navigation,
    refreshCartCount,
    formSnapshot,
}) {
    const { isDarkMode } = useTheme();
    const { showToast } = useToast();
    const { session } = useAuth();
    const { cartOwnerAnonSession } = useCart();
    const insets = useSafeAreaInsets();
    const sheetTop = Math.max(insets.top, 12);
    const [modalBudgetInr, setModalBudgetInr] = useState(MIN_BUDGET_INR);
    const [categoryEdits, setCategoryEdits] = useState(null);
    const [narrative, setNarrative] = useState(null);
    const [narrativeAiMeta, setNarrativeAiMeta] = useState(null);
    const [narrativeLoading, setNarrativeLoading] = useState(false);
    const [narrativeError, setNarrativeError] = useState(null);
    const [selected, setSelected] = useState(() => new Map());
    const [savingSnapshot, setSavingSnapshot] = useState(false);
    const [addingCart, setAddingCart] = useState(false);
    const [helpOpen, setHelpOpen] = useState(true);
    const [recRefreshLoading, setRecRefreshLoading] = useState(false);
    /** categoryId -> expanded (services visible); initially all collapsed */
    const [expandedRecCats, setExpandedRecCats] = useState({});
    /** categoryId -> included in plan */
    const [includedCats, setIncludedCats] = useState({});
    const debounceRef = useRef(null);
    const prevVisibleRef = useRef(false);

    const runFetch = useCallback(
        async (inr, weights) => {
            setRecRefreshLoading(true);
            try {
                const w =
                    weights && typeof weights === 'object' && Object.keys(weights).length > 0 ? weights : undefined;
                const { data: d, error } = await fetchRecommendationPage(inr, w);
                if (error) {
                    showToast({
                        variant: 'error',
                        title: 'Recommendations',
                        message: error.message || 'Could not update recommendations.',
                    });
                    return;
                }
                if (d) setData(d);
            } finally {
                setRecRefreshLoading(false);
            }
        },
        [fetchRecommendationPage, setData, showToast]
    );

    const scheduleRefetch = useCallback(
        (inr, weights) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                runFetch(inr, weights);
            }, 320);
        },
        [runFetch]
    );

    useEffect(() => {
        const wasOpen = prevVisibleRef.current;
        prevVisibleRef.current = visible;
        if (
            visible &&
            !wasOpen &&
            data &&
            typeof data.total_budget === 'number' &&
            Number.isFinite(data.total_budget)
        ) {
            setModalBudgetInr(Number(data.total_budget));
            setCategoryEdits(null);
            setSelected(new Map());
            setNarrative(null);
            setNarrativeAiMeta(null);
            setNarrativeError(null);
            setExpandedRecCats({});
        }
    }, [visible, data?.total_budget]);

    useEffect(() => {
        const cats = data?.categories;
        if (!cats?.length) return;
        setIncludedCats((prev) => {
            const next = { ...prev };
            cats.forEach((c) => {
                if (next[c.id] === undefined) next[c.id] = true;
            });
            return next;
        });
    }, [data?.categories]);

    useEffect(() => {
        if (!visible || !data?.allocation_summary?.length || !occasionName) return;
        let cancelled = false;
        (async () => {
            setNarrativeLoading(true);
            setNarrativeError(null);
            if (USE_AGENTIC_PLANNING_BRAIN) {
                const compactAlloc = data.allocation_summary
                    .map(
                        (a) =>
                            `${a.name}: ${Math.round(Number(a.percentage) || 0)}% (~₹${Math.round(Number(a.allocated_inr) || 0).toLocaleString('en-IN')})`
                    )
                    .join('; ');
                const prompt = [
                    `Prepare a concise event budget guidance for "${occasionName}".`,
                    `Total budget: ₹${Math.round(Number(data.total_budget) || 0).toLocaleString('en-IN')}.`,
                    city ? `City: ${city}.` : null,
                    formSnapshot?.guest_count ? `Guests: ${String(formSnapshot.guest_count)}.` : null,
                    `Category splits: ${compactAlloc}.`,
                    'Return strict JSON with keys: intro (string), tips (string[]), planning_reminders (string[]), disclaimer (string). Keep it practical and vendor-neutral.',
                ]
                    .filter(Boolean)
                    .join('\n');
                const { data: aiData, error: aiErr } = await api.postAiPlanningMessage({
                    message: prompt,
                    city: city || undefined,
                    occasion_id: occasionId || undefined,
                    occasion_name: occasionName || undefined,
                    planned_budget_inr: Number(data.total_budget) || undefined,
                });
                if (!cancelled && !aiErr && aiData?.reply) {
                    const parsedAi = parseMastraBudgetNarrative(aiData.reply);
                    if (parsedAi) {
                        setNarrative(parsedAi);
                        setNarrativeAiMeta({ source: 'mastra-agentic-ai' });
                        setNarrativeLoading(false);
                        return;
                    }
                }
            }
            const { data: nd, error } = await api.postRecommendationNarrative({
                occasion_name: occasionName,
                budget_inr: Number(data.total_budget),
                guest_band: formSnapshot?.guest_count
                    ? `Approximately ${formSnapshot.guest_count} guests`
                    : null,
                ...(city ? { city } : {}),
                ...(occasionId ? { occasion_id: occasionId } : {}),
                allocation_lines: data.allocation_summary.map((a) => ({
                    category_id: a.category_id,
                    name: a.name,
                    percentage: a.percentage,
                    allocated_inr: a.allocated_inr,
                })),
            });
            if (cancelled) return;
            setNarrativeLoading(false);
            if (error) {
                setNarrative(null);
                setNarrativeAiMeta(null);
                setNarrativeError(error.message || 'Narrative request failed.');
            } else if (nd?.narrative) {
                setNarrative(nd.narrative);
                setNarrativeAiMeta(nd.ai_meta && typeof nd.ai_meta === 'object' ? nd.ai_meta : null);
            } else {
                setNarrative(null);
                setNarrativeAiMeta(null);
                setNarrativeError('Invalid narrative response.');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible, data, occasionName, formSnapshot?.guest_count, city, occasionId]);

    const toggleSelect = (svc, catName) => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(svc.id)) next.delete(svc.id);
            else {
                const d = defaultTierForService(svc);
                next.set(svc.id, {
                    tierKey: d.tierKey,
                    price: d.price,
                    name: svc.name,
                    categoryName: catName,
                });
            }
            return next;
        });
    };

    const setTierForService = (svcId, tierKey, price, name, catName) => {
        const p = numPrice(price) ?? 0;
        setSelected((prev) => {
            const next = new Map(prev);
            if (!next.has(svcId)) return prev;
            next.set(svcId, { tierKey, price: p, name, categoryName: catName });
            return next;
        });
    };

    const buildShareText = () => {
        if (!data) return '';
        let t = `Ekatraa — ${occasionName || 'Event'} budget plan\n`;
        t += `Total budget: ${formatBudgetInrLabel(Number(data.total_budget))} (₹${Number(data.total_budget).toLocaleString('en-IN')})\n\n`;
        (data.categories || []).forEach((c) => {
            t += `${c.name}: ${c.percentage?.toFixed?.(1) ?? c.percentage}% → ₹${Math.round(c.allocated_budget)}\n`;
            (c.services || []).forEach((s) => {
                t += `  • ${s.name}\n`;
            });
            t += '\n';
        });
        if (narrative?.intro) {
            t += `${sanitizeAiDisplayText(narrative.intro)}\n`;
        }
        return t;
    };

    const handleShare = async () => {
        try {
            await Share.share({ message: buildShareText(), title: 'My Ekatraa budget plan' });
        } catch (e) {
            showToast({ variant: 'error', title: 'Share', message: e?.message || 'Could not share.' });
        }
    };

    const handleSaveSnapshot = async () => {
        if (!data || !occasionId) return;
        setSavingSnapshot(true);
        try {
            const catPct = {};
            (data.categories || []).forEach((c) => {
                catPct[c.id] = categoryEdits && categoryEdits[c.id] != null ? categoryEdits[c.id] : c.percentage;
            });
            const { error } = await api.postBudgetRecommendationSnapshot({
                cart_id: cartId || null,
                user_id: isAuthenticated && user?.id ? user.id : null,
                occasion_id: occasionId,
                contact_name: formSnapshot?.contact_name ?? null,
                contact_mobile: formSnapshot?.contact_mobile ?? null,
                contact_email: formSnapshot?.contact_email ?? null,
                form_snapshot: formSnapshot || {},
                budget_inr: Number(data.total_budget),
                category_percentages: catPct,
                recommendation_payload: data,
                ai_narrative: narrative,
                ai_meta:
                    narrative && narrativeAiMeta
                        ? { ...narrativeAiMeta, source: narrativeAiMeta.source || 'claude' }
                        : narrative
                          ? { source: 'claude' }
                          : null,
            });
            if (error) throw new Error(error.message);
            showToast({
                variant: 'success',
                title: 'Saved',
                message: 'Your budget plan was saved. Our team can review it.',
            });
        } catch (e) {
            showToast({ variant: 'error', title: 'Save failed', message: e?.message || 'Unknown error' });
        } finally {
            setSavingSnapshot(false);
        }
    };

    const handleAddToCart = async () => {
        if (selected.size === 0) {
            showToast({ variant: 'info', title: 'Select services', message: 'Choose at least one service and tier.' });
            return;
        }
        setAddingCart(true);
        try {
            let cid = cartId;
            if (!cid) {
                const { data: created, error: cartErr } = await api.createCart({
                    session_id: 'app-' + Date.now(),
                    user_id: isAuthenticated && user?.id ? user.id : null,
                    event_name: occasionName ?? null,
                    event_role: formSnapshot?.role ?? null,
                    contact_name: formSnapshot?.contact_name ?? null,
                    contact_mobile: formSnapshot?.contact_mobile ?? null,
                    contact_email: formSnapshot?.contact_email ?? null,
                    event_date: formSnapshot?.event_date ?? null,
                    guest_count: formSnapshot?.guest_count ?? null,
                    location_preference: formSnapshot?.location_preference ?? null,
                    venue_preference: formSnapshot?.venue_preference ?? null,
                    planned_budget: formSnapshot?.planned_budget ?? formatBudgetInrLabel(Number(data?.total_budget)),
                    planned_budget_inr: Number(data?.total_budget),
                });
                if (cartErr) throw new Error(cartErr.message);
                cid = created?.id;
                if (cid) await setCartId(cid, created.session_id ?? undefined);
            } else {
                const patchOpts = { cartOwnerSession: cartOwnerAnonSession };
                if (isAuthenticated && session?.access_token) patchOpts.accessToken = session.access_token;
                await api.updateCart(cid, {
                    event_name: occasionName ?? null,
                    event_role: formSnapshot?.role ?? null,
                    contact_name: formSnapshot?.contact_name ?? null,
                    contact_mobile: formSnapshot?.contact_mobile ?? null,
                    contact_email: formSnapshot?.contact_email ?? null,
                    event_date: formSnapshot?.event_date ?? null,
                    guest_count: formSnapshot?.guest_count ?? null,
                    location_preference: formSnapshot?.location_preference ?? null,
                    venue_preference: formSnapshot?.venue_preference ?? null,
                    planned_budget: formSnapshot?.planned_budget ?? formatBudgetInrLabel(Number(data?.total_budget)),
                    planned_budget_inr: Number(data?.total_budget),
                }, patchOpts);
            }
            if (!cid) throw new Error('No cart');
            for (const [serviceId, row] of selected) {
                let unitPrice = numPrice(row.price);
                if (unitPrice == null || unitPrice <= 0) {
                    for (const c of data?.categories || []) {
                        const svc = (c.services || []).find((s) => s.id === serviceId);
                        if (!svc) continue;
                        const tier = (svc.tiers || []).find((t) => t.key === row.tierKey);
                        const p = numPrice(tier?.price);
                        if (p != null && p > 0) {
                            unitPrice = p;
                            break;
                        }
                    }
                }
                if (unitPrice == null || unitPrice <= 0) {
                    throw new Error('Missing price for a selected tier. Pick a tier with a price shown.');
                }
                const { error } = await api.addCartItem({
                    cart_id: cid,
                    service_id: serviceId,
                    quantity: 1,
                    unit_price: unitPrice,
                    options: {
                        tier: row.tierKey,
                        occasion: occasionName,
                        category: row.categoryName,
                        role: formSnapshot?.role,
                    },
                });
                if (error) throw new Error(error.message);
            }
            refreshCartCount?.(cid);
            showToast({
                variant: 'success',
                title: 'Added to cart',
                message: `${selected.size} item(s) added.`,
                action: {
                    label: 'View cart',
                    onPress: () => {
                        onClose(false);
                        navigation?.navigate?.('Cart');
                    },
                },
            });
        } catch (e) {
            showToast({ variant: 'error', title: 'Cart', message: e?.message || 'Could not add to cart.' });
        } finally {
            setAddingCart(false);
        }
    };

    const onCategorySliderChange = (catId, value, cats) => {
        const ids = cats.map((c) => c.id);
        const current = {};
        cats.forEach((c) => {
            const p = categoryEdits && categoryEdits[c.id] != null ? categoryEdits[c.id] : c.percentage;
            current[c.id] = p;
        });
        const next = rebalanceCategoryPercents(catId, value, ids, current);
        setCategoryEdits(next);
        scheduleRefetch(modalBudgetInr, next);
    };

    const categories = data?.categories || [];

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalRoot}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose(false)} accessibilityRole="button" />
                <View
                    style={[
                        styles.recModalContent,
                        {
                            backgroundColor: theme.card,
                            top: sheetTop,
                            paddingBottom: Math.max(insets.bottom, 12),
                        },
                    ]}
                >
                    <View style={styles.sheetHeader}>
                        <View style={styles.sheetHeaderTop}>
                            <View style={styles.pickerHandle} />
                            <TouchableOpacity
                                style={[styles.recCloseBtn, { backgroundColor: isDarkMode ? '#1F2333' : '#F3F4F6' }]}
                                onPress={() => onClose(false)}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                accessibilityRole="button"
                                accessibilityLabel="Close budget planner"
                            >
                                <Ionicons name="close-circle" size={30} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.pickerTitle, { color: theme.text }]}>
                            Plan your event budget{occasionName ? ` — ${occasionName}` : ''}
                        </Text>
                        <Text style={[styles.heroSub, { color: theme.textLight }]}>
                            Split your total across categories, pick tiers that fit each slice, then add to cart or save for
                            later. Allocations exclude gold and apparel where noted in the catalog.
                        </Text>
                    </View>

                    <ScrollView
                        style={styles.recModalScroll}
                        contentContainerStyle={styles.recModalScrollContent}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                        bounces
                    >
                        {narrativeLoading && (
                            <View style={[styles.narrativeLoadingCard, { borderColor: theme.border }]}>
                                <ActivityIndicator color={colors.primary} />
                                <Text style={[styles.narrativeLoadingText, { color: theme.textLight }]}>
                                    Shaping your personalised budget story…
                                </Text>
                            </View>
                        )}
                        {narrativeError ? <Text style={styles.errText}>{String(narrativeError)}</Text> : null}
                        {narrative ? (
                            <LinearGradient
                                colors={[
                                    isDarkMode ? '#1e1b4b' : '#FFF7ED',
                                    isDarkMode ? '#312e81' + 'cc' : '#FFEDD5',
                                    theme.card,
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.narrativeHero, { borderColor: colors.primary + '66' }]}
                            >
                                <View style={styles.narrativeHeroAccent} />
                                <View style={styles.narrativeBadgeRow}>
                                    <LinearGradient
                                        colors={[colors.primary, colors.secondary || '#F97316']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.narrativeBadgeGrad}
                                    >
                                        <Ionicons name="sparkles" size={16} color="#FFF" />
                                        <Text style={styles.narrativeBadgeText}>AI plan insight</Text>
                                    </LinearGradient>
                                </View>
                                <Text style={[styles.narrativeIntro, { color: theme.text }]}>
                                    {sanitizeAiDisplayText(narrative.intro)}
                                </Text>
                                {(narrative.tips || []).length > 0 && (
                                    <View style={styles.narrativeTipsGrid}>
                                        {(narrative.tips || []).map((tip, i) => (
                                            <View
                                                key={i}
                                                style={[
                                                    styles.narrativeTipPill,
                                                    { backgroundColor: isDarkMode ? '#1F2333' : '#FFF', borderColor: colors.primary + '33' },
                                                ]}
                                            >
                                                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                                                <Text style={[styles.narrativeTipText, { color: theme.text }]}>
                                                    {sanitizeAiDisplayText(tip)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                {(narrative.planning_reminders || []).length > 0 && (
                                    <View style={[styles.narrativeRemindBox, { backgroundColor: isDarkMode ? '#0f172a88' : '#FFF8F0' }]}>
                                        {(narrative.planning_reminders || []).map((tip, i) => (
                                            <Text key={`p-${i}`} style={[styles.narrativeRemindLine, { color: theme.textLight }]}>
                                                → {sanitizeAiDisplayText(tip)}
                                            </Text>
                                        ))}
                                    </View>
                                )}
                                <Text style={[styles.nDisclaimer, { color: theme.textLight }]}>
                                    {sanitizeAiDisplayText(narrative.disclaimer)}
                                </Text>
                            </LinearGradient>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.helpToggle, { borderColor: theme.border }]}
                            onPress={() => setHelpOpen(!helpOpen)}
                        >
                            <Text style={[styles.helpToggleText, { color: colors.primary }]}>
                                How this works &amp; tips {helpOpen ? '▲' : '▼'}
                            </Text>
                        </TouchableOpacity>
                        {helpOpen && (
                            <View style={[styles.helpBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
                                <Text style={[styles.helpBody, { color: theme.textLight }]}>
                                    Use the budget slider to set your overall spend. Category sliders adjust how much of
                                    that total goes to each area; other categories rebalance automatically to stay at
                                    100%. Pick a pricing tier per service; tiers marked as fitting stay within that
                                    category&apos;s slice. Expand each category to review services — use the switch to
                                    include or skip a whole category.
                                </Text>
                            </View>
                        )}

                        <Text style={[styles.sliderLabel, { color: theme.text }]}>Total budget</Text>
                        <Text style={[styles.sliderValue, { color: colors.primary }]}>
                            {formatBudgetInrLabel(modalBudgetInr)} (₹{Math.round(modalBudgetInr).toLocaleString('en-IN')})
                        </Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={MIN_BUDGET_INR}
                            maximumValue={MAX_BUDGET_INR}
                            value={modalBudgetInr}
                            onValueChange={(v) => {
                                const inr = Math.round(v);
                                setModalBudgetInr(inr);
                                scheduleRefetch(inr, categoryEdits);
                            }}
                            onSlidingComplete={(v) => {
                                if (debounceRef.current) clearTimeout(debounceRef.current);
                                const inr = Math.round(v);
                                setModalBudgetInr(inr);
                                runFetch(inr, categoryEdits);
                            }}
                            minimumTrackTintColor={colors.primary}
                            maximumTrackTintColor={theme.border}
                            thumbTintColor={colors.primary}
                        />

                        {categories.map((cat) => {
                            const allocated = cat.allocated_budget || 0;
                            const current = {};
                            categories.forEach((c) => {
                                current[c.id] =
                                    categoryEdits && categoryEdits[c.id] != null ? categoryEdits[c.id] : c.percentage;
                            });
                            const pctVal = current[cat.id] ?? cat.percentage;
                            const expanded = expandedRecCats[cat.id] === true;
                            const included = includedCats[cat.id] !== false;
                            return (
                                <View
                                    key={cat.id}
                                    style={[
                                        styles.recCatBlock,
                                        { borderColor: theme.border, opacity: included ? 1 : 0.5 },
                                    ]}
                                >
                                    <View style={styles.catHeaderMainRow}>
                                        <TouchableOpacity
                                            style={styles.catExpandHit}
                                            onPress={() => {
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setExpandedRecCats((p) => ({ ...p, [cat.id]: !expanded }));
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={expanded ? 'chevron-down' : 'chevron-forward'}
                                                size={22}
                                                color={colors.primary}
                                            />
                                            <View style={{ flex: 1, marginLeft: 6 }}>
                                                <Text style={[styles.recCatName, { color: theme.text }]}>{cat.name}</Text>
                                                <Text style={[styles.recCatBudget, { color: colors.primary }]}>
                                                    {allocated > 0
                                                        ? `₹${(allocated / 1000).toFixed(0)}k allocated · `
                                                        : ''}
                                                    {(cat.services || []).length} service
                                                    {(cat.services || []).length !== 1 ? 's' : ''}
                                                    {!expanded ? ' · tap to expand' : ''}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                        <View style={styles.catIncludeWrap}>
                                            <Text style={[styles.includeLabel, { color: theme.textLight }]}>Include</Text>
                                            <Switch
                                                value={included}
                                                onValueChange={(v) => {
                                                    setIncludedCats((p) => ({ ...p, [cat.id]: v }));
                                                    if (!v) {
                                                        setSelected((prev) => {
                                                            const next = new Map(prev);
                                                            (cat.services || []).forEach((s) => next.delete(s.id));
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                trackColor={{ false: theme.border, true: colors.primary + '88' }}
                                                thumbColor={included ? colors.primary : '#f4f3f4'}
                                            />
                                        </View>
                                    </View>
                                    {expanded && included && categories.length > 1 && (
                                        <>
                                            <Text style={[styles.sliderLabelSmall, { color: theme.textLight }]}>
                                                Share of total ({pctVal.toFixed(1)}%)
                                            </Text>
                                            <Slider
                                                style={styles.sliderSmall}
                                                minimumValue={0}
                                                maximumValue={100}
                                                value={pctVal}
                                                onSlidingComplete={(v) =>
                                                    onCategorySliderChange(cat.id, v, categories)
                                                }
                                                minimumTrackTintColor={colors.secondary}
                                                maximumTrackTintColor={theme.border}
                                                thumbTintColor={colors.secondary}
                                            />
                                        </>
                                    )}
                                    {expanded && !included && (
                                        <Text style={[styles.recSvcName, { color: theme.textLight, paddingVertical: 8 }]}>
                                            Category excluded — toggle Include to plan services here.
                                        </Text>
                                    )}
                                    {expanded &&
                                        included &&
                                        ((cat.services || []).length === 0 ? (
                                            <Text style={[styles.recSvcName, { color: theme.textLight }]}>
                                                No services in budget for this category
                                            </Text>
                                        ) : (
                                            (cat.services || []).map((svc) => {
                                                const isOn = selected.has(svc.id);
                                                const row = selected.get(svc.id);
                                                const tiers = svc.tiers || [];
                                                return (
                                                    <View
                                                        key={svc.id}
                                                        style={[
                                                            styles.svcCard,
                                                            {
                                                                borderColor: isOn ? colors.primary : theme.border,
                                                                backgroundColor: isOn ? colors.primary + '08' : 'transparent',
                                                            },
                                                        ]}
                                                    >
                                                        <TouchableOpacity
                                                            style={styles.svcRowTop}
                                                            onPress={() => toggleSelect(svc, cat.name)}
                                                        >
                                                            <Ionicons
                                                                name={isOn ? 'checkbox' : 'square-outline'}
                                                                size={22}
                                                                color={isOn ? colors.primary : theme.textLight}
                                                            />
                                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                                <Text style={[styles.recNearestName, { color: theme.text }]}>
                                                                    {svc.name}
                                                                </Text>
                                                                {svc.selection_note ? (
                                                                    <Text
                                                                        style={[styles.noteSmall, { color: theme.textLight }]}
                                                                    >
                                                                        {svc.selection_note}
                                                                    </Text>
                                                                ) : null}
                                                                {!isOn && tiers.some((t) => numPrice(t.price) != null) ? (
                                                                    <Text style={[styles.tierPriceHint, { color: theme.textLight }]}>
                                                                        Tier pricing:{' '}
                                                                        {tiers
                                                                            .filter((t) => numPrice(t.price) != null)
                                                                            .map((t) => `${t.label} ${formatRupees(t.price)}`)
                                                                            .join(' · ')}
                                                                    </Text>
                                                                ) : null}
                                                            </View>
                                                        </TouchableOpacity>
                                                        {isOn && tiers.length > 0 && (
                                                            <View style={styles.tierRow}>
                                                                {tiers.map((t) => {
                                                                    const p = numPrice(t.price);
                                                                    if (p == null) return null;
                                                                    const active = row?.tierKey === t.key;
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={t.key}
                                                                            style={[
                                                                                styles.tierChip,
                                                                                {
                                                                                    borderColor: active
                                                                                        ? colors.primary
                                                                                        : theme.border,
                                                                                    backgroundColor: active
                                                                                        ? colors.primary + '18'
                                                                                        : 'transparent',
                                                                                },
                                                                            ]}
                                                                            onPress={() =>
                                                                                setTierForService(
                                                                                    svc.id,
                                                                                    t.key,
                                                                                    p,
                                                                                    svc.name,
                                                                                    cat.name
                                                                                )
                                                                            }
                                                                        >
                                                                            <Text
                                                                                style={{
                                                                                    fontSize: 10,
                                                                                    fontWeight: '700',
                                                                                    color: theme.text,
                                                                                }}
                                                                            >
                                                                                {t.label}
                                                                            </Text>
                                                                            <Text
                                                                                style={{
                                                                                    fontSize: 10,
                                                                                    fontWeight: '800',
                                                                                    color: theme.text,
                                                                                }}
                                                                            >
                                                                                {formatRupees(p)}
                                                                            </Text>
                                                                            <Text
                                                                                style={{
                                                                                    fontSize: 9,
                                                                                    color: t.fits_allocation
                                                                                        ? '#059669'
                                                                                        : theme.textLight,
                                                                                }}
                                                                            >
                                                                                {t.fits_allocation ? 'Within slice' : 'Above slice'}
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })
                                        ))}
                                </View>
                            );
                        })}
                    </ScrollView>

                    <View style={[styles.recModalActions, { borderTopColor: theme.border }]}>
                        <TouchableOpacity
                            style={[styles.secondaryBtn, { borderColor: theme.border }]}
                            onPress={handleShare}
                        >
                            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.secondaryBtn, { borderColor: theme.border }]}
                            onPress={handleSaveSnapshot}
                            disabled={savingSnapshot}
                        >
                            {savingSnapshot ? (
                                <ActivityIndicator size="small" color={theme.text} />
                            ) : (
                                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Save</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.recModalActions, { borderTopWidth: 0, paddingTop: 0 }]}>
                        <TouchableOpacity
                            style={[styles.skipBtn, { flex: 1, borderColor: theme.border }]}
                            onPress={() => onClose(false)}
                        >
                            <Text style={[styles.skipBtnText, { color: theme.text }]}>Close</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.skipBtn, { flex: 1, borderColor: theme.border }]}
                            onPress={handleAddToCart}
                            disabled={addingCart}
                        >
                            {addingCart ? (
                                <ActivityIndicator size="small" color={theme.text} />
                            ) : (
                                <Text style={[styles.skipBtnText, { color: theme.text }]}>Add to cart</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.submitBtn, { flex: 1.2 }]} onPress={() => onClose('explore')}>
                            <LinearGradient
                                colors={[colors.primary, colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.exploreBtnGradient}
                            >
                                <Text style={styles.exploreBtnText}>Explore</Text>
                                <Ionicons name="arrow-forward" size={18} color="#FFF" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                    {recRefreshLoading && (
                        <View
                            style={[styles.recRefreshOverlay, { backgroundColor: (theme.surface || '#fff') + 'E6' }]}
                            pointerEvents="auto"
                        >
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[styles.recRefreshText, { color: theme.text }]}>Updating prices…</Text>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheetHeader: {
        flexShrink: 0,
    },
    sheetHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginBottom: 4,
        minHeight: 40,
    },
    recCloseBtn: {
        position: 'absolute',
        right: 16,
        top: 0,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recRefreshOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    recRefreshText: {
        marginTop: 14,
        fontSize: 14,
        fontWeight: '600',
    },
    pickerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ccc',
        alignSelf: 'center',
        marginBottom: 12,
    },
    pickerTitle: { fontSize: 18, fontWeight: '800', paddingHorizontal: 16, marginBottom: 8 },
    heroSub: { fontSize: 13, lineHeight: 19, paddingHorizontal: 16, marginBottom: 12 },
    recModalContent: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 12,
        flexDirection: 'column',
        overflow: 'hidden',
        maxHeight: SCREEN_HEIGHT,
    },
    recModalScroll: { flex: 1 },
    recModalScrollContent: { paddingBottom: 34, paddingHorizontal: 16 },
    helpToggle: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
    helpToggleText: { fontSize: 14, fontWeight: '700' },
    helpBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
    helpBody: { fontSize: 13, lineHeight: 20 },
    errText: { color: '#DC2626', marginTop: 8, fontSize: 13 },
    narrativeLoadingCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 20,
        alignItems: 'center',
        marginBottom: 14,
    },
    narrativeLoadingText: { marginTop: 10, fontSize: 13 },
    narrativeHero: {
        borderWidth: 2,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
    },
    narrativeHeroAccent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: '#FF7A00',
        opacity: 0.9,
    },
    narrativeBadgeRow: { marginBottom: 12 },
    narrativeBadgeGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    narrativeBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
    narrativeIntro: { fontSize: 16, lineHeight: 24, fontWeight: '600', marginBottom: 12 },
    narrativeTipsGrid: { gap: 8, marginBottom: 10 },
    narrativeTipPill: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
    },
    narrativeTipText: { flex: 1, fontSize: 13, lineHeight: 19 },
    narrativeRemindBox: { borderRadius: 10, padding: 10, marginBottom: 10 },
    narrativeRemindLine: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
    nDisclaimer: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
    sliderLabel: { fontSize: 14, fontWeight: '700', marginTop: 8 },
    sliderLabelSmall: { fontSize: 12, marginTop: 8 },
    sliderValue: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    slider: { width: '100%', height: 44 },
    sliderSmall: { width: '100%', height: 36 },
    recModalActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: 1,
        alignItems: 'center',
    },
    recCatBlock: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 14,
    },
    catHeaderMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    catExpandHit: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    catIncludeWrap: { alignItems: 'center', paddingLeft: 8 },
    includeLabel: { fontSize: 10, marginBottom: 2, fontWeight: '600' },
    recCatName: { fontSize: 16, fontWeight: '700' },
    recCatBudget: { fontSize: 12, fontWeight: '600' },
    recSvcName: { fontSize: 13 },
    recNearestName: { fontSize: 14, fontWeight: '600' },
    noteSmall: { fontSize: 11, marginTop: 4 },
    tierPriceHint: { fontSize: 11, marginTop: 6, lineHeight: 16 },
    svcCard: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
    svcRowTop: { flexDirection: 'row', alignItems: 'flex-start' },
    tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginLeft: 30 },
    tierChip: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        minWidth: 72,
        alignItems: 'center',
    },
    skipBtn: {
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    skipBtnText: { fontSize: 14, fontWeight: '600' },
    submitBtn: { borderRadius: 12, overflow: 'hidden' },
    exploreBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 12,
    },
    exploreBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
    secondaryBtn: {
        flex: 1,
        minWidth: '30%',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
