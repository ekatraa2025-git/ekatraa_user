import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import AppToast from '../components/AppToast';
import AppConfirmDialog from '../components/AppConfirmDialog';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const [toast, setToast] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const hideToast = useCallback(() => setToast(null), []);

    /**
     * @param {{ title?: string, message?: string, variant?: 'success'|'error'|'info', duration?: number, action?: { label: string, onPress: () => void } }} opts
     */
    const showToast = useCallback((opts) => {
        if (!opts) return;
        const ttl = opts.title != null ? String(opts.title) : '';
        const msg = opts.message != null ? String(opts.message) : '';
        if (!ttl && !msg) return;
        const hasBoth = ttl && msg;
        setToast({
            variant: opts.variant || 'info',
            title: hasBoth ? ttl : undefined,
            message: hasBoth ? msg : ttl || msg,
            duration: opts.duration,
            action: opts.action,
        });
    }, []);

    /**
     * @param {{ title?: string, message?: string, confirmLabel?: string, cancelLabel?: string, destructive?: boolean, onConfirm?: () => void, onCancel?: () => void }} opts
     */
    const showConfirm = useCallback((opts) => {
        if (!opts) return;
        setConfirm({
            title: opts.title ?? '',
            message: opts.message ?? '',
            confirmLabel: opts.confirmLabel ?? 'OK',
            cancelLabel: opts.cancelLabel ?? 'Cancel',
            destructive: !!opts.destructive,
            onConfirm: opts.onConfirm,
            onCancel: opts.onCancel,
        });
    }, []);

    const handleConfirm = useCallback(() => {
        const fn = confirm?.onConfirm;
        setConfirm(null);
        fn?.();
    }, [confirm]);

    const handleCancel = useCallback(() => {
        const fn = confirm?.onCancel;
        setConfirm(null);
        fn?.();
    }, [confirm]);

    const value = useMemo(
        () => ({ showToast, hideToast, showConfirm }),
        [showToast, hideToast, showConfirm]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <AppToast toast={toast} theme={theme} topInset={insets.top + 10} onDismiss={hideToast} />
            <AppConfirmDialog
                visible={!!confirm}
                config={confirm}
                theme={theme}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
}
