import type { VehicleType } from '@yaar/shared';
import { COBALT_MAP, MARKER_SHADOW, rgba } from './palette';
import { MAP_COLORS } from './style';
import type { MarkerKind, SceneMarker } from './types';

/**
 * Marqueurs HTML « Cobalt » des cartes MapLibre de la console, mêmes formes que l'application mobile
 * (apps/mobile/src/components/map/markerDom.web.ts) :
 * - entreprise : carré encre arrondi cerclé de blanc, initiales blanches (ou boutique), estompé si fermée ;
 * - destinataire : goutte cobalt cerclée de blanc (maison), halo pulsé sous la pointe pendant la livraison ;
 * - livreur : disque blanc, véhicule de profil toujours droit, petite encoche de cap séparée sur le bord ; en livraison :
 *   véhicule et encoche cobalt ; libre : encre atténuée et pastille menthe « disponible » ;
 * - livraison en attente d'un livreur : radar cobalt doux et étiquette blanche (« #1005 ») ;
 * - SOS : point corail pulsé, étiquette corail foncé.
 * Leurs styles (classes `ycm-*`) sont injectés par `ensureCobaltMapCss` et limités aux cartes (`.yaar-cobalt`, posé par
 * MapFrame) : les anciennes règles `yaar-*` de styles.css ne s'appliquent plus qu'aux éléments racine, redéfinis ici.
 * Ne jamais fixer `position` sur l'élément racine : MapLibre le place avec `.maplibregl-marker { position: absolute }`.
 */

const C = COBALT_MAP;

/** Classe posée sur le cadre de chaque carte (MapFrame) : limite les styles ci-dessous aux cartes. */
export const COBALT_MAP_CLASS = 'yaar-cobalt';

/** Trait des pictogrammes (unités d'une boîte 24 × 24), comme les icônes au trait de l'application. */
const STROKE = 2.2;

function svg(size: number, body: string, attrs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${attrs}>${body}</svg>`;
}

/** Lignes brisées et cercles au trait (couleur `currentColor`). */
function strokes(paths: string[], circles: Array<[number, number, number]> = [], width = STROKE): string {
  return (
    `<g fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}"/>`).join('') +
    circles.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('') +
    '</g>'
  );
}

/** Véhicules vus de profil, au trait, tournés vers la droite (toujours droits : seule l'encoche de cap tourne). */
export const VEHICLE_SVG_BODY: Record<VehicleType, string> = {
  MOTO: strokes(['M3.3 13.2 4.6 11 7.8 9.9h3.1l1.9 5.8h2.8', 'M18.2 15.7 15.6 6.5h-2.3', 'M7.5 6.8h3.7'], [
    [6, 15.7, 2.7],
    [18.2, 15.7, 2.7],
  ]),
  BIKE:
    strokes(['M5.3 15 9.2 8.6h6.4l3.1 6.4', 'M9.2 8.6 11.9 15l3.7-6.4', 'M5.3 15h6.6', 'M9.2 8.6 8.8 6.2', 'M15.6 8.6 14.9 5.9h2.4'], [], STROKE * 0.8) +
    strokes(['M7.4 5.9h3'], []) +
    strokes([], [
      [5.3, 15, 3.75],
      [18.7, 15, 3.75],
    ], STROKE * 0.9),
  CAR: strokes(['M5 16H3l-.9-.9V11l.3-1.2 1.3-2.9L5 6h7l1.8.7L16 9l4.4 1.1 1.5 1.9v3.1l-.9.9h-1.9', 'M9 16h6'], [
    [7, 16, 2.05],
    [17, 16, 2.05],
  ]),
};

const STORE_BODY = strokes([
  'M4 9.8 5.6 4.6h12.8L20 9.8l-2.67 1.8-2.66-1.8-2.67 1.8-2.67-1.8-2.66 1.8L4 9.8',
  'M5.6 13.6v6h12.8v-6',
  'M10.1 19.4v-3.8h3.8v3.8',
]);
const HOUSE_BODY = strokes(['M3.8 11.4 12 4.2l8.2 7.2', 'M6 9.8v9.8h12V9.8', 'M10.1 19.4v-4.8h3.8v4.8']);

export function vehicleSvg(vehicle: VehicleType, size = 22): string {
  return svg(size, VEHICLE_SVG_BODY[vehicle] ?? VEHICLE_SVG_BODY.MOTO);
}

export const STORE_SVG = (size = 20) => svg(size, STORE_BODY);
export const HOUSE_SVG = (size = 16) => svg(size, HOUSE_BODY);

/** Goutte du destinataire (36 × 46) : cercle de rayon 15,5 centré en (18, 18), pointe en (18, 44,6). */
const PIN_PATH = 'M18 44.6 5.4 27.03A15.5 15.5 0 1 1 30.6 27.03Z';
/** Encoche de cap (boîte 60 × 60 centrée sur le disque de 38) : pointe 8,6 px hors du disque. */
const NOTCH_PATH = 'M30 2.4 37.2 12.6C33.4 11.4 26.6 11.4 22.8 12.6Z';

const S = `.${COBALT_MAP_CLASS}`;
const CSS = `
${S}.map-frame{background:${C.land}}
${S} .maplibregl-map{font-family:inherit}
${S} .yaar-mk{cursor:default;-webkit-tap-highlight-color:transparent;font-weight:800;line-height:1}
${S} .yaar-mk.is-clickable{cursor:pointer}
${S} .yaar-mk:focus-visible{outline:2px solid ${C.cobalt};outline-offset:3px;border-radius:12px}
${S} .yaar-mk svg{display:block}
${S} .ycm-initials{color:#fff;font-size:12px;letter-spacing:.02em;white-space:nowrap;user-select:none;pointer-events:none}
${S} .yaar-business{width:36px;height:36px}
${S} .yaar-business.is-dimmed{opacity:.5}
${S} .ycm-square{position:absolute;inset:0;border-radius:12px;background:${MAP_COLORS.business};border:2.5px solid #fff;box-sizing:border-box;color:#fff;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px ${rgba(C.ink, 0.25)},0 8px 16px ${rgba(C.ink, 0.12)}}
${S} .yaar-dropoff{width:36px;height:46px}
${S} .yaar-dropoff:focus-visible{border-radius:18px}
${S} .ycm-pin{position:absolute;left:0;top:0;z-index:2;filter:${MARKER_SHADOW.pin}}
${S} .ycm-pin-content{position:absolute;left:0;top:0;width:36px;height:36px;z-index:3;color:#fff;display:flex;align-items:center;justify-content:center;pointer-events:none}
${S} .ycm-pin-dot{position:absolute;left:50%;bottom:-2px;width:10px;height:4px;margin-left:-5px;border-radius:50%;background:${rgba(C.ink, 0.28)};z-index:1}
${S} .ycm-pulse{display:none;position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:${rgba(C.cobalt, 0.35)};
  pointer-events:none;z-index:1;animation:ycm-pulse 2.4s ease-out infinite}
${S} .yaar-dropoff.is-pulsing .ycm-pulse{display:block}
@keyframes ycm-pulse{0%{transform:scale(.5);opacity:.95}100%{transform:scale(3.2);opacity:0}}
${S} .yaar-driver{width:38px;height:38px}
${S} .yaar-driver:focus-visible{border-radius:50%}
${S} .ycm-heading{position:absolute;inset:-11px;pointer-events:none;z-index:1;color:${MAP_COLORS.driverBusy}}
${S} .ycm-heading svg{filter:drop-shadow(0 1px 1px ${rgba(C.ink, 0.22)})}
${S} .yaar-driver.no-heading .ycm-heading{display:none}
${S} .ycm-disc{position:absolute;inset:0;z-index:2;border-radius:50%;background:${MAP_COLORS.driverDisc};border:2.5px solid #fff;box-sizing:border-box;
  color:${MAP_COLORS.driverBusy};display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px ${rgba(C.ink, 0.04)},${MARKER_SHADOW.float}}
${S} .yaar-driver.is-free .ycm-disc,${S} .yaar-driver.is-free .ycm-heading{color:${MAP_COLORS.driverFree}}
${S} .ycm-available{display:none;position:absolute;right:-1px;top:-1px;z-index:3;width:12px;height:12px;border-radius:50%;background:${MAP_COLORS.available};
  border:2px solid #fff;box-sizing:border-box}
${S} .yaar-driver.is-free .ycm-available{display:block}
${S} .yaar-search{width:40px;height:40px;pointer-events:none}
${S} .ycm-radar-glow{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,${rgba(C.cobalt, 0.16)},${rgba(C.cobalt, 0.06)} 55%,${rgba(C.cobalt, 0)})}
${S} .ycm-radar{position:absolute;inset:0;border-radius:50%;box-sizing:border-box;border:1.5px solid ${rgba(C.cobalt, 0.5)};background:${rgba(C.cobalt, 0.06)};
  pointer-events:none;animation:ycm-radar 3s cubic-bezier(.25,.6,.4,1) infinite}
${S} .ycm-radar.d2{animation-delay:1s}${S} .ycm-radar.d3{animation-delay:2s}
@keyframes ycm-radar{0%{transform:scale(.9);opacity:0}12%{opacity:1}100%{transform:scale(3.1);opacity:0}}
${S} .ycm-search-label{position:absolute;left:26px;top:-18px;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px 0 8px;border-radius:999px;
  background:#fff;color:${C.ink};font-size:12px;font-weight:700;white-space:nowrap;pointer-events:auto;cursor:pointer;
  box-shadow:0 1px 2px ${rgba(C.ink, 0.06)},0 6px 16px ${rgba(C.ink, 0.1)};font-variant-numeric:tabular-nums}
${S} .ycm-search-label::before{content:'';width:7px;height:7px;border-radius:50%;background:${C.cobalt};box-shadow:0 0 0 3px ${rgba(C.cobalt, 0.16)}}
${S} .yaar-sos{width:18px;height:18px}
${S} .ycm-sos-dot{position:absolute;inset:0;border-radius:50%;background:${MAP_COLORS.sos};border:3px solid #fff;box-sizing:border-box;
  box-shadow:0 0 0 8px ${rgba(C.coral, 0.25)};animation:ycm-sos 1.2s ease-in-out infinite}
@keyframes ycm-sos{50%{box-shadow:0 0 0 14px ${rgba(C.coral, 0.12)}}}
${S} .ycm-sos-label{position:absolute;left:24px;top:-4px;height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;white-space:nowrap;
  background:${MAP_COLORS.sosFill};color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 6px ${rgba(C.ink, 0.2)}}
${S} .ycm-search-label[hidden],${S} .ycm-sos-label[hidden]{display:none}
${S} .maplibregl-ctrl-group{border-radius:12px;overflow:hidden}
${S} .maplibregl-ctrl-group:not(:empty){box-shadow:0 1px 2px ${rgba(C.ink, 0.06)},0 6px 16px ${rgba(C.ink, 0.1)}}
${S} .map-attribution{background:rgba(255,255,255,.88);border-radius:8px;padding:2px 8px;font-size:10px;line-height:14px;font-weight:500;color:${C.inkMuted}}
${S} .map-status{color:${C.inkMuted}}
${S} .map-fallback-note{border:0;border-radius:8px;color:${C.inkMuted};box-shadow:0 1px 2px ${rgba(C.ink, 0.06)},0 6px 16px ${rgba(C.ink, 0.1)}}
${S} .yaar-hood{padding-top:22px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${MAP_COLORS.label};
  white-space:nowrap;pointer-events:none;text-shadow:0 0 2px ${C.land},0 0 2px ${C.land},0 1px 0 ${C.land}}
@media (prefers-reduced-motion: reduce){${S} .ycm-radar,${S} .ycm-pulse,${S} .ycm-sos-dot{animation:none}${S} .ycm-radar{opacity:.35}}
`;

let cssInjected = false;

/** Injecte (une fois) les styles Cobalt des marqueurs, après styles.css : ils l'emportent sur les anciennes règles. */
export function ensureCobaltMapCss(): void {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'yaar-cobalt-map-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Empilement : anneaux sous les entreprises, livreurs au-dessus des épingles, SOS tout en haut. */
export const MARKER_Z: Record<MarkerKind, number> = { label: 0, search: 1, business: 2, dropoff: 3, driver: 4, sos: 5 };

/**
 * Ancre MapLibre du marqueur : la goutte pointe vers le bas ; le nom de quartier est posé sous son point (les
 * entreprises de démonstration sont souvent au centre même du quartier).
 */
export function markerAnchor(kind: MarkerKind): 'center' | 'bottom' | 'top' {
  if (kind === 'dropoff') return 'bottom';
  return kind === 'label' ? 'top' : 'center';
}

/** Apparence fixe d'un marqueur : l'élément est recréé seulement si elle change (le reste est mis à jour en place). */
export function markerLook(m: SceneMarker): string {
  return `${m.kind}|${m.vehicleType ?? ''}|${m.initials ?? ''}`;
}

export function isClickable(m: SceneMarker): boolean {
  return !!(m.orderId || m.driverId);
}

function child(el: HTMLElement, className: string, html = ''): HTMLElement {
  const c = document.createElement('div');
  c.className = className;
  if (html) c.innerHTML = html;
  el.appendChild(c);
  return c;
}

function span(el: HTMLElement, className: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = className;
  el.appendChild(s);
  return s;
}

/** Crée l'élément DOM d'un marqueur. */
export function createMarkerElement(m: SceneMarker): HTMLElement {
  ensureCobaltMapCss();
  const el = document.createElement('div');
  el.dataset.kind = m.kind;
  el.style.zIndex = String(MARKER_Z[m.kind]);
  switch (m.kind) {
    case 'business': {
      el.className = 'yaar-mk yaar-business';
      const square = child(el, 'ycm-square');
      if (m.initials) {
        // Initiales en texte (jamais en HTML) : un nom saisi par l'utilisateur ne peut pas injecter de balises.
        span(square, 'ycm-initials').textContent = m.initials.slice(0, 3);
        el.dataset.avatar = '1';
      } else {
        square.innerHTML = STORE_SVG(20);
      }
      break;
    }
    case 'dropoff':
      el.className = 'yaar-mk yaar-dropoff';
      el.innerHTML =
        '<div class="ycm-pulse"></div><div class="ycm-pin-dot"></div>' +
        `<svg class="ycm-pin" width="36" height="46" viewBox="0 0 36 46" aria-hidden="true" focusable="false"><path d="${PIN_PATH}" fill="${MAP_COLORS.dropoff}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>` +
        `<div class="ycm-pin-content">${HOUSE_SVG(16)}</div>`;
      break;
    case 'driver':
      el.className = 'yaar-mk yaar-driver';
      el.dataset.vehicle = m.vehicleType ?? 'MOTO';
      el.innerHTML =
        `<div class="ycm-heading"><svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path d="${NOTCH_PATH}" fill="currentColor" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></div>` +
        `<div class="ycm-disc">${vehicleSvg(m.vehicleType ?? 'MOTO', 22)}</div><span class="ycm-available"></span>`;
      break;
    case 'search':
      el.className = 'yaar-mk yaar-search';
      el.innerHTML = '<div class="ycm-radar-glow"></div><div class="ycm-radar"></div><div class="ycm-radar d2"></div><div class="ycm-radar d3"></div>';
      span(el, 'ycm-search-label');
      break;
    case 'sos':
      el.className = 'yaar-mk yaar-sos';
      span(el, 'ycm-sos-dot');
      span(el, 'ycm-sos-label');
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
    const label = el.querySelector<HTMLElement>(m.kind === 'search' ? '.ycm-search-label' : '.ycm-sos-label');
    if (label) {
      label.textContent = m.label ?? '';
      label.hidden = !m.label;
    }
  }
}

/** Oriente l'encoche de cap d'un livreur (le véhicule reste droit) ; cap inconnu : pas d'encoche. */
export function setDriverHeading(el: HTMLElement, heading: number | null | undefined): void {
  const notch = el.querySelector<HTMLElement>('.ycm-heading');
  if (!notch) return;
  const known = heading !== null && heading !== undefined && Number.isFinite(heading);
  el.classList.toggle('no-heading', !known);
  if (known) notch.style.transform = `rotate(${Math.round(heading * 10) / 10}deg)`;
}
