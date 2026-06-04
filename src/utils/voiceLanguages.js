import AsyncStorage from '@react-native-async-storage/async-storage';

export const VOICE_LANG_STORAGE_KEY = 'ekatraa_planning_voice_lang';

export const VOICE_LANG_OPTIONS = [
    { code: 'en-IN', label: 'English' },
    { code: 'hi-IN', label: 'Hindi · हिंदी' },
    { code: 'bn-IN', label: 'Bengali · বাংলা' },
    { code: 'ta-IN', label: 'Tamil · தமிழ்' },
    { code: 'kn-IN', label: 'Kannada · ಕನ್ನಡ' },
    { code: 'pa-IN', label: 'Punjabi · ਪੰਜਾਬੀ' },
    { code: 'mr-IN', label: 'Marathi · मराठी' },
    { code: 'gu-IN', label: 'Gujarati · ગુજરાતી' },
    { code: 'as-IN', label: 'Assamese · অসমীয়া' },
    { code: 'od-IN', label: 'Odia · ଓଡ଼ିଆ' },
];

const VOICE_LANG_CODE_SET = new Set(VOICE_LANG_OPTIONS.map((o) => o.code));

export function isVoiceLangCode(value) {
    return typeof value === 'string' && VOICE_LANG_CODE_SET.has(value);
}

export async function readStoredVoiceLang() {
    try {
        const stored = await AsyncStorage.getItem(VOICE_LANG_STORAGE_KEY);
        return isVoiceLangCode(stored) ? stored : 'en-IN';
    } catch {
        return 'en-IN';
    }
}

export async function persistVoiceLang(code) {
    if (!isVoiceLangCode(code)) return;
    try {
        await AsyncStorage.setItem(VOICE_LANG_STORAGE_KEY, code);
    } catch {
        /* ignore */
    }
}
