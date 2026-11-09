import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { DriverProfileDto, OfferDto, OrderDto } from '@yaar/shared';
import { errorMessage, isApiError } from '../lib/api';
import { hasTrackingConsent } from '../lib/consent';
import { formatOrderNumber } from '../lib/format';
import { useDriverLocationTracking, type TrackedPosition } from '../hooks/useDriverLocationTracking';
import { useApi } from './auth';
import { POLL_MS } from '../lib/publicConfig';
import { saveDriverReadyDismissed } from '../lib/storage';
import { usePolling, useRealtimeMode, useSocketEvent } from './socket';

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
  /**
   * Dernier échec du passage en ligne (localisation refusée, véhicule bloqué…), y compris quand il a été
   * lancé depuis la fenêtre de consentement, déjà fermée : l'écran d'accueil l'affiche.
   */
  availabilityError: string | null;
  /**
   * Passe en ligne / hors ligne. Sans consentement au suivi GPS, ouvre d'abord la fenêtre de
   * consentement (et renvoie null) : le passage en ligne reprend une fois le consentement donné.
   */
  setOnline: (online: boolean) => Promise<string | null>;
  /** Fenêtre de consentement éclairé au suivi GPS visible. */
  consentPromptOpen: boolean;
  /** Ouvre la fenêtre de consentement (goOnlineAfter : passer en ligne après acceptation). */
  openConsentPrompt: (goOnlineAfter?: boolean) => void;
  dismissConsentPrompt: () => void;
  consentBusy: boolean;
  /** POST /driver/consent puis, si demandé, passage en ligne. Renvoie un message d'erreur ou null. */
  acceptTrackingConsent: () => Promise<string | null>;
  /** DELETE /driver/consent : hors ligne forcé, offres retirées. Renvoie un message d'erreur ou null. */
  withdrawTrackingConsent: () => Promise<string | null>;
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
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [consentPromptOpen, setConsentPromptOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  /** Passage en ligne demandé avant le consentement : on le reprend après acceptation. */
  const goOnlineAfterConsentRef = useRef(false);
  const profileRef = useRef<DriverProfileDto | null | undefined>(undefined);
  profileRef.current = profile;

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

  // « Vous êtes prêt ! » ne s'adresse qu'aux livreurs jamais passés en ligne : dès qu'un profil avec consentement au
  // suivi GPS est vu sur cet appareil (livreur déjà passé en ligne), c'est mémorisé pour ce livreur, et l'écran ne
  // revient plus, même après un retrait du consentement (DELETE /driver/consent).
  const consentedUserId = profile?.trackingConsentAt ? profile.userId : null;
  const consentSavedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!consentedUserId || consentSavedForRef.current === consentedUserId) return;
    consentSavedForRef.current = consentedUserId;
    void saveDriverReadyDismissed(consentedUserId);
  }, [consentedUserId]);

  useEffect(() => {
    if (!approved) return;
    void refreshCurrentOrder();
    void refreshOffers();
  }, [approved, refreshCurrentOrder, refreshOffers]);

  // Retour au premier plan : on resynchronise tout (le statut KYC n'a pas d'événement temps réel).
  // Mode poll : le planificateur relance déjà immédiatement chaque rafraîchissement actif au retour
  // (offres, course, profil) ; on ne double pas ces requêtes, sauf si le profil n'a jamais pu être lu.
  const realtimeMode = useRealtimeMode();
  const realtimeModeRef = useRef(realtimeMode);
  realtimeModeRef.current = realtimeMode;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (realtimeModeRef.current === 'poll' && profileRef.current !== undefined) return;
      void refreshProfile();
      void refreshCurrentOrder();
      void refreshOffers();
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

  // Mode poll (Vercel) : les requêtes REST remplacent offer.new / offer.closed / driver.status / order.updated.
  // Livreur en ligne sans course : GET /driver/offers toutes les pollIntervalMs (une offre qui disparaît
  // a été prise, a expiré ou a été retirée). En course : GET /driver/current-order toutes les 10 s.
  const onDelivery = currentOrder !== null;
  usePolling(
    () =>
      api.driverOffers().then(
        (list) => {
          setOffers(list);
          return true;
        },
        () => false,
      ),
    POLL_MS.driverOffers,
    approved && online && !onDelivery,
  );
  usePolling(
    async () => {
      await refreshCurrentOrder();
    },
    onDelivery ? POLL_MS.driverCurrentOrder : POLL_MS.driverProfile,
    approved && (online || onDelivery),
  );
  usePolling(() => refreshProfile(), POLL_MS.driverProfile, profile !== undefined);

  const tracking = useDriverLocationTracking({
    online,
    onDelivery: currentOrder !== null,
    send: (ping) => api.sendLocation(ping),
    isOfflineError: (e) => isApiError(e, 'DRIVER_OFFLINE'),
    onStopped: () => {
      void refreshProfile();
    },
  });

  const openConsentPrompt = useCallback((goOnlineAfter = false) => {
    goOnlineAfterConsentRef.current = goOnlineAfter;
    setConsentPromptOpen(true);
  }, []);

  const dismissConsentPrompt = useCallback(() => {
    goOnlineAfterConsentRef.current = false;
    setConsentPromptOpen(false);
  }, []);

  const changeAvailability = useCallback(
    async (wantOnline: boolean): Promise<string | null> => {
      setTogglingOnline(true);
      setAvailabilityError(null);
      try {
        let coords: { lat: number; lng: number } | undefined;
        if (wantOnline) {
          let granted = false;
          try {
            granted = (await Location.requestForegroundPermissionsAsync()).granted;
          } catch {
            granted = false; // navigateur sans géolocalisation (page hors HTTPS…)
          }
          if (!granted) {
            const msg = 'Autorisez la localisation pour passer en ligne (réglages du téléphone ou du navigateur).';
            setAvailabilityError(msg);
            return msg;
          }
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
        if (wantOnline && isApiError(e, 'CONSENT_REQUIRED')) {
          // Consentement retiré ailleurs (ou profil local périmé) : on redemande le consentement.
          setProfile((p) => (p ? { ...p, trackingConsentAt: null } : p));
          openConsentPrompt(true);
          return null;
        }
        const msg = errorMessage(e);
        setAvailabilityError(msg);
        return msg;
      } finally {
        setTogglingOnline(false);
      }
    },
    [api, refreshOffers, openConsentPrompt],
  );

  const setOnline = useCallback(
    async (wantOnline: boolean): Promise<string | null> => {
      if (wantOnline && !hasTrackingConsent(profileRef.current)) {
        openConsentPrompt(true);
        return null;
      }
      return changeAvailability(wantOnline);
    },
    [changeAvailability, openConsentPrompt],
  );

  const acceptTrackingConsent = useCallback(async (): Promise<string | null> => {
    setConsentBusy(true);
    try {
      const updated = await api.giveTrackingConsent();
      profileRef.current = updated;
      setProfile(updated);
      setConsentPromptOpen(false);
      const goOnline = goOnlineAfterConsentRef.current;
      goOnlineAfterConsentRef.current = false;
      return goOnline ? await changeAvailability(true) : null;
    } catch (e) {
      return errorMessage(e);
    } finally {
      setConsentBusy(false);
    }
  }, [api, changeAvailability]);

  const withdrawTrackingConsent = useCallback(async (): Promise<string | null> => {
    setConsentBusy(true);
    try {
      const updated = await api.withdrawTrackingConsent();
      profileRef.current = updated;
      setProfile(updated);
      setOffers([]);
      return null;
    } catch (e) {
      return errorMessage(e);
    } finally {
      setConsentBusy(false);
    }
  }, [api]);

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
      availabilityError,
      setOnline,
      consentPromptOpen,
      openConsentPrompt,
      dismissConsentPrompt,
      consentBusy,
      acceptTrackingConsent,
      withdrawTrackingConsent,
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
      availabilityError,
      setOnline,
      consentPromptOpen,
      openConsentPrompt,
      dismissConsentPrompt,
      consentBusy,
      acceptTrackingConsent,
      withdrawTrackingConsent,
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
