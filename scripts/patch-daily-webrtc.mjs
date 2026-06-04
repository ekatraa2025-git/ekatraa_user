/**
 * Guards Daily WebRTC MediaDevices when NativeModules.WebRTCModule is not ready
 * (Expo Go, or RN New Architecture lazy native init). Prevents startup crash:
 * "Cannot read property 'startMediaDevicesEventMonitor' of null"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const candidates = [
  path.join(root, 'node_modules/@daily-co/react-native-webrtc/lib/commonjs/MediaDevices.js'),
  path.join(root, 'node_modules/@daily-co/react-native-webrtc/lib/module/MediaDevices.js'),
];

const original = 'WebRTCModule.startMediaDevicesEventMonitor();';
const patched = `if (WebRTCModule?.startMediaDevicesEventMonitor) {
      WebRTCModule.startMediaDevicesEventMonitor();
    }`;

let changed = 0;
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('WebRTCModule?.startMediaDevicesEventMonitor')) {
    console.log(`patch-daily-webrtc: already patched ${path.basename(file)}`);
    continue;
  }
  if (!src.includes(original)) {
    console.warn(`patch-daily-webrtc: pattern not found in ${file}`);
    continue;
  }
  fs.writeFileSync(file, src.replace(original, patched));
  changed += 1;
  console.log(`patch-daily-webrtc: patched ${path.basename(file)}`);
}

if (changed === 0) {
  console.warn('patch-daily-webrtc: no files patched (install @daily-co/react-native-webrtc first)');
}
