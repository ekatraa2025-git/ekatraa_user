import { Platform } from 'react-native';
import Constants from 'expo-constants';

let Notifications = null;
let notificationsAvailable = false;
let notificationsConfigured = false;

function loadNotificationsModule() {
    if (Notifications !== null || notificationsAvailable) return;
    // Expo Go SDK 53+ does not support remote push notifications.
    if (Constants.appOwnership === 'expo') {
        Notifications = null;
        notificationsAvailable = false;
        return;
    }
    try {
        if (typeof require !== 'undefined') {
            Notifications = require('expo-notifications');
            notificationsAvailable = true;
        }
    } catch {
        Notifications = null;
        notificationsAvailable = false;
    }
}

export function canUseAppNotifications() {
    loadNotificationsModule();
    return !!notificationsAvailable && !!Notifications;
}

export async function configureAppNotifications() {
    if (!canUseAppNotifications() || notificationsConfigured) return false;
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF4117',
                sound: 'default',
            });
        }
        notificationsConfigured = true;
        return true;
    } catch (e) {
        console.warn('[appNotifications] configure failed', e);
        return false;
    }
}

export async function requestNotificationPermission() {
    if (!canUseAppNotifications()) return false;
    try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status === 'granted') return true;
        const asked = await Notifications.requestPermissionsAsync();
        return asked.status === 'granted';
    } catch (e) {
        console.warn('[appNotifications] permission failed', e);
        return false;
    }
}

export async function getExpoPushToken() {
    if (!canUseAppNotifications()) return null;
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return null;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        return tokenData?.data || null;
    } catch (e) {
        console.warn('[appNotifications] token failed', e);
        return null;
    }
}

export async function notifyWithAlertSound({ title, message, data = {} }) {
    if (!canUseAppNotifications()) return false;
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: title || 'Ekatraa',
                body: message || '',
                data,
                sound: 'default',
            },
            trigger: null,
        });
        return true;
    } catch (e) {
        console.warn('[appNotifications] schedule failed', e);
        return false;
    }
}
