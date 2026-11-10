import type { VehicleType } from '@yaar/shared';
import { fontFor } from '../../fonts';
import { COBALT_MAP, MARKER_SHADOW, rgba } from '../../lib/map/palette';
import { MAP_COLORS } from '../../lib/map/style';
import { artToSvg, HOUSE_GLYPH, STORE_GLYPH, vehicleSideGlyph } from './markerArt';

/**
 * Ne jamais fixer `position` sur l'élément racine d'un marqueur : MapLibre le place avec
 * `.maplibregl-marker { position: absolute }` (une règle de même spécificité injectée après l'écraserait).
 *
 * Marqueurs HTML « Cobalt » des cartes MapLibre (web) :
 * - entreprise / retrait : carré encre arrondi cerclé de blanc, initiales blanches (ou boutique), radar cobalt doux
 *   pendant la recherche d'un livreur ;
 * - destinataire : goutte cobalt cerclée de blanc, initiales blanches (ou maison), halo pulsé sous la pointe ;
 * - livreur : disque blanc, véhicule cobalt de profil toujours droit, petite encoche de cap sur le bord (masquée à
 *   l'arrêt) ; variante Sun (`tone: 'sun'`) pour un livreur en route vers l'entreprise, vu par l'entreprise.
 * Mêmes formes que les marqueurs natifs (MarkerViews.tsx) et que la console.
 */

/** Police des initiales : celle de l'application (src/fonts.ts), puis celle du système. */
const FONT = `${JSON.stringify(fontFor(800))}, system-ui, sans-serif`;
const C = COBALT_MAP;

/** Goutte du destinataire (36 × 46) : cercle de rayon 15,5 centré en (18, 18), pointe en (18, 44,6). */
export const PIN_BOX = { width: 36, height: 46, tipY: 44.6 } as const;
const PIN_PATH = 'M18 44.6 5.4 27.03A15.5 15.5 0 1 1 30.6 27.03Z';
/**
 * Encoche de cap (boîte 60 × 60 centrée sur le disque de 38) : pointe à 27,6 px du centre (8,6 px hors du disque),
 * base de 14,4 px cachée sous le disque : plus large que l'itinéraire de 6 px, elle se lit comme une flèche même
 * posée sur lui.
 */
const NOTCH_PATH = 'M30 2.4 37.2 12.6C33.4 11.4 26.6 11.4 22.8 12.6Z';

const CSS = `
.yaar-mk{cursor:default;-webkit-tap-highlight-color:transparent;font-family:${FONT};font-weight:800}
.yaar-mk svg{display:block}
.yaar-initials{color:#fff;font-size:12.5px;line-height:1;letter-spacing:.02em;white-space:nowrap;user-select:none;pointer-events:none}
.yaar-pickup{width:36px;height:36px}
.yaar-pickup-box{position:absolute;inset:0;z-index:2;border-radius:12px;background:${C.ink};border:2.5px solid #fff;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px ${rgba(C.ink, 0.25)},0 8px 16px ${rgba(C.ink, 0.12)}}
.yaar-radar-glow{position:absolute;left:50%;top:50%;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;pointer-events:none;z-index:0;
  background:radial-gradient(closest-side,${rgba(C.cobalt, 0.2)},${rgba(C.cobalt, 0.08)} 55%,${rgba(C.cobalt, 0)})}
.yaar-radar{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;box-sizing:border-box;
  border:1.5px solid ${rgba(C.cobalt, 0.5)};background:${rgba(C.cobalt, 0.06)};pointer-events:none;z-index:1;
  animation:yaar-radar 3s cubic-bezier(.25,.6,.4,1) infinite}
.yaar-radar.d2{animation-delay:1s}.yaar-radar.d3{animation-delay:2s}
@keyframes yaar-radar{0%{transform:scale(.9);opacity:0}12%{opacity:1}100%{transform:scale(3.3);opacity:0}}
.yaar-dropoff{width:${PIN_BOX.width}px;height:${PIN_BOX.height}px}
.yaar-pin{position:absolute;left:0;top:0;z-index:2;filter:${MARKER_SHADOW.pin}}
.yaar-pin-content{position:absolute;left:0;top:0;width:36px;height:36px;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none}
.yaar-pin-dot{position:absolute;left:50%;bottom:-2px;width:10px;height:4px;margin-left:-5px;border-radius:50%;background:${rgba(C.ink, 0.28)};z-index:1}
.yaar-pulse{position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:${rgba(C.cobalt, 0.35)};
  pointer-events:none;z-index:1;animation:yaar-pulse 2.4s ease-out infinite}
@keyframes yaar-pulse{0%{transform:scale(.5);opacity:.95}100%{transform:scale(3.2);opacity:0}}
.yaar-driver{width:38px;height:38px}
.yaar-driver-heading{position:absolute;inset:-11px;pointer-events:none;z-index:1}
.yaar-driver-heading svg{filter:drop-shadow(0 1px 1px ${rgba(C.ink, 0.22)})}
.yaar-driver-disc{position:absolute;inset:0;z-index:2;border-radius:50%;background:#fff;border:2.5px solid #fff;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px ${rgba(C.ink, 0.04)},${MARKER_SHADOW.float}}
.yaar-driver.is-sun .yaar-driver-disc{background:${C.sun}}
.yaar-driver.no-heading .yaar-driver-heading{display:none}
@media (prefers-reduced-motion: reduce){.yaar-radar,.yaar-pulse{animation:none;opacity:.35}}
`;

let injected = false;

export function ensureMarkerCss(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'yaar-map-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Empilement : entreprise sous l'épingle du destinataire, livreur au-dessus de tout, SAUF un livreur Sun (en route vers
 * l'entreprise, vue d'ensemble de l'entreprise) : il passe sous le carré de l'entreprise, qui reste lisible quand
 * plusieurs livreurs convergent vers elle (un livreur arrivé est décalé, `nudge`, et reste visible à côté).
 */
export const MARKER_Z = { pickup: 2, dropoff: 3, driver: 4 } as const;
export const SUN_DRIVER_Z = 1;

function wrap(className: string, kind: keyof typeof MARKER_Z, title?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `yaar-mk ${className}`.trim();
  el.dataset.kind = kind;
  el.style.zIndex = String(MARKER_Z[kind]);
  if (title) {
    el.title = title;
    el.setAttribute('aria-label', title);
    el.setAttribute('role', 'img');
  }
  return el;
}

/**
 * Contenu d'un carré ou d'une goutte : initiales en texte (jamais en HTML : un nom saisi par l'utilisateur ne peut
 * pas injecter de balises), sinon le pictogramme.
 */
function contentBox(className: string, initials: string | null | undefined, glyphSvg: string): HTMLDivElement {
  const box = document.createElement('div');
  box.className = className;
  if (initials) {
    const text = document.createElement('span');
    text.className = 'yaar-initials';
    text.textContent = initials.slice(0, 3);
    box.appendChild(text);
  } else {
    box.innerHTML = glyphSvg;
  }
  return box;
}

/**
 * Entreprise / retrait : carré encre arrondi cerclé de blanc, initiales blanches (`initials`) ou boutique ; radar
 * cobalt doux (`pulse`) pendant la recherche d'un livreur.
 */
export function pickupElement(pulse: boolean, title?: string, initials?: string | null): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-pickup', 'pickup', title);
  if (initials) el.dataset.avatar = '1';
  const radar = pulse
    ? '<div class="yaar-radar-glow"></div><div class="yaar-radar"></div><div class="yaar-radar d2"></div><div class="yaar-radar d3"></div>'
    : '';
  el.innerHTML = radar;
  el.appendChild(contentBox('yaar-pickup-box', initials, artToSvg(STORE_GLYPH, 20)));
  return el;
}

/**
 * Destinataire : goutte cobalt cerclée de blanc dont la pointe touche la position (ancre `bottom`), initiales blanches
 * (`initials`) ou maison ; halo pulsé sous la pointe (`pulse`, livraison en cours).
 */
export function dropoffElement(pulse: boolean, title?: string, initials?: string | null): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-dropoff', 'dropoff', title);
  if (initials) el.dataset.avatar = '1';
  const svg =
    `<svg class="yaar-pin" width="${PIN_BOX.width}" height="${PIN_BOX.height}" viewBox="0 0 ${PIN_BOX.width} ${PIN_BOX.height}" aria-hidden="true" focusable="false">` +
    `<path d="${PIN_PATH}" fill="${MAP_COLORS.dropoff}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  el.innerHTML = `${pulse ? '<div class="yaar-pulse"></div>' : ''}<div class="yaar-pin-dot"></div>${svg}`;
  el.appendChild(contentBox('yaar-pin-content', initials, artToSvg(HOUSE_GLYPH, 16)));
  return el;
}

/** Couleur du marqueur à initiales selon le type : encre pour l'entreprise (retrait), cobalt pour le destinataire. */
export function avatarPinColor(kind: 'pickup' | 'dropoff'): string {
  return kind === 'pickup' ? MAP_COLORS.pickup : MAP_COLORS.dropoff;
}

/**
 * Marqueur à initiales : carré encre de l'entreprise (ancre `center`) ou goutte cobalt du destinataire (ancre
 * `bottom`) ; halo pulsé du destinataire si `pulse`.
 */
export function avatarPinElement(kind: 'pickup' | 'dropoff', initials: string, pulse: boolean, title?: string): HTMLDivElement {
  return kind === 'pickup' ? pickupElement(pulse, title, initials) : dropoffElement(pulse, title, initials);
}

/**
 * Livreur : disque blanc (Sun avec `tone: 'sun'`), véhicule de profil droit ; encoche de cap masquée tant que le cap
 * n'est pas connu. Le premier enfant est l'anneau de l'encoche (seul élément tourné, voir setDriverHeading).
 */
export function driverElement(vehicle: VehicleType, title?: string, tone?: 'sun'): HTMLDivElement {
  ensureMarkerCss();
  const sun = tone === 'sun';
  const el = wrap(`yaar-driver no-heading${sun ? ' is-sun' : ''}`, 'driver', title);
  el.dataset.vehicle = vehicle;
  if (sun) el.style.zIndex = String(SUN_DRIVER_Z);
  const notch = sun ? MAP_COLORS.driverSunNotch : MAP_COLORS.driverGlyph;
  const glyph = sun ? MAP_COLORS.driverSunInk : MAP_COLORS.driverGlyph;
  el.innerHTML =
    '<div class="yaar-driver-heading">' +
    `<svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path d="${NOTCH_PATH}" fill="${notch}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>` +
    `</div><div class="yaar-driver-disc">${artToSvg(vehicleSideGlyph(vehicle, glyph, sun ? C.sun : C.white), 22)}</div>`;
  return el;
}

/**
 * Oriente l'encoche de cap (rotation à l'écran, en degrés) ; null = cap inconnu ou livreur arrêté : pas d'encoche.
 * Seule l'encoche tourne, jamais le pictogramme.
 */
export function setDriverHeading(el: HTMLElement, screenDeg: number | null): void {
  const ring = el.firstElementChild as HTMLElement | null;
  const visible = screenDeg !== null && Number.isFinite(screenDeg);
  el.classList.toggle('no-heading', !visible);
  if (visible && ring) {
    const t = `rotate(${Math.round(screenDeg * 10) / 10}deg)`;
    if (ring.style.transform !== t) ring.style.transform = t;
  }
}
