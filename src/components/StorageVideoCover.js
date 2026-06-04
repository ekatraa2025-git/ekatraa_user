import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/**
 * Looped muted autoplay for WebM/MP4 from signed URLs.
 * On decode/playback failure (e.g. WebM on some iOS builds), shows fallbackImageUri when provided.
 */
export function StorageVideoCover({ uri, fallbackImageUri, style, resizeMode = 'cover' }) {
    const u = String(uri || '').trim();
    const [failed, setFailed] = useState(false);
    const fallback = String(fallbackImageUri || '').trim();
    const contentFit = resizeMode === 'cover' ? 'cover' : 'contain';

    const player = useVideoPlayer(failed || !u ? null : u, (p) => {
        p.loop = true;
        p.muted = true;
    });

    useEffect(() => {
        setFailed(false);
    }, [u]);

    useEffect(() => {
        if (!player || failed || !u) return;
        player.play();
        const sub = player.addListener('statusChange', ({ error }) => {
            if (error && fallback) setFailed(true);
        });
        return () => sub.remove();
    }, [player, failed, u, fallback]);

    if (!u) return null;
    if (failed && fallback) {
        return <Image source={{ uri: fallback }} style={style} resizeMode={contentFit} />;
    }
    return (
        <VideoView
            player={player}
            style={style}
            contentFit={contentFit}
            nativeControls={false}
        />
    );
}
