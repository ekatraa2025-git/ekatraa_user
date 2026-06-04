/** Ekatraa customer support (matches Help & Home CTAs). Override via env if needed. */
const RAW_PHONE = process.env.EXPO_PUBLIC_EKATRAA_SUPPORT_PHONE || '918422948781';

export const EKATRAA_SUPPORT_PHONE_DIGITS = String(RAW_PHONE).replace(/\D/g, '');

export const EKATRAA_SUPPORT_TEL = `tel:+${EKATRAA_SUPPORT_PHONE_DIGITS}`;

export const EKATRAA_SUPPORT_WHATSAPP_URL = `https://wa.me/${EKATRAA_SUPPORT_PHONE_DIGITS}`;
