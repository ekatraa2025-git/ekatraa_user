import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';

export const Button = ({ title, onPress, variant = 'primary', loading = false, style, textStyle }) => {
    const backgroundColor = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.secondary : 'transparent';
    const textColor = variant === 'outline' ? colors.primary : colors.white;
    const borderStyle = variant === 'outline' ? { borderWidth: 1, borderColor: colors.primary } : {};

    return (
        <TouchableOpacity
            style={[styles.button, { backgroundColor }, borderStyle, style]}
            onPress={onPress}
            disabled={loading}
        >
            {loading ? (
                <ActivityIndicator color={textColor} />
            ) : (
                <Text style={[styles.text, { color: textColor }, textStyle]}>{title}</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 8,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
});
