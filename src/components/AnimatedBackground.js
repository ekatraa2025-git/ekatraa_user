import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const SacredShape = ({ size, top, left, delay, duration, opacity, darkMode }) => {
    const driftX = useRef(new Animated.Value(0)).current;
    const driftY = useRef(new Animated.Value(0)).current;
    const spin = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const start = () => {
            driftX.setValue(0);
            driftY.setValue(0);
            spin.setValue(0);
            pulse.setValue(0);

            Animated.parallel([
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(driftX, { toValue: 14, duration: duration * 0.4, useNativeDriver: true }),
                        Animated.timing(driftX, { toValue: -12, duration: duration * 0.4, useNativeDriver: true }),
                        Animated.timing(driftX, { toValue: 0, duration: duration * 0.2, useNativeDriver: true }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(driftY, { toValue: 10, duration: duration * 0.32, useNativeDriver: true }),
                        Animated.timing(driftY, { toValue: -8, duration: duration * 0.36, useNativeDriver: true }),
                        Animated.timing(driftY, { toValue: 0, duration: duration * 0.32, useNativeDriver: true }),
                    ])
                ),
                Animated.loop(Animated.timing(spin, {
                        toValue: 1,
                        duration: 9000,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    })),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
                        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
                    ])
                ),
            ]).start();
        };

        const timeout = setTimeout(start, delay);
        return () => clearTimeout(timeout);
    }, [delay, driftX, driftY, duration, pulse, size, spin]);

    const rotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    const scale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.06],
    });
    const ringColor = darkMode ? 'rgba(167,139,250,0.24)' : 'rgba(124,58,237,0.16)';
    const lineColor = darkMode ? 'rgba(251,191,36,0.2)' : 'rgba(234,88,12,0.15)';

    return (
        <Animated.View
            style={[
                styles.shapeWrap,
                {
                    top,
                    left,
                    width: size,
                    height: size,
                    opacity,
                    transform: [{ translateX: driftX }, { translateY: driftY }, { rotate }, { scale }],
                },
            ]}
        >
            <View style={[styles.outerRing, { borderColor: ringColor }]} />
            <View style={[styles.innerRing, { borderColor: ringColor }]} />
            <View style={[styles.hLine, { backgroundColor: lineColor }]} />
            <View style={[styles.vLine, { backgroundColor: lineColor }]} />
            <View style={[styles.diagA, { backgroundColor: lineColor }]} />
            <View style={[styles.diagB, { backgroundColor: lineColor }]} />
            <View style={[styles.centerDot, { backgroundColor: darkMode ? 'rgba(251,191,36,0.28)' : 'rgba(234,88,12,0.2)' }]} />
        </Animated.View>
    );
};

export const AnimatedBackground = ({ children }) => {
    const { theme, isDarkMode } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.backgroundLayer} pointerEvents="none">
                <SacredShape size={110} top={height * 0.12} left={width * 0.06} delay={0} duration={24000} opacity={0.45} darkMode={isDarkMode} />
                <SacredShape size={88} top={height * 0.28} left={width * 0.72} delay={2300} duration={21000} opacity={0.36} darkMode={isDarkMode} />
                <SacredShape size={124} top={height * 0.46} left={width * 0.32} delay={4200} duration={26000} opacity={0.33} darkMode={isDarkMode} />
                <SacredShape size={96} top={height * 0.66} left={width * 0.02} delay={1400} duration={22000} opacity={0.3} darkMode={isDarkMode} />
                <SacredShape size={104} top={height * 0.82} left={width * 0.62} delay={5400} duration={25000} opacity={0.26} darkMode={isDarkMode} />
            </View>

            <View style={{ flex: 1, zIndex: 1 }}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backgroundLayer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
        overflow: 'hidden',
    },
    shapeWrap: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    outerRing: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 999,
        borderWidth: 1.4,
    },
    innerRing: {
        position: 'absolute',
        width: '62%',
        height: '62%',
        borderRadius: 999,
        borderWidth: 1.2,
    },
    hLine: {
        position: 'absolute',
        width: '84%',
        height: 1,
    },
    vLine: {
        position: 'absolute',
        width: 1,
        height: '84%',
    },
    diagA: {
        position: 'absolute',
        width: '78%',
        height: 1,
        transform: [{ rotate: '45deg' }],
    },
    diagB: {
        position: 'absolute',
        width: '78%',
        height: 1,
        transform: [{ rotate: '-45deg' }],
    },
    centerDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
    },
});
