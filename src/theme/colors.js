// Ekatraa brand colors — refreshed palette
// Primary Orange: #FF7A00
// Secondary Blue: #1E3A8A

const light = {
    primary: '#FF7A00',
    primaryGradientStart: '#FF7A00',
    primaryGradientEnd: '#FFA040',
    secondary: '#1E3A8A',
    accent: '#3B82F6',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    text: '#1F2937',
    textLight: '#6B7280',
    inputBackground: '#F3F4F6',
    border: '#E5E7EB',
    card: '#FFFFFF',
    cardBorder: '#E5E7EB',
    error: '#DC2626',
    success: '#10B981',
    warning: '#F59E0B',
    white: '#FFFFFF',
    black: '#000000',
    overlay: 'rgba(0,0,0,0.4)',
    gradientStart: '#FF7A00',
    gradientMiddle: '#FF9A33',
    gradientEnd: '#FFA040',
};

const dark = {
    primary: '#FF8C1A',
    primaryGradientStart: '#FF8C1A',
    primaryGradientEnd: '#FFB060',
    secondary: '#3B82F6',
    accent: '#60A5FA',
    background: '#0F1117',
    surface: '#1A1D27',
    text: '#F9FAFB',
    textLight: '#9CA3AF',
    inputBackground: '#1F2333',
    border: '#2D3142',
    card: '#181B25',
    cardBorder: '#2D3142',
    error: '#EF4444',
    success: '#34D399',
    warning: '#FBBF24',
    white: '#FFFFFF',
    black: '#000000',
    overlay: 'rgba(0,0,0,0.6)',
    gradientStart: '#FF8C1A',
    gradientMiddle: '#FF9A33',
    gradientEnd: '#FFB060',
};

export const colors = {
    ...light,
    light,
    dark,
};

export const gradients = {
    primary: ['#FF7A00', '#FFA040'],
    warm: ['#FF7A00', '#FF9A33', '#FFA040'],
    sunset: ['#FF7A00', '#FFA040', '#FFD180'],
    splash: ['#1E3A8A', '#3B82F6'],
    card: ['#FFFFFF', '#F7F8FA'],
    darkCard: ['#181B25', '#1A1D27'],
    blue: ['#1E3A8A', '#2563EB', '#3B82F6'],
};
