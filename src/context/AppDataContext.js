import React, { createContext, useContext, useState, useCallback } from 'react';
import { api, useBackendApi } from '../services/api';
import { dbService, resolveStorageUrl } from '../services/supabase';

const CACHE_TTL_MS = 7 * 60 * 1000; // 7 minutes — fewer repeat fetches when moving between screens

const AppDataContext = createContext(undefined);

async function normalizeOccasions(raw = []) {
    return Promise.all(
        raw.map(async (t) => {
            const imagePath = t?.image_url || t?.icon_url || null;
            const resolvedImage = imagePath ? await resolveStorageUrl(imagePath) : null;
            const videoPath = t?.video_url || null;
            const resolvedVideo = videoPath ? await resolveStorageUrl(videoPath) : null;
            return {
                ...t,
                image_url: resolvedImage || imagePath,
                video_url: resolvedVideo || videoPath || null,
            };
        })
    );
}

function hasUnresolvedOccasionImage(occasion) {
    const image = occasion?.image_url;
    return !!image && typeof image === 'string' && !/^https?:\/\//i.test(image);
}

function hasUnresolvedOccasionVideo(occasion) {
    const v = occasion?.video_url;
    return !!v && typeof v === 'string' && !/^https?:\/\//i.test(v);
}

function hasUsableOccasionImage(occasion) {
    const image = occasion?.image_url;
    return typeof image === 'string' && image.trim().length > 0;
}

function hasUsableOccasionVideo(occasion) {
    const v = occasion?.video_url;
    return typeof v === 'string' && v.trim().length > 0;
}

export function AppDataProvider({ children }) {
    const [occasions, setOccasions] = useState([]);
    const [occasionsLoadedAt, setOccasionsLoadedAt] = useState(null);
    const [categoriesCache, setCategoriesCache] = useState({});
    const [banners, setBanners] = useState([]);
    const [bannersLoadedAt, setBannersLoadedAt] = useState(null);
    const useApi = useBackendApi();

    const isStale = (loadedAt) => !loadedAt || Date.now() - loadedAt > CACHE_TTL_MS;

    const getOccasions = useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && occasions.length > 0 && !isStale(occasionsLoadedAt)) {
            if (occasions.some(hasUnresolvedOccasionImage) || occasions.some(hasUnresolvedOccasionVideo)) {
                const normalizedCached = await normalizeOccasions(occasions);
                setOccasions(normalizedCached);
                return normalizedCached;
            }
            if (occasions.some(hasUsableOccasionImage) || occasions.some(hasUsableOccasionVideo)) {
                return occasions;
            }
        }
        try {
            if (useApi) {
                const occRes = await api.getOccasions();
                let occData = occRes?.data;
                if (!Array.isArray(occData) || occData.length === 0) {
                    const etRes = await api.getEventTypes();
                    occData = etRes?.data;
                }
                if (Array.isArray(occData) && occData.length > 0) {
                    const filtered = occData.filter(t => t.id !== 'all' && t.id !== 'others');
                    const finalRaw = filtered.length ? filtered : occData;
                    const final = await normalizeOccasions(finalRaw);
                    setOccasions(final);
                    setOccasionsLoadedAt(Date.now());
                    return final;
                }
            }
            const res = await dbService.getOccasions?.();
            const data = res?.data;
            if (Array.isArray(data) && data.length > 0) {
                const filtered = data.filter(t => t.id !== 'all' && t.id !== 'others');
                const finalRaw = filtered.length ? filtered : data;
                const final = await normalizeOccasions(finalRaw);
                setOccasions(final);
                setOccasionsLoadedAt(Date.now());
                return final;
            }
        } catch (e) {
            console.log('[AppData] getOccasions error:', e?.message);
        }
        return occasions.length > 0 ? occasions : [];
    }, [useApi, occasions, occasionsLoadedAt]);

    const getCategories = useCallback(async (occasionId, forceRefresh = false) => {
        if (!occasionId) return [];
        const cached = categoriesCache[occasionId];
        if (!forceRefresh && cached?.data?.length > 0 && !isStale(cached.loadedAt)) {
            return cached.data;
        }
        try {
            if (useApi) {
                const { data } = await api.getCategories(occasionId);
                if (Array.isArray(data) && data.length > 0) {
                    setCategoriesCache(prev => ({
                        ...prev,
                        [occasionId]: { data, loadedAt: Date.now() },
                    }));
                    return data;
                }
            }
            const res = await dbService.getCategoriesByOccasion?.(occasionId);
            const data = res?.data;
            if (Array.isArray(data) && data.length > 0) {
                setCategoriesCache(prev => ({
                    ...prev,
                    [occasionId]: { data, loadedAt: Date.now() },
                }));
                return data;
            }
        } catch (e) {
            console.log('[AppData] getCategories error:', e?.message);
        }
        return cached?.data || [];
    }, [useApi, categoriesCache]);

    const getBanners = useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && banners.length > 0 && !isStale(bannersLoadedAt)) {
            return banners;
        }
        try {
            if (useApi) {
                const { data } = await api.getBanners();
                if (Array.isArray(data) && data.length > 0) {
                    setBanners(data);
                    setBannersLoadedAt(Date.now());
                    return data;
                }
            }
            const res = await dbService.getBanners?.();
            const data = res?.data;
            if (Array.isArray(data) && data.length > 0) {
                setBanners(data);
                setBannersLoadedAt(Date.now());
                return data;
            }
        } catch (e) {
            console.log('[AppData] getBanners error:', e?.message);
        }
        return banners.length > 0 ? banners : [];
    }, [useApi, banners, bannersLoadedAt]);

    const invalidateCache = useCallback(() => {
        setOccasionsLoadedAt(null);
        setCategoriesCache({});
        setBannersLoadedAt(null);
    }, []);

    return (
        <AppDataContext.Provider value={{
            occasions,
            banners,
            getOccasions,
            getCategories,
            getBanners,
            invalidateCache,
        }}>
            {children}
        </AppDataContext.Provider>
    );
}

export function useAppData() {
    const context = useContext(AppDataContext);
    if (!context) throw new Error('useAppData must be used within AppDataProvider');
    return context;
}
