import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function withOpacity(hexColor, opacity) {
    if (typeof hexColor !== 'string') return `rgba(0,0,0,${opacity})`;
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return `rgba(0,0,0,${opacity})`;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
}

export function SkeletonBlock({ width = '100%', height = 14, radius = 10, theme }) {
    const pulse = useRef(new Animated.Value(0.45)).current;
    const baseColor = useMemo(() => withOpacity(theme?.text || '#111111', 0.12), [theme?.text]);
    const highlightColor = useMemo(() => withOpacity(theme?.text || '#111111', 0.22), [theme?.text]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: false }),
                Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: false }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    const backgroundColor = pulse.interpolate({
        inputRange: [0.45, 1],
        outputRange: [baseColor, highlightColor],
    });

    return <Animated.View style={{ width, height, borderRadius: radius, backgroundColor }} />;
}

export function SkeletonCard({ theme, children, style }) {
    return (
        <View style={[styles.card, { borderColor: withOpacity(theme?.text || '#111111', 0.1) }, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        overflow: 'hidden',
    },
});
