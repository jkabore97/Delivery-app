import type { Marker } from 'maplibre-gl';
import { boundsOf, distanceM, padBounds, type LatLng } from '@yaar/shared';
import { ensureLineLayers, LINES_SOURCE, setLineFeatures, type BaseMap, type Maplibre } from './engine';
import { createMarkerElement, markerAnchor, markerLook, setDriverHeading, updateMarkerElement } from './markers';
import { SmoothMover } from './motion';
import { neighbourhoodLabels, resolveLines } from './scene';
import type { MapScene, SceneLine, SceneMarker } from './types';

/** Rafraîchissement du tracé rogné pendant le glissement d'un livreur (~11 images/s suffisent). */
const LINE_REFRESH_MS = 90;

interface Entry {
  look: string;
  marker: Marker;
  el: HTMLElement;
  data: SceneMarker;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Pilote impératif d'une carte MapLibre : marqueurs DOM mis à jour en place (aucun rechargement visible), livreurs
 * animés entre deux rafraîchissements (SmoothMover), tracés rognés à la position animée. Ne déplace jamais la caméra
 * de lui-même : seul `fit` le fait (premier affichage, bouton « Recentrer », changement d'étape d'une livraison).
 */
export class MapSceneController {
  private readonly entries = new Map<string, Entry>();
  private readonly labels: Marker[] = [];
  private lines: SceneLine[] = [];
  private lastLineFlush = 0;
  private readonly mover: SmoothMover;

  constructor(
    private readonly ml: Maplibre,
    private readonly base: BaseMap,
    private readonly onClick: (m: SceneMarker) => void,
    animationMs: number,
  ) {
    this.mover = new SmoothMover({
      durationMs: animationMs,
      onMove: (id, pos, heading) => {
        const e = this.entries.get(id);
        if (!e) return;
        e.marker.setLngLat([pos.lng, pos.lat]);
        setDriverHeading(e.el, heading);
      },
      onFrame: (animating) => {
        const now = performance.now();
        if (!animating || now - this.lastLineFlush >= LINE_REFRESH_MS) this.flushLines(now);
      },
    });
  }

  private get map() {
    return this.base.map;
  }

  setScene(scene: MapScene): void {
    const seen = new Set<string>();
    for (const m of scene.markers) {
      seen.add(m.id);
      const look = markerLook(m);
      let e = this.entries.get(m.id);
      if (e && e.look !== look) {
        this.removeEntry(m.id, e);
        e = undefined;
      }
      if (!e) {
        e = this.addEntry(m, look);
        continue;
      }
      e.data = m;
      updateMarkerElement(e.el, m);
      if (m.kind === 'driver') {
        this.mover.moveTo(m.id, m, m.heading);
      } else {
        const cur = e.marker.getLngLat();
        if (distanceM({ lat: cur.lat, lng: cur.lng }, m) > 0.3) e.marker.setLngLat([m.lng, m.lat]);
      }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.removeEntry(id, e);
    this.lines = scene.lines;
    // Pendant un glissement, le tracé suit les images ; sinon tout de suite.
    if (!this.mover.animating) this.flushLines();
  }

  private addEntry(m: SceneMarker, look: string): Entry {
    const el = createMarkerElement(m);
    const marker = new this.ml.Marker({ element: el, anchor: markerAnchor(m.kind) }).setLngLat([m.lng, m.lat]).addTo(this.map);
    const entry: Entry = { look, marker, el, data: m };
    const fire = (ev: Event) => {
      ev.stopPropagation();
      this.onClick(entry.data);
    };
    if (m.orderId || m.driverId) {
      el.addEventListener('click', fire);
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          fire(ev);
        }
      });
    }
    this.entries.set(m.id, entry);
    if (m.kind === 'driver') {
      this.mover.moveTo(m.id, m, m.heading);
    }
    return entry;
  }

  private removeEntry(id: string, e: Entry): void {
    e.marker.remove();
    this.entries.delete(id);
    this.mover.remove(id);
  }

  /** Position affichée d'un marqueur (animée pour un livreur). */
  private positionOf(id: string): LatLng | undefined {
    const p = this.mover.position(id);
    if (p) return p;
    const e = this.entries.get(id);
    return e ? { lat: e.data.lat, lng: e.data.lng } : undefined;
  }

  flushLines(now: number = performance.now()): void {
    this.lastLineFlush = now;
    if (!this.map.getSource(LINES_SOURCE)) return; // style en cours de chargement : repris dans onStyleReady
    const drawn = resolveLines(this.lines, (id) => this.positionOf(id));
    setLineFeatures(
      this.map,
      drawn.map((l) => ({
        type: 'Feature' as const,
        properties: { kind: l.kind },
        geometry: { type: 'LineString' as const, coordinates: l.points.map((p) => [p.lng, p.lat] as [number, number]) },
      })),
    );
  }

  /** Style prêt (distant ou de secours) : calques des tracés, et noms des quartiers sur le fond de secours. */
  onStyleReady(fallback: boolean): void {
    ensureLineLayers(this.map);
    this.flushLines();
    this.showNeighbourhoods(fallback);
  }

  private showNeighbourhoods(visible: boolean): void {
    if (!visible) {
      for (const m of this.labels) m.remove();
      this.labels.length = 0;
      return;
    }
    if (this.labels.length > 0) return;
    for (const l of neighbourhoodLabels()) {
      this.labels.push(
        new this.ml.Marker({ element: createMarkerElement(l), anchor: markerAnchor(l.kind) }).setLngLat([l.lng, l.lat]).addTo(this.map),
      );
    }
  }

  /** Cadre les points (étendue minimale ≈ 330 m : un point seul ne zoome pas à l'extrême). */
  fit(points: LatLng[], padding: MapPadding, maxZoom: number, animate: boolean): void {
    const container = this.map.getContainer();
    const w = container.clientWidth;
    const h = container.clientHeight;
    const bounds = boundsOf(points);
    if (!w || !h || !bounds) return;
    const b = padBounds(bounds, 0, 0.003);
    this.map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: clampPadding(padding, w, h), maxZoom, duration: animate ? 700 : 0 },
    );
  }

  destroy(): void {
    this.mover.dispose();
    for (const e of this.entries.values()) e.marker.remove();
    this.entries.clear();
    for (const m of this.labels) m.remove();
    this.labels.length = 0;
    this.base.destroy();
  }
}

/** Marges compatibles avec la taille de la carte (MapLibre refuse de cadrer si elles la dépassent). */
export function clampPadding(p: MapPadding, width: number, height: number, minFree = 80): MapPadding {
  const scale = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - minFree);
    const sum = a + b;
    if (sum <= room || sum === 0) return [a, b];
    const k = room / sum;
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [top, bottom] = scale(Math.max(0, p.top), Math.max(0, p.bottom), height);
  const [left, right] = scale(Math.max(0, p.left), Math.max(0, p.right), width);
  return { top, right, bottom, left };
}
