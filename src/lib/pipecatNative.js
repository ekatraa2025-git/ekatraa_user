import { NativeModules } from 'react-native';
import Constants from 'expo-constants';

const NATIVE_WAIT_MS = 10000;
const NATIVE_POLL_MS = 150;

function getNativeModule(name) {
    const direct = NativeModules[name];
    if (direct) return direct;
    try {
        const { TurboModuleRegistry } = require('react-native');
        if (typeof TurboModuleRegistry?.get === 'function') {
            return TurboModuleRegistry.get(name) ?? null;
        }
    } catch {
        /* noop */
    }
    return null;
}

/** Expo Go cannot load Daily / WebRTC native code. */
export function isExpoGoClient() {
    return Constants.appOwnership === 'expo';
}

/** True when Daily WebRTC native code is linked in this binary. */
export function isPipecatNativeReady() {
    if (isExpoGoClient()) return false;
    const webRtc = getNativeModule('WebRTCModule');
    if (!webRtc) return false;
    return typeof webRtc.startMediaDevicesEventMonitor === 'function' || typeof webRtc.enumerateDevices === 'function';
}

/** RN New Architecture may register native modules shortly after JS starts. */
export async function waitForPipecatNative(timeoutMs = NATIVE_WAIT_MS) {
    if (isExpoGoClient()) return false;
    if (isPipecatNativeReady()) return true;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, NATIVE_POLL_MS));
        if (isPipecatNativeReady()) return true;
    }
    return isPipecatNativeReady();
}

export function pipecatNativeUnavailableMessage() {
    if (isExpoGoClient()) {
        return 'Live voice does not work in Expo Go. Run: npx expo run:android (or run:ios) to install the Daily WebRTC dev build.';
    }
    return 'Daily WebRTC is not in this app build. Run: npx expo prebuild --clean && npx expo run:android';
}

export async function loadPipecatVoiceClient() {
    if (isExpoGoClient()) {
        throw new Error(pipecatNativeUnavailableMessage());
    }

    const ready = await waitForPipecatNative();
    if (!ready) {
        throw new Error(pipecatNativeUnavailableMessage());
    }

    await import('react-native-url-polyfill/auto');

    const [{ PipecatClient }, { RNDailyTransport }] = await Promise.all([
        import('@pipecat-ai/client-js'),
        import('@pipecat-ai/react-native-daily-transport'),
    ]);

    return { PipecatClient, RNDailyTransport };
}
