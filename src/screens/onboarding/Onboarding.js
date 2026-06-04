import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, FlatList, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Plan Your Dream Event',
        titleHindi: 'अपना सपनों का इवेंट प्लान करें',
        description: 'Discover top venues, caterers, decorators, and more in one place.',
        image: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&q=80&w=1000',
        icon: '🎊',
    },
    {
        id: '2',
        title: 'Connect with Vendors',
        titleHindi: 'विक्रेताओं से जुड़ें',
        description: 'Find verified vendors for weddings, birthdays, corporate events, and more.',
        image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1000',
        icon: '🤝',
    },
    {
        id: '3',
        title: 'Book with Ease',
        titleHindi: 'आसानी से बुक करें',
        description: 'Get quotes, compare prices, and book services all from your phone.',
        image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&q=80&w=1000',
        icon: '📱',
    },
];

export default function Onboarding({ navigation }) {
    const { theme, isDarkMode } = useTheme();
    const { isAuthenticated, loading: authLoading, user, session } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const handleNext = () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
            setCurrentIndex(currentIndex + 1);
        } else {
            // Navigate directly to Home (no login required)
            navigation.replace('Home');
        }
    };

    const handleSkip = () => {
        // Navigate directly to Home (no login required)
        navigation.replace('Home');
    };

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index || 0);
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const renderSlide = ({ item, index }) => (
        <View style={[styles.slide, { width }]}>
            {/* Image with overlay */}
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: item.image }}
                    style={styles.image}
                    resizeMode="cover"
                />
                <LinearGradient
                    colors={['transparent', isDarkMode ? '#0F0F0F' : '#FFFFFF']}
                    style={styles.imageOverlay}
                />
            </View>

            {/* Content */}
            <View style={styles.slideContent}>
                <Text style={styles.slideIcon}>{item?.icon || '🎉'}</Text>
                <Text style={[styles.title, { color: colors.primary }]}>{item.title}</Text>
                <Text style={[styles.titleHindi, { color: theme.textLight }]}>{item.titleHindi}</Text>
                <Text style={[styles.description, { color: theme.text }]}>{item.description}</Text>
            </View>
        </View>
    );

    const renderDots = () => (
        <View style={styles.dotsContainer}>
            {SLIDES.map((_, index) => {
                const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
                const dotWidth = scrollX.interpolate({
                    inputRange,
                    outputRange: [8, 24, 8],
                    extrapolate: 'clamp',
                });
                const opacity = scrollX.interpolate({
                    inputRange,
                    outputRange: [0.3, 1, 0.3],
                    extrapolate: 'clamp',
                });

                return (
                    <Animated.View
                        key={index}
                        style={[
                            styles.dot,
                            {
                                width: dotWidth,
                                opacity,
                                backgroundColor: colors.primary,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );

    const isLoggedIn = !!isAuthenticated || !!user || !!session;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.logoContainer}>
                    <Logo width={36} height={36} />
                    <Text style={[styles.brandName, { color: colors.primary }]}>Ekatraa</Text>
                </View>
                <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
                    <Text style={[styles.skipText, { color: theme.textLight }]}>Skip</Text>
                </TouchableOpacity>
            </View>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={SLIDES}
                renderItem={renderSlide}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
            />

            {/* Footer */}
            <View style={styles.footer}>
                {renderDots()}
                
                <Button
                    title={currentIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
                    onPress={handleNext}
                    style={styles.nextBtn}
                />

                {currentIndex === SLIDES.length - 1 && (
                    <View style={styles.authFooterWrap}>
                        {authLoading ? (
                            <Text style={[styles.authHintText, { color: theme.textLight }]}>Checking login state...</Text>
                        ) : isLoggedIn ? (
                            <Text style={[styles.loggedInText, { color: colors.primary }]}>Logged in</Text>
                        ) : (
                            <TouchableOpacity
                                style={styles.authLinkBtn}
                                onPress={() => navigation.navigate('Login')}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.authLinkText, { color: colors.primary }]}>
                                    Login with Mobile or Google Id
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    brandName: {
        fontSize: 20,
        fontWeight: '700',
    },
    skipBtn: {
        padding: 8,
    },
    skipText: {
        fontSize: 15,
        fontWeight: '500',
    },
    slide: {
        flex: 1,
    },
    imageContainer: {
        height: height * 0.45,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 100,
    },
    slideContent: {
        flex: 1,
        paddingHorizontal: 30,
        paddingTop: 20,
        alignItems: 'center',
    },
    slideIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    titleHindi: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    description: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 10,
    },
    footer: {
        padding: 20,
        paddingBottom: 30,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        marginHorizontal: 4,
    },
    nextBtn: {
        marginBottom: 16,
    },
    authFooterWrap: {
        alignItems: 'center',
        padding: 8,
    },
    authHintText: {
        fontSize: 14,
        marginBottom: 6,
    },
    authLinkBtn: {
        paddingHorizontal: 2,
        paddingVertical: 2,
    },
    authLinkText: {
        fontSize: 15,
        fontWeight: '700',
    },
    loggedInText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
