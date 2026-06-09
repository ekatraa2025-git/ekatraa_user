import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const STORAGE_KEY = 'ekatraa_app_locale';

/** Minimal fallbacks when API is offline (English). */
const FALLBACK_EN = {
    home_your_location: 'Your Location',
    home_select_city: 'Select City',
    home_ai_placeholder: "Tell us about your event and we'll find the best services...",
    tab_home: 'Home',
    tab_orders: 'Orders',
    tab_cart: 'Cart',
    tab_about: 'About',
    tab_more: 'More',
    select_language: 'Select Language',
    lang_en: 'English',
    lang_hi: 'Hindi',
    lang_or: 'Odia',
    guest_manager_title: 'Guest Manager',
    guest_tab_guests: 'Guests',
    guest_tab_gifts: 'Gifts',
    guest_tab_invite: 'Invite',
    guest_stat_guests: 'Guests',
    guest_stat_confirmed: 'Confirmed',
    guest_stat_gifts: 'Gifts',
    guest_stat_cash: 'Cash',
    guest_search_guests: 'Search guests...',
    guest_search_gifts: 'Search gifts...',
    invite_title: 'Create Digital Invitation',
    invite_desc: 'Design a beautiful invitation and share it with your guests via WhatsApp, SMS, or any app.',
    invite_event_name_ph: 'Event Name * (e.g. Wedding of Priya & Rahul)',
    invite_pick_date: 'Pick date',
    invite_pick_time: 'Pick time',
    invite_venue_name: 'Venue Name',
    invite_venue_address: 'Venue Address',
    invite_hosts_ph: 'Hosted by (e.g. The Sharma Family)',
    invite_message_ph: 'Personal message (optional)',
    invite_color_label: 'Color theme',
    invite_variation_label: 'Style',
    invite_gen_samples: 'Generate sample invitations (AI)',
    invite_gen_final: 'Generate final creative invite (AI)',
    invite_samples_heading: 'Sample ideas',
    invite_final_heading: 'Final invitation',
    invite_preview: 'PREVIEW',
    invite_preview_title: 'You are cordially invited!',
    invite_preview_footer: 'We look forward to your gracious presence!',
    invite_share: 'Share Invitation',
    invite_send_all: 'Send to All Guests',
    invite_whatsapp_batches: 'WhatsApp (batches of 5)',
    invite_wa_batch_title: 'WhatsApp batch',
    invite_wa_open: 'Open WhatsApp',
    invite_wa_next_batch: 'Next batch',
    invite_wa_done: 'Done',
    invite_wa_no_phone: 'No guests with phone numbers.',
    invite_loading_guests: 'Loading your guest data...',
    invite_login_required: 'Login Required',
    invite_login_hint: 'Please login to manage your guests',
    home_plan_occasion: 'Plan Your Occasion',
    home_plan_subtitle: 'Choose an event to get started',
    home_plan_tab_occasions: 'All occasions',
    home_plan_tab_special: 'Special add-ons',
    home_latest_partners: 'Latest from our Partners',
    home_latest_partners_sub: 'Gallery previews — partner details unlock after you book.',
    home_featured_in_city: 'Featured in {city}',
    home_partner_services_hint: 'Services shown are indicative.',
    home_special_browse_all: 'Browse full special catalog',
    home_form_title: 'Tell us about your event',
    home_form_help: 'Help us show you the best categories for',
    home_special_skip: 'Skip form · Special add-ons',
    home_i_am: 'I am the',
    home_name: 'Name *',
    home_phone: 'Phone *',
    home_email: 'Email',
    home_event_date: 'Event Date',
    home_guest_count: 'Guest Count',
    home_event_location: 'Event location',
    home_event_location_hint: 'Will the gathering be at your own place or a venue?',
    home_own_place: 'Own place',
    home_venue: 'Venue',
    home_venue_optional: 'Venue name (optional)',
    home_venue_ph: 'e.g. Hotel / banquet name',
    home_budget_label: 'Budget (excl. Gold & Apparels)',
    home_skip_browse: 'Skip & Browse All',
    home_continue: 'Continue',
    home_what_need: 'What do you need?',
    home_loading_categories: 'Loading categories...',
    home_need_help: 'Need Help?',
    home_help_subtitle: "We're here to assist you with your event planning",
    home_help_faq: 'Help & FAQ',
    home_help_whatsapp: 'WhatsApp',
    home_help_call: 'Call Us',
    home_guest_manager_card: 'Guest Manager',
    home_guest_manager_desc: 'Manage guest lists, track gifts & send digital invitations',
    home_testimonials_kicker: 'Real celebrations',
    home_testimonials_title: 'Stories that inspire us',
    home_testimonials_sub: 'Families who planned with Ekatraa',
    home_video: 'Video',
    home_voice: 'Voice',
    home_select_date: 'Select date',
    home_role_groom: 'Groom',
    home_role_bride: 'Bride',
    home_role_host: 'Host',
    home_role_other: 'Other',
    home_pick_categories: 'Select one or more categories for',
    home_your_event: 'your event',
    home_your_occasion: 'your occasion',
    home_explore_categories: 'Explore',
    home_category_single: 'Category',
    home_category_plural: 'Categories',
    about_title: 'About Ekatraa',
    about_tagline: 'Your one-stop platform for planning weddings, pujas, celebrations & all life events.',
    about_what_title: 'What We Do',
    about_what_body: 'Ekatraa connects you with verified vendors for every occasion — from venue booking and catering to décor, photography, priests, and more. We make event planning effortless, so you can focus on making memories.',
    about_mission_title: 'Our Mission',
    about_mission_body: 'To simplify event planning across India by providing a curated marketplace of trusted service providers with transparent pricing.',
    about_contact_title: 'Contact',
    about_copyright: '© 2025 Ekatraa. All rights reserved.',
    menu_title: 'Menu',
    menu_welcome_guest: 'Welcome, Guest',
    menu_tap_login: 'Tap to login →',
    menu_items_label: 'Menu items',
    menu_saved_plans: 'Saved budget plans',
    menu_saved_plans_sub: 'Budgets, categories & AI insight',
    menu_dark_mode: 'Dark Mode',
    menu_profile: 'My Profile',
    menu_orders: 'My Orders',
    menu_guest: 'Guest Manager',
    menu_help: 'Help & Support',
    menu_about: 'About',
    menu_logout: 'Logout',
    menu_logout_confirm: 'Are you sure you want to logout?',
    menu_login_signup: 'Login / Sign Up',
    menu_sign_in_title: 'Sign in',
    menu_sign_in_msg: 'Sign in to view saved budget plans and AI recommendations.',
    login_welcome_title: 'Welcome to Ekatraa',
    login_subtitle: 'Sign in to book services and manage your events',
    login_phone_label: 'Phone Number',
    login_phone_ph: 'Enter 10-digit mobile number',
    login_sending_otp: 'Sending OTP...',
    login_continue_otp: 'Continue with OTP',
    login_or: 'OR',
    login_google: 'Continue with Google',
    login_footer_agree: 'By continuing, you agree to our',
    login_terms: 'Terms & Conditions',
    login_footer_same: '(same as at app start)',
    cart_title: 'Cart',
    cart_empty_title: 'Your cart is empty',
    cart_empty_hint: 'Browse services from Home to get started.',
    cart_browse: 'Browse Services',
    cart_browse_lower: 'Browse services',
    cart_order_summary: 'Order summary',
    cart_item: 'item',
    cart_items: 'items',
    cart_clear: 'Clear cart',
    help_title: 'Help & Support',
    help_contact_title: 'Contact Us',
    help_call_us: 'Call Us',
    help_email_us: 'Email Us',
    help_whatsapp_label: 'WhatsApp',
    help_chat_with_us: 'Chat with us',
    help_faq_title: 'Frequently Asked Questions',
    faq_q1: 'How do I place an order?',
    faq_a1: 'Select an occasion, choose categories, pick services with pricing tiers, fill your event details, and add to cart. Then proceed to checkout.',
    faq_q2: 'Can I cancel an order?',
    faq_a2: 'Yes, you can request cancellation from the My Orders section. Our team will review and process it.',
    faq_q3: 'How are vendors selected?',
    faq_a3: 'All vendors on Ekatraa are verified and curated based on quality, reliability, and customer feedback.',
    faq_q4: 'What payment methods are accepted?',
    faq_a4: 'Pay 20% advance online (UPI, cards, net banking) or choose Cash on Order Finalization—pay after vendors confirm pricing and details.',
    faq_q5: 'How do I track my order?',
    faq_a5: 'Go to My Orders to view real-time status updates on all your orders.',
    orders_title: 'My Orders',
    orders_sign_in: 'Sign in to see your orders.',
    orders_empty_title: 'No orders yet',
    orders_empty_sub: 'Orders from checkout will appear here.',
    orders_filter_all: 'All',
    orders_filter_week: '7 days',
    orders_filter_month: '30 days',
    orders_filter_90d: '90 days',
    orders_in_range: 'in range',
    orders_order: 'order',
    orders_orders: 'orders',
    button_cancel: 'Cancel',
    button_login: 'Login',
    home_use_current_location: 'Use current location',
    home_select_on_map: 'Select on map',
    home_pick_location_hint: 'Pick current GPS or search on the map to set your event address.',
    home_budget_slider_hint: 'Slide from ₹0 up to ₹2 Cr, or pick a quick range below.',
    userinfo_step_progress: 'Step {current} of {total}',
    userinfo_step_contact: 'Your contact',
    userinfo_step_event: 'Event details',
    userinfo_step_location: 'Location',
    userinfo_step_budget: 'Planned budget',
    userinfo_next: 'Next',
    userinfo_err_name: 'Please enter your name.',
    userinfo_err_phone: 'Please enter your mobile number.',
    userinfo_err_phone_len: 'Enter a valid 10-digit mobile number.',
    userinfo_err_email: 'Please enter a valid email address.',
    userinfo_err_guests: 'Guest count should be a valid number.',
    userinfo_err_location_kind: 'Choose whether the event is at your place or a venue.',
    userinfo_err_location_pick: 'Pick your location using GPS or the map.',
    userinfo_err_budget: 'Set your budget using the slider or a quick chip.',
    userinfo_validation_title: 'Check this',
    userinfo_ph_name: 'Your full name',
    userinfo_ph_phone: '10-digit mobile',
    userinfo_ph_email: 'Email address (optional)',
    userinfo_ph_guests: 'Approx. number of guests',
    userinfo_special_step1: 'Occasion & date',
    userinfo_special_step2: 'Delivery',
    userinfo_special_step3: 'Your contact',
    userinfo_special_next: 'Next',
    userinfo_special_occasion_ph: 'Occasion name',
    budget_chip_flexible: 'Flexible (₹0)',
    budget_chip_under_1l: 'Under ₹1 Lakh',
    budget_chip_1_3_lakhs: '1–3 Lakhs',
    budget_chip_3_6_lakhs: '3–6 Lakhs',
    budget_chip_6_10_lakhs: '6–10 Lakhs',
    budget_chip_11_15_lakhs: '11–15 Lakhs',
    budget_chip_16_20_lakhs: '16–20 Lakhs',
    budget_chip_21_30_lakhs: '21–30 Lakhs',
    budget_chip_30_l_plus: '30 Lakhs+',
    budget_chip_50_l_plus: '50 Lakhs+',
    notifications_title: 'Notifications',
    notifications_empty: 'No notifications yet. Updates on orders and quotes appear here.',
    notifications_mark_all: 'Read all',
    home_top_vendors_title: 'Top picks near you',
    home_top_vendors_sub: 'Ekatraa-ranked partners — unlock direct vendor contact after advance.',
    vendor_contact_locked_note: 'Vendor phone and email unlock after you book and pay the advance on Ekatraa. For now, reach us below.',
    vendor_call_ekatraa: 'Call Ekatraa',
    vendor_whatsapp_ekatraa: 'WhatsApp',
    home_event_form_banner_title: 'Tell us about your event',
    home_event_form_banner_sub: 'Name, budget and location unlock personalised categories and AI picks.',
    home_special_skip_sub: 'Odiya Bhara, Puja Samagri, party poppers, beverages and more — all occasions.',
    special_catalog_title: 'Special add-ons',
    special_catalog_header_sub: 'For every occasion · curated extras',
    special_catalog_hero_title: 'Special add-ons for any occasion',
    special_catalog_hero_sub:
        'Digital e-invites (AI), rituals, party supplies and more — pick a tier per add-on. Your budget, your ideas.',
    special_catalog_badge: 'Special catalog',
    special_catalog_empty: 'No special services yet. Check back soon or ask your coordinator.',
    special_catalog_loading: 'Loading catalogue…',
    special_checkout_title: 'Your details',
    special_checkout_sub: 'Step-by-step — we need this before adding to cart',
    special_occasion_label: 'Occasion name',
    special_event_date_label: 'Event date',
    special_delivery_label: 'Delivery preference',
    special_venue_mode: 'Event venue',
    special_address_mode: 'Delivery address',
    special_venue_field: 'Venue name / selection',
    special_address_field: 'Full address',
    special_step_next: 'Next',
    special_step_back: 'Back',
    special_save_add: 'Save & add to cart',
    special_err_occasion: 'Enter the occasion name.',
    special_err_date: 'Select the event date.',
    special_err_venue: 'Enter the venue details.',
    special_err_address: 'Enter the delivery address.',
    special_err_contact: 'Add your name and a valid 10-digit mobile number.',

    order_details_title: 'Order Details',
    order_summary_title: 'Order confirmation',
    order_placed_success: 'Order placed successfully',
    order_services_selected: 'Services selected',
    order_services_subtotal: 'Services subtotal',
    order_booking_protection: 'Booking protection',
    order_total_amount: 'Total amount',
    order_advance_paid_20: 'Advance paid (20%)',
    order_advance_paid: 'Advance paid',
    order_pay_on_finalization: 'Pay on finalization',
    order_balance_payable: 'Balance payable',
    order_your_budget: 'Your planned budget',
    order_vendors_title: 'Matching vendors',
    order_vendors_count: '{n}+ vendors can fulfil your selection',
    order_vendors_desc:
        'Ekatraa will help you compare and choose the best vendors for each service. You will see quotes and allocations after your order progresses.',
    order_vendors_breakdown: 'Based on {count} service line(s) in your order.',
    order_view_details: 'View order details',
    order_back_home: 'Back to Home',
    order_section_items: 'Items',
    order_label_occasion: 'Occasion',
    order_label_who_applied: 'Who applied',
    order_label_contact_name: 'Contact name',
    order_label_contact_phone: 'Contact phone',
    order_label_contact_email: 'Contact email',
    order_label_event_date: 'Event date',
    order_label_ordered_at: 'Ordered at',
    order_no_specified: 'No order specified.',
    order_error_sign_in_title: 'Sign in required',
    order_error_load_title: 'Could not load order',
    order_error_sign_in_sub: 'Sign in to see vendor quotes, items, and status for this order.',
    order_try_again: 'Try again',
    order_no_data: 'No order data.',
    order_status_history: 'Status history',
    order_work_started: 'Work started',
    order_work_completed: 'Work completed',
    order_otp_start_label: 'Start work OTP (share with vendor)',
    order_otp_completion_label: 'Completion OTP (share with vendor)',
    order_pay_balance: 'Pay balance',
    order_quotes_banner_title: 'Vendor quotes',
    order_quotes_banner_sub: 'Compare offers and accept the one that fits your celebration',
    order_quote_vendor: 'Vendor',
    order_vendor_masked: 'Curated partner',
    order_cancel_title: 'Cancel order',
    order_cancel_action: 'Cancel order',
    order_cancel_confirm: 'Are you sure you want to cancel this order? This cannot be undone from the app.',
    order_cancel_success: 'Your order has been cancelled.',
    order_cancel_failed: 'Could not cancel this order. Try again or contact support.',
    order_quote_submitted: 'Submitted',
    order_quote_service: 'Service',
    order_quote_venue: 'Venue',
    order_attachments: 'Attachments',
    order_quote_reject_title: 'Reject quote?',
    order_quote_reject_body: 'This quote will be marked as rejected.',
    order_quote_reject: 'Reject',
    order_quote_accept: 'Accept',
    order_quotes_empty_title: 'No vendor quotes yet',
    order_quotes_empty_sub:
        'When an allocated vendor submits a quotation, it will appear here. Pull down to refresh.',
    alert_login_title: 'Login required',
    alert_login_quotation_body: 'Please sign in to accept or reject quotes.',
    alert_quote_accepted_title: 'Quote accepted',
    alert_quote_accepted_body_advance:
        'Please complete your 20% advance of ₹{amount} to proceed. You can use Pay balance or checkout flows when available.',
    alert_quote_accepted_body_simple: 'Your order is confirmed with the vendor.',
    alert_quote_accepted_ok: 'OK',
    alert_error: 'Error',
    alert_quote_update_failed: 'Could not update quotation.',
    line_item_category: 'Category',
    line_item_occasion: 'Occasion',
    line_item_tier_pricing: 'Tier & pricing',
    line_item_variety: 'Variety',
    line_item_unit: 'Unit',
};

const LocaleContext = createContext({
    language: 'en',
    setLanguage: async () => { },
    t: (k) => k,
    ready: false,
});

export function LocaleProvider({ children }) {
    const [language, setLanguageState] = useState('en');
    const [bundles, setBundles] = useState({ en: {}, hi: {}, or: {} });
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (!cancelled && stored && ['en', 'hi', 'or'].includes(stored)) {
                    setLanguageState(stored);
                }
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await api.getTranslations();
            if (!cancelled && data && !error) {
                setBundles({
                    en: { ...FALLBACK_EN, ...(data.en || {}) },
                    hi: { ...FALLBACK_EN, ...(data.hi || {}) },
                    or: { ...FALLBACK_EN, ...(data.or || {}) },
                });
            } else if (!cancelled) {
                setBundles({
                    en: { ...FALLBACK_EN },
                    hi: { ...FALLBACK_EN },
                    or: { ...FALLBACK_EN },
                });
            }
            if (!cancelled) setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const setLanguage = useCallback(async (lang) => {
        if (!['en', 'hi', 'or'].includes(lang)) return;
        setLanguageState(lang);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, lang);
        } catch {
            /* ignore */
        }
    }, []);

    const t = useCallback(
        (key) => {
            const pack = bundles[language] || bundles.en || {};
            const en = bundles.en || {};
            const v = pack[key] ?? en[key] ?? FALLBACK_EN[key];
            return v != null && String(v).length > 0 ? String(v) : key;
        },
        [bundles, language]
    );

    const value = useMemo(
        () => ({ language, setLanguage, t, ready }),
        [language, setLanguage, t, ready]
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
    return useContext(LocaleContext);
}
