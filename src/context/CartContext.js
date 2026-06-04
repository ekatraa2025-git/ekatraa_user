import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, useBackendApi } from '../services/api';
import { useAuth } from './AuthContext';

const CartContext = createContext(undefined);

/** Legacy id-only persistence (migrate to JSON pair below). */
const CART_ID_KEY = 'ekatraa_cart_id';
/** Structured cart id + anon `carts.session_id` for authenticated GET parity with Mastra tooling. */
const CART_PAIR_KEY = 'ekatraa_cart_proof_v1';

async function persistCartPair(id, anonSession) {
    if (!id) {
        await AsyncStorage.multiRemove([CART_ID_KEY, CART_PAIR_KEY]);
        return;
    }
    const pair = JSON.stringify({
        cartId: id,
        anonSession: anonSession != null && String(anonSession).trim() ? String(anonSession).trim() : null,
    });
    await AsyncStorage.multiSet([
        [CART_ID_KEY, id],
        [CART_PAIR_KEY, pair],
    ]);
}

/** @param {[string,string|null][]} args */
async function hydrateFromStorage(callback) {
    try {
        const entries = await AsyncStorage.multiGet([CART_PAIR_KEY, CART_ID_KEY]);
        const pairRaw = entries[0]?.[1];
        const legacyId = entries[1]?.[1];
        let cartIdResolved = null;
        let anonSessionResolved = null;
        if (pairRaw) {
            try {
                const j = JSON.parse(pairRaw);
                if (j && typeof j.cartId === 'string' && j.cartId) {
                    cartIdResolved = j.cartId;
                    anonSessionResolved =
                        typeof j.anonSession === 'string' && j.anonSession.trim() ? j.anonSession.trim() : null;
                }
            } catch {
                /* ignore corrupt */
            }
        }
        if (!cartIdResolved && legacyId) {
            cartIdResolved = legacyId;
            anonSessionResolved = null;
        }
        await callback({ cartId: cartIdResolved, anonSession: anonSessionResolved });
    } catch {
        await callback({ cartId: null, anonSession: null });
    }
}

export function CartProvider({ children }) {
    const [cartId, setCartIdState] = useState(null);
    const [cartOwnerAnonSession, setCartOwnerAnonSessionState] = useState(null);
    const [cartItemCount, setCartItemCount] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const useApi = useBackendApi();
    const { session } = useAuth();

    useEffect(() => {
        hydrateFromStorage(async ({ cartId: cid, anonSession }) => {
            setCartIdState(cid);
            setCartOwnerAnonSessionState(anonSession);
            setLoaded(true);
        });
    }, []);

    const refreshCartCount = useCallback(
        async (overrideId) => {
            const cid = overrideId || cartId;
            const accessToken = session?.access_token || null;
            if (!useApi || !cid) {
                setCartItemCount(0);
                return;
            }
            try {
                const { data, error } = await api.getCart(cid, {
                    cartOwnerSession: cartOwnerAnonSession,
                    accessToken,
                });
                if (error) {
                    if (String(error.message || '').includes('403') || /forbidden/i.test(String(error.message || ''))) {
                        setCartItemCount(0);
                        await persistCartPair(null);
                        setCartIdState(null);
                        setCartOwnerAnonSessionState(null);
                        return;
                    }
                    setCartItemCount(0);
                    return;
                }
                setCartItemCount(Array.isArray(data?.items) ? data.items.length : 0);
            } catch {
                setCartItemCount(0);
            }
        },
        [useApi, cartId, cartOwnerAnonSession, session?.access_token]
    );

    useEffect(() => {
        if (!loaded || !useApi || !cartId) return;
        void refreshCartCount();
    }, [loaded, cartId, useApi, refreshCartCount]);

    /**
     * Persist active cart id. Pass `anonSession` when creating an anonymous cart (must match backend `session_id`).
     * When omitting anonSession while changing cart id (unknown session), clears stored anon anchor.
     */
    const setCartId = useCallback(async (id, anonSessionArg) => {
        const uid = typeof id === 'string' && id.trim() ? id.trim() : null;
        let nextSession = typeof anonSessionArg === 'string' && anonSessionArg.trim() ? anonSessionArg.trim() : null;
        /* Second arg intentionally omitted → keep anon session only if cart id unchanged (same device cart). */
        if (uid && anonSessionArg === undefined && cartId === uid) {
            nextSession = cartOwnerAnonSession;
        }
        /* New id without anchor → drop stale anon marker (logged-in carts still work with Bearer). */
        if (uid && anonSessionArg === undefined && cartId !== uid) {
            nextSession = null;
        }

        setCartIdState(uid);
        setCartOwnerAnonSessionState(nextSession);

        if (!uid) {
            await persistCartPair(null);
            setCartItemCount(0);
            return;
        }
        await persistCartPair(uid, nextSession);
    }, [cartId, cartOwnerAnonSession]);

    const clearCart = useCallback(async () => {
        setCartIdState(null);
        setCartOwnerAnonSessionState(null);
        setCartItemCount(0);
        await persistCartPair(null);
    }, []);

    return (
        <CartContext.Provider
            value={{
                cartId,
                cartOwnerAnonSession,
                setCartId,
                cartItemCount,
                setCartItemCount,
                refreshCartCount,
                clearCart,
            }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within a CartProvider');
    return context;
}
