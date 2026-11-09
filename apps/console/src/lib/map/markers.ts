import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from './style';
import type { MarkerKind, SceneMarker } from './types';

/**
 * Marqueurs HTML des cartes MapLibre (styles dans styles.css, classes `yaar-*`), cohérents avec l'application
 * mobile : entreprise (carré orange arrondi), destinataire (épingle verte), livreur (pastille ronde : véhicule
 * toujours droit, petite flèche séparée orientée selon le cap ; anneau vert = libre, bleu = en livraison),
 * livraison en attente (anneaux rouges pulsés + numéro), SOS (point rouge pulsé + nom).
 * Ne jamais fixer `position` sur l'élément racine : MapLibre le place avec `.maplibregl-marker { position: absolute }`.
 */

interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill: string;
  rotate?: number;
}

const WHITE = '#FFFFFF';

/** Boutique / entreprise (même dessin que l'application mobile). */
const STORE_GLYPH: ArtRect[] = [
  { x: 3, y: 4, w: 18, h: 5, r: 1.6, fill: WHITE },
  { x: 5, y: 10, w: 14, h: 10, r: 1.2, fill: WHITE },
  { x: 10.5, y: 13.5, w: 3.2, h: 6.5, r: 0.6, fill: MAP_COLORS.business },
  { x: 6.6, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.business },
  { x: 14.8, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.business },
];

/** Maison (destinataire). */
const HOUSE_GLYPH: ArtRect[] = [
  { x: 6.2, y: 3.6, w: 11.6, h: 11.6, r: 1.4, fill: WHITE, rotate: 45 },
  { x: 6, y: 11, w: 12, h: 9.5, r: 1, fill: WHITE },
  { x: 10.4, y: 14.2, w: 3.2, h: 6.3, r: 0.6, fill: MAP_COLORS.dropoff },
];

function rectsSvg(rects: ArtRect[], size: number): string {
  const body = rects
    .map((r) => {
      const rot = r.rotate ? ` transform="rotate(${r.rotate} ${r.x + r.w / 2} ${r.y + r.h / 2})"` : '';
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.r ?? 0}" fill="${r.fill}"${rot}/>`;
    })
    .join('');
  return svg(size, body);
}

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

const INK = MAP_COLORS.driverInk;

/** Véhicules vus de profil (toujours droits : seul la flèche de cap tourne). */
export const VEHICLE_SVG_BODY: Record<VehicleType, string> = {
  BIKE:
    `<g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    '<circle cx="5.5" cy="15.5" r="3.6"/><circle cx="18.5" cy="15.5" r="3.6"/>' +
    '<path d="M5.5 15.5 9.4 8.6h6.1l3 6.9M9.4 8.6l2.8 6.9H5.5M12.2 15.5l3.3-6.9M9.6 6.3l-.2 2.3M8.2 6.3H11M15.5 8.6l-.7-2.3H17"/></g>',
  MOTO:
    `<g fill="none" stroke="${INK}" stroke-width="2.2"><circle cx="5.6" cy="16" r="3.1"/><circle cx="18.4" cy="16" r="3.1"/></g>` +
    `<path fill="${INK}" d="M6.6 10.3h6.2c.5 0 .9.3 1.1.7l.8 1.7 1.3-3.4h1.8l1.7 4.4-1.9.8-.7-1.6-2.1 3.7H9.4A3.7 3.7 0 0 0 5.3 13l1.3-2.7Z"/>` +
    `<path fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" d="M14.6 6.4h2.8M16 6.4l.7 2.9"/>`,
  CAR:
    `<path fill="${INK}" d="M4.4 11 6.1 7.5A2.2 2.2 0 0 1 8.1 6.2h7.3c.8 0 1.5.4 1.9 1.1l2.1 3.7 1.5.4c.7.2 1.2.8 1.2 1.5v2.7c0 .5-.4.9-.9.9h-1.3a2.7 2.7 0 0 0-5.3 0H9.5a2.7 2.7 0 0 0-5.3 0H3a.9.9 0 0 1-.9-.9v-2.5c0-.9.6-1.6 1.4-1.8Z"/>` +
    `<path fill="${WHITE}" d="M7.2 10.8 8.3 8.4c.2-.3.5-.5.8-.5h2.4v2.9Zm6 0V7.9h2c.4 0 .7.2.9.5l1.4 2.4Z"/>` +
    `<circle cx="6.9" cy="16.5" r="2.1" fill="${INK}"/><circle cx="16.9" cy="16.5" r="2.1" fill="${INK}"/>`,
};

export function vehicleSvg(vehicle: VehicleType, size = 22): string {
  return svg(size, VEHICLE_SVG_BODY[vehicle] ?? VEHICLE_SVG_BODY.MOTO);
}

export const STORE_SVG = (size = 22) => rectsSvg(STORE_GLYPH, size);
export const HOUSE_SVG = (size = 20) => rectsSvg(HOUSE_GLYPH, size);

/** Empilement : anneaux sous les entreprises, livreurs au-dessus des épingles, SOS tout en haut. */
export const MARKER_Z: Record<MarkerKind, number> = { label: 0, search: 1, business: 2, dropoff: 3, driver: 4, sos: 5 };

/**
 * Ancre MapLibre du marqueur : l'épingle pointe vers le bas ; le nom de quartier est posé sous son point (les
 * entreprises de démonstration sont souvent au centre même du quartier).
 */
export function markerAnchor(kind: MarkerKind): 'center' | 'bottom' | 'top' {
  if (kind === 'dropoff') return 'bottom';
  return kind === 'label' ? 'top' : 'center';
}

/** Apparence fixe d'un marqueur : l'élément est recréé seulement si elle change (le reste est mis à jour en place). */
export function markerLook(m: SceneMarker): string {
  return `${m.kind}|${m.vehicleType ?? ''}`;
}

export function isClickable(m: SceneMarker): boolean {
  return !!(m.orderId || m.driverId);
}

/** Crée l'élément DOM d'un marqueur. */
export function createMarkerElement(m: SceneMarker): HTMLElement {
  const el = document.createElement('div');
  el.dataset.kind = m.kind;
  el.style.zIndex = String(MARKER_Z[m.kind]);
  switch (m.kind) {
    case 'business':
      el.className = 'yaar-mk yaar-business';
      el.innerHTML = `<div class="yaar-business-box">${STORE_SVG(22)}</div>`;
      break;
    case 'dropoff':
      el.className = 'yaar-mk yaar-dropoff';
      el.innerHTML =
        '<div class="yaar-pulse"></div><div class="yaar-pin-dot"></div>' +
        `<div class="yaar-pin"><div class="yaar-pin-glyph">${HOUSE_SVG(20)}</div></div>`;
      break;
    case 'driver':
      el.className = 'yaar-mk yaar-driver';
      el.dataset.vehicle = m.vehicleType ?? 'MOTO';
      el.innerHTML =
        '<div class="yaar-driver-heading"><span class="yaar-driver-chevron"></span></div>' +
        `<div class="yaar-driver-badge">${vehicleSvg(m.vehicleType ?? 'MOTO', 22)}</div>`;
      break;
    case 'search':
      el.className = 'yaar-mk yaar-search';
      el.innerHTML = '<div class="yaar-ring"></div><div class="yaar-ring d2"></div><div class="yaar-ring d3"></div><span class="yaar-search-label"></span>';
      break;
    case 'sos':
      el.className = 'yaar-mk yaar-sos';
      el.innerHTML = '<span class="yaar-sos-dot"></span><span class="yaar-sos-label"></span>';
      break;
    case 'label':
      el.className = 'yaar-mk yaar-hood';
      break;
  }
  if (isClickable(m)) {
    el.classList.add('is-clickable');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
  } else if (m.kind !== 'label') {
    el.setAttribute('role', 'img');
  }
  updateMarkerElement(el, m);
  return el;
}

/** Met à jour en place ce qui peut changer d'un rafraîchissement à l'autre (libre / occupé, textes, halo…). */
export function updateMarkerElement(el: HTMLElement, m: SceneMarker): void {
  if (m.kind === 'label') {
    el.textContent = m.label ?? '';
    return;
  }
  el.title = m.title;
  el.setAttribute('aria-label', m.title);
  if (m.kind === 'driver') {
    el.classList.toggle('is-busy', !!m.busy);
    el.classList.toggle('is-free', !m.busy);
  }
  if (m.kind === 'business') el.classList.toggle('is-dimmed', !!m.dimmed);
  if (m.kind === 'dropoff') el.classList.toggle('is-pulsing', !!m.pulse);
  if (m.kind === 'search' || m.kind === 'sos') {
    const label = el.querySelector<HTMLElement>(m.kind === 'search' ? '.yaar-search-label' : '.yaar-sos-label');
    if (label) {
      label.textContent = m.label ?? '';
      label.hidden = !m.label;
    }
  }
}

/** Oriente la flèche de cap d'un livreur (le véhicule reste droit) ; cap inconnu : pas de flèche. */
export function setDriverHeading(el: HTMLElement, heading: number | null | undefined): void {
  const arrow = el.querySelector<HTMLElement>('.yaar-driver-heading');
  if (!arrow) return;
  const known = heading !== null && heading !== undefined && Number.isFinite(heading);
  el.classList.toggle('no-heading', !known);
  if (known) arrow.style.transform = `rotate(${Math.round(heading * 10) / 10}deg)`;
}
