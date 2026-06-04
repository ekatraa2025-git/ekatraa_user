import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { api } from '../services/api';
import {
    fetchUserNotifications,
    setupUserNotificationSubscription,
    setupUserOrderStatusSubscription,
    markUserNotificationRead,
    markAllUserNotificationsRead,
} from '../lib/userNotifications';
import {
    configureAppNotifications,
    getExpoPushToken,
    notifyWithAlertSound,
    requestNotificationPermission,
} from '../lib/appNotifications';

const UserNotificationContext = createContext({
    notifications: [],
    unreadCount: 0,
    loading: true,
    refreshNotifications: async () => {},
    markAsRead: async () => {},
    markAllAsRead: async () => {},
});

export function UserNotificationProvider({ children }) {
    const { user, session } = useAuth();
    const { showToast } = useToast();
    const userId = user?.id ?? null;

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const recentEventRef = useRef(new Map());
    const pushTokenSyncRef = useRef({ token: null, userId: null });

    const markRecentEvent = useCallback((key) => {
        if (!key) return false;
        const now = Date.now();
        const prev = recentEventRef.current.get(key);
        if (prev && now - prev < 6000) return true;
        recentEventRef.current.set(key, now);
        if (recentEventRef.current.size > 100) {
            const staleBefore = now - 60000;
            recentEventRef.current.forEach((ts, k) => {
                if (ts < staleBefore) recentEventRef.current.delete(k);
            });
        }
        return false;
    }, []);

    const announceNotification = useCallback(
        async ({ title, message, type, data }) => {
            if (!title && !message) return;
            const variant = type === 'order_status' || type === 'order_invoice' ? 'success' : 'info';
            showToast({
                variant,
                title: title || 'Ekatraa',
                message: message || '',
                duration: 4500,
            });
            await notifyWithAlertSound({ title, message, data });
        },
        [showToast]
    );

    const loadNotifications = useCallback(async () => {
        if (!userId) {
            setNotifications([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const rows = await fetchUserNotifications(userId);
            setNotifications(rows);
        } catch (e) {
            console.warn('[UserNotificationContext] load', e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    useEffect(() => {
        if (!userId) return undefined;

        const unsubscribeInsert = setupUserNotificationSubscription(userId, (row) => {
            setNotifications((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
            const eventKey = `notif:${row.id}`;
            if (!markRecentEvent(eventKey)) {
                announceNotification({
                    title: row.title,
                    message: row.message,
                    type: row.type,
                    data: row.data || {},
                }).catch(() => {});
            }
        });

        const unsubscribeOrderUpdates = setupUserOrderStatusSubscription(userId, ({ orderId, status, previousStatus }) => {
            const eventKey = `order:${orderId}:${status}`;
            if (status === previousStatus || markRecentEvent(eventKey)) return;
            announceNotification({
                title: 'Order status updated',
                message: `Your order ${String(orderId).slice(0, 8)}… is now ${String(status).replace('_', ' ')}.`,
                type: 'order_status',
                data: { order_id: orderId, status, previous_status: previousStatus },
            }).catch(() => {});
        });

        return () => {
            unsubscribeInsert();
            unsubscribeOrderUpdates();
        };
    }, [userId, markRecentEvent, announceNotification]);

    useEffect(() => {
        configureAppNotifications().catch(() => {});
        requestNotificationPermission().catch(() => {});
    }, []);

    useEffect(() => {
        if (!userId || !session?.access_token) return;
        let cancelled = false;
        (async () => {
            try {
                await configureAppNotifications();
                const granted = await requestNotificationPermission();
                if (!granted || cancelled) return;
                const expoPushToken = await getExpoPushToken();
                if (!expoPushToken || cancelled) return;
                const alreadySynced =
                    pushTokenSyncRef.current.token === expoPushToken && pushTokenSyncRef.current.userId === userId;
                if (alreadySynced) return;
                const { error } = await api.registerPushToken(expoPushToken, session.access_token, Platform.OS);
                if (!cancelled && !error) {
                    pushTokenSyncRef.current = { token: expoPushToken, userId };
                }
            } catch (e) {
                console.warn('[UserNotificationContext] push sync', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId, session?.access_token]);

    const markAsRead = useCallback(
        async (id) => {
            await markUserNotificationRead(id);
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        },
        []
    );

    const markAllAsRead = useCallback(async () => {
        if (!userId) return;
        await markAllUserNotificationsRead(userId);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }, [userId]);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const value = useMemo(
        () => ({
            notifications,
            unreadCount,
            loading,
            refreshNotifications: loadNotifications,
            markAsRead,
            markAllAsRead,
        }),
        [notifications, unreadCount, loading, loadNotifications, markAsRead, markAllAsRead]
    );

    return <UserNotificationContext.Provider value={value}>{children}</UserNotificationContext.Provider>;
}

export function useUserNotifications() {
    return useContext(UserNotificationContext);
}
