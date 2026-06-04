import React from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export const Input = ({ label, value, onChangeText, placeholder, secureTextEntry, error, keyboardType, style, inputStyle, ...props }) => {
    return (
        <View style={[styles.container, style]}>
            {label && <Text style={styles.label}>{label}</Text>}
            <TextInput
                style={[styles.input, error && styles.inputError, inputStyle]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                secureTextEntry={!!secureTextEntry}
                keyboardType={keyboardType}
                placeholderTextColor={colors.textLight}
                {...props}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 8,
        width: '100%',
    },
    label: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 6,
        fontWeight: '500',
    },
    input: {
        backgroundColor: colors.inputBackground,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 16,
        color: colors.text,
    },
    inputError: {
        borderColor: colors.error,
    },
    errorText: {
        color: colors.error,
        fontSize: 12,
        marginTop: 4,
    },
});
