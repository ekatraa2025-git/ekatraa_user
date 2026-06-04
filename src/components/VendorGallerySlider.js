import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FALLBACK_AVATAR = 'https://ui-avatars.com/api/?name=Vendor&background=FF4117&color=fff&size=400';

function VendorGallerySlider({
    imageUris,
    height = 170,
    borderRadius = 14,
    showDots = true,
    autoSlide = false,
    autoSlideIntervalMs = 2800,
    placeholderColor = '#E5E7EB',
    placeholderIconColor = '#94A3B8',
    containerStyle,
    imageStyle,
    fallbackUri = FALLBACK_AVATAR,
}) {
    const images = useMemo(
        () => (Array.isArray(imageUris) ? imageUris.filter(Boolean) : []),
        [imageUris]
    );
    // Per-image error state — when a URL fails to load (private bucket, expired
    // signed URL, network blip) we swap it for the supplied fallback so the
    // card never renders a broken-image gap. Keyed on the URL itself so the
    // map survives re-renders that don't change the slide contents.
    const [errored, setErrored] = useState({});
    const handleError = useCallback((uri) => {
        setErrored((prev) => (prev[uri] ? prev : { ...prev, [uri]: true }));
    }, []);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sliderWidth, setSliderWidth] = useState(0);
    const scrollRef = useRef(null);

    const onLayout = useCallback((event) => {
        const nextWidth = Math.round(event?.nativeEvent?.layout?.width || 0);
        if (nextWidth > 0 && nextWidth !== sliderWidth) {
            setSliderWidth(nextWidth);
        }
    }, [sliderWidth]);

    const handleMomentumEnd = useCallback((event) => {
        if (!sliderWidth) return;
        const x = event?.nativeEvent?.contentOffset?.x || 0;
        const idx = Math.max(0, Math.min(images.length - 1, Math.round(x / sliderWidth)));
        setCurrentIndex(idx);
    }, [images.length, sliderWidth]);

    useEffect(() => {
        if (!autoSlide || images.length < 2 || sliderWidth <= 0) return undefined;
        const timer = setInterval(() => {
            setCurrentIndex((prev) => {
                const next = (prev + 1) % images.length;
                scrollRef.current?.scrollTo({ x: next * sliderWidth, y: 0, animated: true });
                return next;
            });
        }, autoSlideIntervalMs);
        return () => clearInterval(timer);
    }, [autoSlide, autoSlideIntervalMs, images.length, sliderWidth]);

    if (images.length === 0) {
        return (
            <View
                style={[
                    styles.placeholder,
                    {
                        height,
                        borderRadius,
                        backgroundColor: placeholderColor,
                    },
                    containerStyle,
                ]}
            >
                <Ionicons name="images-outline" size={22} color={placeholderIconColor} />
            </View>
        );
    }

    return (
        <View
            style={[
                styles.wrap,
                { height, borderRadius },
                containerStyle,
            ]}
            onLayout={onLayout}
        >
            {sliderWidth > 0 ? (
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleMomentumEnd}
                    contentContainerStyle={styles.scrollContent}
                >
                    {images.map((item, idx) => {
                        const resolved = errored[item] && fallbackUri ? fallbackUri : item;
                        return (
                            <Image
                                key={`${item}-${idx}`}
                                source={{ uri: resolved }}
                                style={[
                                    styles.image,
                                    { width: sliderWidth, height, borderRadius },
                                    imageStyle,
                                ]}
                                resizeMode="cover"
                                onError={() => handleError(item)}
                            />
                        );
                    })}
                </ScrollView>
            ) : null}

            {showDots && images.length > 1 ? (
                <View style={styles.dotsWrap} pointerEvents="none">
                    {images.map((_, idx) => (
                        <View
                            key={`dot-${idx}`}
                            style={[
                                styles.dot,
                                idx === currentIndex ? styles.dotActive : styles.dotInactive,
                            ]}
                        />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        backgroundColor: '#E5E7EB',
    },
    scrollContent: {
        alignItems: 'stretch',
    },
    placeholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotsWrap: {
        position: 'absolute',
        bottom: 8,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    dotActive: {
        backgroundColor: '#FFFFFF',
        opacity: 0.95,
    },
    dotInactive: {
        backgroundColor: 'rgba(255,255,255,0.55)',
    },
});

export default memo(VendorGallerySlider);
