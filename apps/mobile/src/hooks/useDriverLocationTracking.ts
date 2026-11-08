import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { haversineKm } from '@yaar/shared';
import { shouldSendPing, toLocationPing } from '../lib/tracking';

export interface TrackedPosition {
  lat: number;
  lng: number;
  at: number;
  /** Cap du téléphone (0 = nord) quand il est connu (en mouvement), sinon null. */
  heading?: number | null;
}

export interface DriverTrackingOptions {
  /** Le suivi ne démarre QUE si le livreur est en ligne (exigence légale). */
  online: boolean;
  onDelivery: boolean;
  send: (ping: ReturnType<typeof toLocationPing>) => Promise<void>;
  /** Appelé quand l'API répond DRIVER_OFFLINE ou que la permission est refusée. */
  onStopped?: (reason: 'permission' | 'rejected') => void;
  isOfflineError?: (e: unknown) => boolean;
  clock?: () => number;
}

export interface DriverTrackingState {
  /** Vrai seulement quand le GPS est réellement suivi (indicateur « suivi GPS actif »). */
  active: boolean;
  /**
   * Vrai quand le livreur est en ligne mais que l'application n'est plus au premier plan :
   * le GPS n'est alors pas lu (pas de suivi en arrière-plan), le client et les contrôleurs
   * voient la dernière position connue jusqu'au retour dans l'application.
   */
  paused: boolean;
  position: TrackedPosition | null;
  error: string | null;
}

/**
 * Suivi GPS au premier plan uniquement (pas de tâche en arrière-plan).
 * Le watcher est arrêté dès que `online` repasse à false : aucune position n'est alors lue ni envoyée.
 */
export function useDriverLocationTracking(opts: DriverTrackingOptions): DriverTrackingState {
  const { online, onDelivery } = opts;
  const [state, setState] = useState<Omit<DriverTrackingState, 'paused'>>({ active: false, position: null, error: null });
  const [appState, setAppState] = useState<AppStateStatus>(() => (AppState.currentState as AppStateStatus | null) ?? 'active');
  const appStateRef = useRef(appState);
  /** Mis à true au retour au premier plan : la position suivante est envoyée sans attendre la cadence. */
  const forceNextRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const onDeliveryRef = useRef(onDelivery);
  onDeliveryRef.current = onDelivery;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') forceNextRef.current = true;
      appStateRef.current = next;
      setAppState(next);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!online) {
      setState({ active: false, position: null, error: null });
      return;
    }
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let lastSentAt: number | null = null;
    let lastSentPos: { lat: number; lng: number } | null = null;
    let sending = false;
    const clock = optsRef.current.clock ?? Date.now;

    const stop = (reason: 'permission' | 'rejected', message: string) => {
      subscription?.remove();
      subscription = null;
      if (!cancelled) setState({ active: false, position: null, error: message });
      optsRef.current.onStopped?.(reason);
    };

    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        stop('permission', 'Autorisez la localisation pour être en ligne.');
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          if (cancelled) return;
          const now = clock();
          const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          const h = loc.coords.heading;
          const heading = typeof h === 'number' && h >= 0 && h <= 360 ? h : null;
          setState({ active: true, position: { ...pos, at: now, heading }, error: null });
          // Arrière-plan (onglet masqué sur le web, où le navigateur peut continuer à fournir des positions) :
          // aucun envoi, comme sur Android/iOS où le suivi s'arrête hors premier plan. Reprise au retour.
          if (appStateRef.current === 'background') return;
          const movedMeters = lastSentPos ? haversineKm(lastSentPos, pos) * 1000 : 0;
          if (sending) return;
          const forced = forceNextRef.current;
          forceNextRef.current = false;
          if (!forced && !shouldSendPing({ online: true, onDelivery: onDeliveryRef.current, lastSentAt, movedMeters }, now)) return;
          sending = true;
          lastSentAt = now;
          lastSentPos = pos;
          optsRef.current
            .send(toLocationPing(loc.coords))
            .catch((e: unknown) => {
              if (optsRef.current.isOfflineError?.(e)) stop('rejected', 'Vous êtes hors ligne : suivi GPS arrêté.');
            })
            .finally(() => {
              sending = false;
            });
        },
      );
      if (cancelled) {
        sub.remove();
        return;
      }
      subscription = sub;
      setState((s) => ({ ...s, active: true }));
    })().catch(() => {
      if (!cancelled) setState({ active: false, position: null, error: 'GPS indisponible.' });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
  }, [online]);

  // 'inactive' (iOS : centre de notifications, appel entrant) est bref et ne coupe pas le watcher.
  const paused = online && appState === 'background';
  return { ...state, active: state.active && !paused, paused };
}
