import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { DriverProfileDto, OfferDto, OrderDto } from '@yaar/shared';
import { errorMessage, isApiError } from '../lib/api';
import { formatOrderNumber } from '../lib/format';
import { useDriverLocationTracking, type TrackedPosition } from '../hooks/useDriverLocationTracking';
import { useApi } from './auth';
import { useSocketEvent } from './socket';

interface DriverContextValue {
  /** undefined = chargement ; null = pas encore de dossier (onboarding). */
  profile: DriverProfileDto | null | undefined;
  profileError: string | null;
  currentOrder: OrderDto | null;
  /** Message affiché quand la course en cours a été annulée ou réaffectée par Yaar. */
  orderNotice: string | null;
  clearOrderNotice: () => void;
  offers: OfferDto[];
  gpsActive: boolean;
  /** En ligne mais application en arrière-plan : la position n'est plus transmise. */
  gpsPaused: boolean;
  gpsError: string | null;
  position: TrackedPosition | null;
  togglingOnline: boolean;
  setOnline: (online: boolean) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  refreshCurrentOrder: () => Promise<void>;
  refreshOffers: () => Promise<void>;
  setProfile: (p: DriverProfileDto) => void;
  removeOffer: (offerId: string) => void;
  setCurrentOrder: (o: OrderDto | null) => void;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export function DriverProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [profile, setProfile] = useState<DriverProfileDto | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [currentOrder, setCurrentOrderState] = useState<OrderDto | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const currentOrderRef = useRef<OrderDto | null>(null);
  /** Statut CANCELLED reçu par socket pour la course en cours (affine le message). */
  const cancelledIdRef = useRef<string | null>(null);

  const setCurrentOrder = useCallback((o: OrderDto | null) => {
    currentOrderRef.current = o;
    setCurrentOrderState(o);
  }, []);
  const [offers, setOffers] = useState<OfferDto[]>([]);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await api.driverProfile());
      setProfileError(null);
    } catch (e) {
      if (isApiError(e, 'NOT_FOUND')) setProfile(null);
      else setProfileError(errorMessage(e));
    }
  }, [api]);

  const refreshCurrentOrder = useCallback(async () => {
    try {
      const { order } = await api.currentOrder();
      const prev = currentOrderRef.current;
      if (prev && order?.id !== prev.id) {
        // La course a disparu sans que ce livreur la livre : annulée ou réaffectée par le back-office.
        const num = formatOrderNumber(prev.number);
        setOrderNotice(
          cancelledIdRef.current === prev.id
            ? `La course ${num} a été annulée par Yaar. Ne vous rendez pas au point de retrait.`
            : `La course ${num} a été annulée ou réaffectée par Yaar.`,
        );
      }
      cancelledIdRef.current = null;
      setCurrentOrder(order);
    } catch {
      /* hors ligne réseau : on garde l'état courant */
    }
  }, [api, setCurrentOrder]);

  const refreshOffers = useCallback(async () => {
    try {
      setOffers(await api.driverOffers());
    } catch {
      /* idem */
    }
  }, [api]);

  const approved = profile?.status === 'APPROVED';

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!approved) return;
    void refreshCurrentOrder();
    void refreshOffers();
  }, [approved, refreshCurrentOrder, refreshOffers]);

  // Retour au premier plan : on resynchronise tout (le statut KYC n'a pas d'événement temps réel).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void refreshProfile();
        void refreshCurrentOrder();
        void refreshOffers();
      }
    });
    return () => sub.remove();
  }, [refreshProfile, refreshCurrentOrder, refreshOffers]);

  useSocketEvent('offer.new', (offer) => {
    setOffers((prev) => [offer, ...prev.filter((o) => o.id !== offer.id)]);
  });
  useSocketEvent('offer.closed', (e) => {
    setOffers((prev) => prev.filter((o) => o.id !== e.offerId));
  });
  useSocketEvent('driver.status', () => {
    void refreshProfile();
  });
  useSocketEvent('order.updated', (e) => {
    if (e.status === 'CANCELLED' && e.orderId === currentOrderRef.current?.id) cancelledIdRef.current = e.orderId;
    void refreshCurrentOrder();
  });

  const online = profile?.isOnline === true;
  const tracking = useDriverLocationTracking({
    online,
    onDelivery: currentOrder !== null,
    send: (ping) => api.sendLocation(ping),
    isOfflineError: (e) => isApiError(e, 'DRIVER_OFFLINE'),
    onStopped: () => {
      void refreshProfile();
    },
  });

  const setOnline = useCallback(
    async (wantOnline: boolean): Promise<string | null> => {
      setTogglingOnline(true);
      try {
        let coords: { lat: number; lng: number } | undefined;
        if (wantOnline) {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (!perm.granted) return 'Autorisez la localisation pour passer en ligne.';
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          } catch {
            coords = undefined;
          }
        }
        const updated = await api.setAvailability({ online: wantOnline, ...(coords ?? {}) });
        setProfile(updated);
        if (!wantOnline) setOffers([]);
        else void refreshOffers();
        return null;
      } catch (e) {
        return errorMessage(e);
      } finally {
        setTogglingOnline(false);
      }
    },
    [api, refreshOffers],
  );

  const clearOrderNotice = useCallback(() => setOrderNotice(null), []);

  const removeOffer = useCallback((offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  }, []);

  const value = useMemo<DriverContextValue>(
    () => ({
      profile,
      profileError,
      currentOrder,
      orderNotice,
      clearOrderNotice,
      offers,
      gpsActive: tracking.active,
      gpsPaused: tracking.paused,
      gpsError: tracking.error,
      position: tracking.position,
      togglingOnline,
      setOnline,
      refreshProfile,
      refreshCurrentOrder,
      refreshOffers,
      setProfile,
      removeOffer,
      setCurrentOrder,
    }),
    [
      profile,
      profileError,
      currentOrder,
      orderNotice,
      clearOrderNotice,
      offers,
      tracking.active,
      tracking.paused,
      tracking.error,
      tracking.position,
      togglingOnline,
      setOnline,
      refreshProfile,
      refreshCurrentOrder,
      refreshOffers,
      removeOffer,
      setCurrentOrder,
    ],
  );

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
}

export function useDriver(): DriverContextValue {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver doit être utilisé dans <DriverProvider>');
  return ctx;
}
