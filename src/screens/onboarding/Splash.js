import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from '../../components/Logo';
import { colors, gradients } from '../../theme/colors';

const { width, height } = Dimensions.get('window');

// Taglines in multiple languages
const TAGLINES = {
    english: 'Celebrating Togetherness with Trust and Care',
    hindi: 'अगर एकत्रित होना है, तो एकत्रा ही एकमात्र भरोसा है',
    odia: 'ଏକତ୍ରୀତ ହବା ପାଇଁ ଏକତ୍ର ହିଁ ଏକମାତ୍ର ଭରୋସା ଓ ସାହାରା',
};

export default function Splash({ navigation }) {
    const logoScale = useRef(new Animated.Value(0.5)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const taglineOpacity = useRef(new Animated.Value(0)).current;
    const taglineTranslateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        // Animate logo appearance
        Animated.parallel([
            Animated.timing(logoScale, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(logoOpacity, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
        ]).start();

        // Animate taglines after logo
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(taglineOpacity, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(taglineTranslateY, {
                    toValue: 0,
                    duration: 600,
                    useNativeDriver: true,
                }),
            ]).start();
        }, 500);

        // Navigate to onboarding after 3 seconds
        const timer = setTimeout(() => {
            navigation.replace('Onboarding');
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <LinearGradient
            colors={['#FF7A00', '#FFA040']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.container}
        >
            {/* Decorative circles */}
            <View style={[styles.circle, styles.circle1]} />
            <View style={[styles.circle, styles.circle2]} />
            <View style={[styles.circle, styles.circle3]} />

            {/* Logo */}
            <Animated.View
                style={[
                    styles.logoContainer,
                    {
                        transform: [{ scale: logoScale }],
                        opacity: logoOpacity,
                    },
                ]}
            >
                <View style={styles.logoBackground}>
                    <Logo width={width * 0.4} height={width * 0.4} />
                </View>
            </Animated.View>

            {/* Taglines */}
            <Animated.View
                style={[
                    styles.taglineContainer,
                    {
                        opacity: taglineOpacity,
                        transform: [{ translateY: taglineTranslateY }],
                    },
                ]}
            >
                <Text style={styles.taglineEnglish}>{TAGLINES.english}</Text>
                <View style={styles.taglineDivider} />
                <Text style={styles.taglineHindi}>{TAGLINES.hindi}</Text>
                <View style={styles.taglineDivider} />
                <Text style={styles.taglineOdia}>{TAGLINES.odia}</Text>
            </Animated.View>

            {/* Loading indicator */}
            <View style={styles.loadingContainer}>
                <View style={styles.loadingBar}>
                    <Animated.View
                        style={[
                            styles.loadingProgress,
                            {
                                transform: [{
                                    scaleX: logoOpacity.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, 1],
                                    }),
                                }],
                            },
                        ]}
                    />
                </View>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circle: {
        position: 'absolute',
        borderRadius: 1000,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    circle1: {
        width: width * 1.5,
        height: width * 1.5,
        top: -width * 0.5,
        left: -width * 0.5,
    },
    circle2: {
        width: width * 1.2,
        height: width * 1.2,
        bottom: -width * 0.4,
        right: -width * 0.4,
    },
    circle3: {
        width: width * 0.8,
        height: width * 0.8,
        top: height * 0.3,
        left: -width * 0.3,
    },
    logoContainer: {
        marginBottom: 30,
    },
    logoBackground: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: width * 0.25,
        padding: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 20,
    },
    taglineContainer: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    taglineEnglish: {
        fontSize: 20,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.95)',
        letterSpacing: 1,
        textAlign: 'center',
    },
    taglineDivider: {
        width: 30,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.4)',
        marginVertical: 8,
        borderRadius: 1,
    },
    taglineHindi: {
        fontSize: 18,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    taglineOdia: {
        fontSize: 18,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    loadingContainer: {
        position: 'absolute',
        bottom: 60,
        width: width * 0.5,
    },
    loadingBar: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    loadingProgress: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 2,
        transformOrigin: 'left',
    },
});
