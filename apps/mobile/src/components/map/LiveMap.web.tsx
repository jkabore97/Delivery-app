import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Marker as MlMarker } from 'maplibre-gl';
import { boundsOf, distanceM, OUAGADOUGOU_CENTER, padBounds } from '@yaar/shared';
import { clampPadding, withDefaultPadding } from '../../lib/mapCamera';
import { activeLegPoints, circleRing, pointsKey, resolveLines, zonesKey } from '../../lib/map/lines';
import {
  createBaseMap,
  ensureLineLayers,
  LINES_SOURCE,
  loadMaplibre,
  setLineFeatures,
  setZoneFeatures,
  webglSupported,
  type BaseMap,
  type Maplibre,
} from '../../lib/map/maplibre.web';
import { DriverMotion, screenHeading } from '../../lib/map/motion';
import { MAP_PALETTE } from '../../lib/map/style';
import { Text } from '../Text';
import { MapAttribution } from './MapAttribution';
import { driverElement, dropoffElement, pickupElement, setDriverHeading } from './markerDom.web';
import {
  DRIVER_NUDGE_PX,
  type LiveMapProps,
  type MapPadding,
  type MapPoint,
  type SceneLine,
  type SceneMarker,
  type SceneZone,
} from './types';

/** Rafraîchissement du tracé rogné pendant l'animation (~11 images/s suffisent). */
const LINE_REFRESH_MS = 90;
/** Vérification périodique du chevron de cap (relevés trop anciens : livreur arrêté ou hors ligne). */
const STALE_CHECK_MS = 5000;

interface Entry {
  kind: SceneMarker['kind'];
  /** Apparence (type, pulsation, véhicule) : l'élément est recréé si elle change. */
  look: string;
  marker: MlMarker;
  el: HTMLElement;
  /** Position affichée (animée pour un livreur). */
  pos: MapPoint;
  /** Livreur : glissement entre les relevés, cap, arrêt. */
  motion: DriverMotion | null;
  nudge: boolean;
}

/** Pilote impératif de la carte MapLibre : marqueurs DOM, animation requestAnimationFrame, tracés, caméra. */
class LiveMapController {
  private entries = new Map<string, Entry>();
  private lines: SceneLine[] = [];
  private zones: SceneZone[] = [];
  private raf = 0;
  private lastLineFlush = 0;
  private staleTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly ml: Maplibre,
    private readonly base: BaseMap,
    private readonly allowRotate: boolean,
  ) {
    this.staleTimer = setInterval(() => this.refreshHeadings(performance.now()), STALE_CHECK_MS);
    // Carte tournée par le livreur : le chevron garde le cap réel (le pictogramme, lui, reste droit à l'écran).
    if (allowRotate) this.map.on('rotate', () => this.refreshHeadings(performance.now()));
  }

  private get map() {
    return this.base.map;
  }

  /** `fallbackMs` : durée du glissement vers une position sans horodatage. */
  setScene(markers: SceneMarker[], lines: SceneLine[], fallbackMs: number): void {
    const now = performance.now();
    const seen = new Set<string>();
    let glide = false;
    for (const m of markers) {
      seen.add(m.id);
      const avatar = m.kind !== 'driver' && m.initials ? m.initials : null;
      const look = `${m.kind}|${m.pulse ? 1 : 0}|${m.vehicleType ?? ''}|${avatar ?? ''}|${m.tone ?? ''}`;
      const target = { lat: m.lat, lng: m.lng };
      let e = this.entries.get(m.id);
      if (e && e.look !== look) {
        e.marker.remove();
        this.entries.delete(m.id);
        e = undefined;
      }
      if (!e) {
        const el =
          m.kind === 'driver'
            ? driverElement(m.vehicleType ?? 'MOTO', m.title, m.tone)
            : m.kind === 'pickup'
              ? pickupElement(!!m.pulse, m.title, avatar)
              : dropoffElement(!!m.pulse, m.title, avatar);
        const marker = new this.ml.Marker({
          element: el,
          // Goutte du destinataire : la pointe touche la position ; carré de l'entreprise et disque du livreur : centrés.
          anchor: m.kind === 'dropoff' ? 'bottom' : 'center',
          // Pictogrammes toujours droits à l'écran (seul le chevron du livreur suit le cap).
          rotationAlignment: 'viewport',
          pitchAlignment: 'viewport',
        })
          .setLngLat([m.lng, m.lat])
          .addTo(this.map);
        e = { kind: m.kind, look, marker, el, pos: target, motion: m.kind === 'driver' ? new DriverMotion() : null, nudge: false };
        this.entries.set(m.id, e);
      }
      if (e.motion) {
        const r = e.motion.update({ lat: m.lat, lng: m.lng, heading: m.heading ?? null, at: m.fixAt ?? null }, now, fallbackMs);
        if (r === 'glide') glide = true;
        else if (r !== 'none') {
          e.pos = target;
          e.marker.setLngLat([target.lng, target.lat]);
        }
        this.applyHeading(e, now);
        const nudge = !!m.nudge;
        if (nudge !== e.nudge) {
          e.nudge = nudge;
          e.marker.setOffset(nudge ? DRIVER_NUDGE_PX : [0, 0]);
        }
      } else if (distanceM(e.pos, target) > 0.3) {
        e.pos = target;
        e.marker.setLngLat([target.lng, target.lat]);
      }
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        e.marker.remove();
        this.entries.delete(id);
      }
    }
    this.lines = lines;
    this.flushLines(now);
    if (glide && !this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private applyHeading(e: Entry, now: number, heading?: number | null): void {
    if (!e.motion) return;
    const h = heading === undefined ? e.motion.sample(now).heading : heading;
    const visible = h !== null && e.motion.chevronVisible(now);
    setDriverHeading(e.el, visible ? screenHeading(h, this.allowRotate ? this.map.getBearing() : 0) : null);
  }

  private refreshHeadings(now: number): void {
    for (const e of this.entries.values()) if (e.motion) this.applyHeading(e, now);
  }

  private tick = (now: number) => {
    this.raf = 0;
    let animating = false;
    for (const e of this.entries.values()) {
      if (!e.motion) continue;
      const s = e.motion.sample(now);
      if (s.pos.lat !== e.pos.lat || s.pos.lng !== e.pos.lng) {
        e.pos = s.pos;
        e.marker.setLngLat([s.pos.lng, s.pos.lat]);
      }
      this.applyHeading(e, now, s.heading);
      if (s.animating) animating = true;
    }
    if (!animating || now - this.lastLineFlush >= LINE_REFRESH_MS) this.flushLines(now);
    if (animating) this.raf = requestAnimationFrame(this.tick);
  };

  /** Zones approximatives (cercles), redessinées seulement quand elles changent. */
  setZones(zones: SceneZone[]): void {
    this.zones = zones;
    this.flushZones();
  }

  private flushZones(): void {
    if (!this.map.getSource(LINES_SOURCE)) return; // style en cours de chargement : repris dans onStyleReady
    setZoneFeatures(
      this.map,
      this.zones.map((z) => ({
        type: 'Feature' as const,
        properties: { kind: z.kind },
        geometry: { type: 'Polygon' as const, coordinates: [circleRing(z, z.radiusM)] },
      })),
    );
  }

  flushLines(now: number = performance.now()): void {
    this.lastLineFlush = now;
    if (!this.map.getSource(LINES_SOURCE)) return; // style en cours de chargement : repris dans onStyleReady
    const drawn = resolveLines(this.lines, (id) => this.entries.get(id)?.pos);
    setLineFeatures(
      this.map,
      drawn.map((l) => ({
        type: 'Feature' as const,
        properties: { kind: l.kind },
        geometry: { type: 'LineString' as const, coordinates: l.points.map((p) => [p.lng, p.lat] as [number, number]) },
      })),
    );
  }

  /** Style prêt (secours, puis distant) : les calques des zones et des itinéraires sont rajoutés et redessinés. */
  onStyleReady(): void {
    ensureLineLayers(this.map);
    this.flushZones();
    this.flushLines();
  }

  fit(points: MapPoint[], padding: MapPadding, maxZoom: number, animate: boolean): void {
    const container = this.map.getContainer();
    const w = container.clientWidth;
    const h = container.clientHeight;
    // Le livreur affiché glisse encore vers sa dernière position : on cadre aussi sa position affichée et l'étape en
    // cours telle qu'elle est dessinée depuis elle (sinon il peut sortir du cadre pendant le glissement).
    const bounds = boundsOf([...points, ...activeLegPoints(this.lines, (id) => this.entries.get(id)?.pos)]);
    if (!w || !h || !bounds) return;
    // Étendue minimale (~330 m) : un point seul ne zoome pas à l'extrême.
    const b = padBounds(bounds, 0, 0.003);
    this.map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: clampPadding(padding, w, h), maxZoom, duration: animate ? 900 : 0 },
    );
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearInterval(this.staleTimer);
    for (const e of this.entries.values()) e.marker.remove();
    this.entries.clear();
    this.base.destroy();
  }
}

function markersKey(markers: SceneMarker[]): string {
  return markers
    .map(
      (m) =>
        `${m.id}:${m.kind}:${m.lat.toFixed(6)},${m.lng.toFixed(6)}:${m.heading ?? ''}:${m.fixAt ?? ''}:${m.nudge ? 1 : 0}:${m.pulse ? 1 : 0}:${m.vehicleType ?? ''}:${m.initials ?? ''}:${m.tone ?? ''}`,
    )
    .join(';');
}

const NO_ZONES: SceneZone[] = [];

function linesKey(lines: SceneLine[]): string {
  return lines.map((l) => `${l.id}:${l.kind}:${l.trimToMarkerId ?? ''}:${pointsKey(l.points)}`).join(';');
}

/**
 * Carte de suivi en direct (web) : MapLibre GL JS chargé à la demande, style de secours aussitôt puis fond Cobalt
 * (`/map/cobalt-style.json`) dès qu'il arrive, marqueurs Cobalt entreprise / destinataire / livreur, itinéraire cobalt à
 * liseré blanc et chevrons rogné au fil de l'avancée, livreur qui glisse en continu d'un relevé GPS au suivant, caméra
 * qui suit jusqu'au premier geste de l'utilisateur ; zones approximatives (`zones`). `theme` (ancien fond sombre) est
 * accepté et ignoré : fond Cobalt partout.
 */
export function LiveMap({
  markers,
  lines,
  zones = NO_ZONES,
  fitPoints,
  follow,
  recenterKey = 0,
  onUserGesture,
  padding,
  bottomInset = 0,
  animationMs = 4000,
  allowRotate = false,
  maxZoom = 16.5,
  style,
  testID,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<LiveMapController | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const gestureRef = useRef(onUserGesture);
  gestureRef.current = onUserGesture;
  const initialCenter = useRef<MapPoint>(fitPoints[0] ?? markers[0] ?? OUAGADOUGOU_CENTER);
  const allowRotateRef = useRef(allowRotate);

  useEffect(() => {
    let cancelled = false;
    if (!webglSupported()) {
      setStatus('unsupported');
      return;
    }
    loadMaplibre()
      .then((ml) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        let ctrl: LiveMapController | null = null;
        const base = createBaseMap(ml, el, {
          center: initialCenter.current,
          zoom: 13,
          allowRotate: allowRotateRef.current,
          onStyleReady: () => ctrl?.onStyleReady(),
        });
        ctrl = new LiveMapController(ml, base, allowRotateRef.current);
        const userGesture = (e: { originalEvent?: unknown }) => {
          if (e.originalEvent) gestureRef.current?.();
        };
        base.map.on('dragstart', userGesture);
        base.map.on('zoomstart', userGesture);
        base.map.on('rotatestart', userGesture);
        base.map.on('pitchstart', userGesture);
        ctrlRef.current = ctrl;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });
    return () => {
      cancelled = true;
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
  }, []);

  const sceneKey = `${markersKey(markers)}#${linesKey(lines)}`;
  useEffect(() => {
    if (status === 'ready') ctrlRef.current?.setScene(markers, lines, animationMs);
    // La scène est comparée par valeur (sceneKey), pas par référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sceneKey, animationMs]);

  const zoneKey = zonesKey(zones);
  useEffect(() => {
    if (status === 'ready') ctrlRef.current?.setZones(zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, zoneKey]);

  const pad = withDefaultPadding(padding);
  const padKey = `${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  const fitKey = pointsKey(fitPoints);
  const lastFit = useRef({ fitKey: '', recenterKey: -1, padKey: '' });
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (status !== 'ready' || !ctrl || fitPoints.length === 0) return;
    const prev = lastFit.current;
    const first = prev.fitKey === '';
    const recenter = recenterKey !== prev.recenterKey;
    const changed = fitKey !== prev.fitKey || padKey !== prev.padKey;
    if (first || recenter || (follow && changed)) ctrl.fit(fitPoints, pad, maxZoom, !first);
    lastFit.current = { fitKey, recenterKey, padKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fitKey, recenterKey, follow, padKey, maxZoom]);

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {/* zIndex 0 : contexte d'empilement propre sous les boutons posés sur la carte. data-theme : apparence affichée. */}
      <div ref={containerRef} data-testid="live-map" data-theme="light" data-map-style="cobalt" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {status !== 'ready' ? (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>{status === 'loading' ? 'Chargement de la carte…' : 'Carte indisponible sur cet appareil.'}</Text>
        </View>
      ) : null}
      <MapAttribution bottom={bottomInset + 4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MAP_PALETTE.background },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  overlayText: { fontSize: 13, fontWeight: '600', color: MAP_PALETTE.overlayText },
});
