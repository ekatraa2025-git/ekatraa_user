/**
 * Dynamic Expo config - allows env vars for Google Maps API key.
 * Set GOOGLE_MAPS_API_KEY or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env or EAS secrets.
 */
const profile = process.env.EAS_BUILD_PROFILE || process.env.APP_ENV || 'development';
const isProdLike = profile === 'production' || profile === 'preview';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const apiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';

if (isProdLike && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required for production/preview builds. Set them in EAS environment variables.'
  );
}

const expoConfig = {
  name: 'Ekatraa',
  slug: 'ekatraa',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/android/play_store_512.png',
  userInterfaceStyle: 'automatic',
  scheme: 'ekatraa',
  // Native-only app (Daily WebRTC, maps, razorpay). Web is unsupported, so it is
  // excluded from the dev server / build targets.
  platforms: ['ios', 'android'],
  splash: {
    image: './assets/android/play_store_512.png',
    resizeMode: 'contain',
    backgroundColor: '#FF4117',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.ekatraa.userapp',
    // Skip the App Store Connect export-compliance prompt — the app uses
    // standard HTTPS only, which is exempt under U.S. export regulations.
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'Allow Ekatraa to use your microphone so you can talk with the Ekatraa planning assistant in live voice mode.',
      NSCameraUsageDescription:
        'Allow Ekatraa to access your camera so you can upload event photos and update your profile picture.',
      NSPhotoLibraryUsageDescription:
        'Allow Ekatraa to access your photos so you can upload event pictures and update your profile.',
      NSPhotoLibraryAddUsageDescription:
        'Allow Ekatraa to save invites, receipts, and event photos to your photo library.',
      NSLocationWhenInUseUsageDescription:
        'Allow Ekatraa to access your location to show nearby venues and vendors.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Allow Ekatraa to access your location to show nearby venues, vendors, and event services.',
      NSContactsUsageDescription:
        'Allow Ekatraa to access your contacts to invite friends and family to your events.',
      NSUserTrackingUsageDescription:
        'Allow Ekatraa to use anonymized usage and crash data to improve the event planning experience.',
      LSApplicationQueriesSchemes: [
        'tel',
        'telprompt',
        'sms',
        'mailto',
        'whatsapp',
        'https',
        'http',
      ],
    },
  },
  android: {
    package: 'com.ekatraa.userapp',
    adaptiveIcon: {
      foregroundImage:
        './assets/android/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
      backgroundImage:
        './assets/android/res/mipmap-xxxhdpi/ic_launcher_background.png',
      monochromeImage:
        './assets/android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png',
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'ekatraa', host: 'auth-callback' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { favicon: './assets/favicon.png' },
  extra: {
    eas: { projectId: '94c34160-9afb-4576-93fc-e7f5f5e9a843' },
    APP_ENV: profile,
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    EXPO_PUBLIC_API_URL: apiUrl,
  },
  plugins: [
    'expo-dev-client',
    'expo-audio',
    'expo-video',
    ['@daily-co/config-plugin-rn-daily-js', { enableCamera: false, enableMicrophone: true }],
    '@react-native-community/datetimepicker',
    'expo-location',
    'expo-notifications',
    'expo-web-browser',
  ],
  updates: {
    enabled: false,
    checkAutomatically: 'ON_ERROR_RECOVERY',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'sdkVersion',
  },
};

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = {
  expo: {
    ...expoConfig,
    android: {
      ...expoConfig.android,
      config: {
        ...(expoConfig.android?.config || {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    ios: {
      ...expoConfig.ios,
      config: {
        ...(expoConfig.ios?.config || {}),
        googleMapsApiKey: googleMapsApiKey,
      },
    },
  },
};
