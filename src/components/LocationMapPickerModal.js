import React, { useEffect, useState } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

function buildMapHtml(apiKey) {
    const k = apiKey.replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://maps.googleapis.com https://maps.gstatic.com; script-src 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: https: blob:; connect-src https://maps.googleapis.com;"/>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,sans-serif; background: #0f172a; }
    #search {
      width: 100%; padding: 14px 16px; font-size: 16px; border: none;
      border-bottom: 2px solid #FF7A00; background: #fff; color: #111;
    }
    #map { height: calc(100vh - 152px); width: 100%; }
    #foot { padding: 12px; background: linear-gradient(180deg,#1e293b,#0f172a); }
    #confirm {
      width: 100%; padding: 16px; background: #FF7A00; color: #fff; border: none;
      border-radius: 12px; font-weight: 800; font-size: 16px;
    }
    .hint { color: #94a3b8; font-size: 12px; padding: 8px 12px 0; }
  </style>
</head>
<body>
  <input id="search" type="text" placeholder="Search area, landmark, or address" autocomplete="off"/>
  <div class="hint">Tap map to drop pin · Drag pin to adjust</div>
  <div id="map"></div>
  <div id="foot">
    <button id="confirm" type="button">Use this location</button>
  </div>
  <script>
    function sendPayload(lat, lng, address) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'picked',
          lat: lat,
          lng: lng,
          address: address || ''
        }));
      } catch (e) {}
    }
    function initMap() {
      var geocoder = new google.maps.Geocoder();
      var map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 20.2961, lng: 85.8245 },
        zoom: 13,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
      });
      var marker = new google.maps.Marker({
        map: map,
        draggable: true,
        position: map.getCenter(),
        animation: google.maps.Animation.DROP,
      });
      var input = document.getElementById('search');
      var autocomplete = new google.maps.places.Autocomplete(input);
      autocomplete.bindTo('bounds', map);
      autocomplete.addListener('place_changed', function () {
        var place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else {
          map.setCenter(place.geometry.location);
          map.setZoom(16);
        }
        marker.setPosition(place.geometry.location);
      });
      map.addListener('click', function (e) {
        marker.setPosition(e.latLng);
      });
      document.getElementById('confirm').onclick = function () {
        var p = marker.getPosition();
        if (!p) return;
        geocoder.geocode({ location: p }, function (results, status) {
          var addr = (status === 'OK' && results[0]) ? results[0].formatted_address : '';
          sendPayload(p.lat(), p.lng(), addr);
        });
      };
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${k}&libraries=places&callback=initMap" async defer></script>
</body>
</html>`;
}

/**
 * Full-screen map + Places search. Key loaded from backend GET /api/public/config/maps.
 */
export default function LocationMapPickerModal({ visible, onClose, onConfirm }) {
    const { theme } = useTheme();
    const [html, setHtml] = useState(null);
    const [loadErr, setLoadErr] = useState(null);

    useEffect(() => {
        let cancelled = false;
        if (!visible) {
            setHtml(null);
            setLoadErr(null);
            return;
        }
        (async () => {
            const { data, error } = await api.getMapsConfig();
            if (cancelled) return;
            if (error || !data?.googleMapsApiKey) {
                setLoadErr(error?.message || 'Map key not configured on server.');
                setHtml(null);
                return;
            }
            setHtml(buildMapHtml(data.googleMapsApiKey));
            setLoadErr(null);
        })();
        return () => {
            cancelled = true;
        };
    }, [visible]);

    const onMessage = (e) => {
        try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'picked' && msg.lat != null && msg.lng != null) {
                onConfirm?.({
                    latitude: msg.lat,
                    longitude: msg.lng,
                    address: msg.address || '',
                });
                onClose?.();
            }
        } catch {
            /* ignore */
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
            <View style={[styles.wrap, { backgroundColor: theme.background }]}>
                <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close" size={28} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: theme.text }]}>Pick location on map</Text>
                    <View style={{ width: 40 }} />
                </View>
                {loadErr ? (
                    <View style={styles.centered}>
                        <Ionicons name="map-outline" size={48} color={theme.textLight} />
                        <Text style={[styles.err, { color: theme.text }]}>{loadErr}</Text>
                    </View>
                ) : !html ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={theme.primary || '#FF7A00'} />
                        <Text style={[styles.loading, { color: theme.textLight }]}>Loading map…</Text>
                    </View>
                ) : (
                    <WebView
                        source={{ html, baseUrl: 'https://maps.googleapis.com' }}
                        style={styles.web}
                        onMessage={onMessage}
                        javaScriptEnabled
                        domStorageEnabled
                        geolocationEnabled
                        mixedContentMode="always"
                        originWhitelist={['*']}
                        allowsInlineMediaPlayback
                        setSupportMultipleWindows={false}
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    wrap: { flex: 1 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 8 : 12,
        paddingBottom: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
    },
    closeBtn: { padding: 8 },
    title: { fontSize: 17, fontWeight: '800' },
    web: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    loading: { marginTop: 12, fontSize: 14 },
    err: { marginTop: 16, textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
