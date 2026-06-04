import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeaderActions from './AppHeaderActions';

/** Floating language + cart — parent sets visibility by route. */
export default function GlobalAppHeader({ visible }) {
    const insets = useSafeAreaInsets();
    if (!visible) return null;
    return (
        <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
            <View style={styles.inner} pointerEvents="box-none">
                <View style={styles.leftSpacer} />
                <AppHeaderActions />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 2000,
        elevation: 2000,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'box-none',
    },
    leftSpacer: {
        width: 8,
        height: 1,
    },
});
