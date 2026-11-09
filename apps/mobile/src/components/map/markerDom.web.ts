import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';
import { artToSvg, HOUSE_GLYPH, STORE_GLYPH, vehicleSideGlyph } from './markerArt';

/**
 * Ne jamais fixer `position` sur l'élément racine d'un marqueur : MapLibre le place avec
 * `.maplibregl-marker { position: absolute }` (une règle de même spécificité injectée après l'écraserait).
 *
 * Marqueurs HTML des cartes MapLibre (web), mêmes formes que la console : entreprise (carré orange), destinataire
 * (épingle verte pulsée), livreur (disque vert cerclé de blanc, véhicule de profil toujours droit, petit chevron
 * séparé sur l'anneau orienté selon le cap, masqué à l'arrêt), radar « recherche d'un livreur ». En option
 * (`initials` d'un marqueur) : épingle « avatar » aux initiales du destinataire ou de l'entreprise.
 */
const CSS = `
.yaar-mk{cursor:default;-webkit-tap-highlight-color:transparent}
.yaar-mk svg{display:block}
.yaar-pickup{width:38px;height:38px;border-radius:12px;background:${MAP_COLORS.pickup};border:3px solid #fff;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,46,34,.32),0 1px 2px rgba(15,46,34,.2);position:relative;z-index:2}
.yaar-radar{position:absolute;left:50%;top:50%;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;
  background:rgba(242,140,27,.28);border:2px solid rgba(242,140,27,.55);box-sizing:border-box;pointer-events:none;z-index:1;
  animation:yaar-radar 2.7s cubic-bezier(.2,.6,.35,1) infinite}
.yaar-radar.d2{animation-delay:.9s}.yaar-radar.d3{animation-delay:1.8s}
@keyframes yaar-radar{0%{transform:scale(1);opacity:.8}100%{transform:scale(4.2);opacity:0}}
.yaar-dropoff{width:40px;height:42px}
.yaar-pin{position:absolute;left:3px;top:0;width:34px;height:34px;border-radius:50% 50% 50% 0;background:${MAP_COLORS.dropoff};
  border:3px solid #fff;box-sizing:border-box;transform:rotate(-45deg);box-shadow:-2px 3px 10px rgba(15,46,34,.32);z-index:2}
.yaar-pin-glyph{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;transform:rotate(45deg)}
.yaar-pin-dot{position:absolute;left:50%;bottom:1px;width:8px;height:4px;margin-left:-4px;border-radius:50%;background:rgba(15,46,34,.35)}
.yaar-pulse{position:absolute;left:50%;bottom:-7px;width:16px;height:16px;margin-left:-8px;border-radius:50%;
  background:rgba(11,122,75,.32);pointer-events:none;z-index:1;animation:yaar-pulse 2.2s ease-out infinite}
@keyframes yaar-pulse{0%{transform:scale(.6);opacity:.95}100%{transform:scale(3.4);opacity:0}}
.yaar-driver{width:44px;height:44px}
.yaar-driver-disc{position:absolute;inset:0;border-radius:50%;background:${MAP_COLORS.driver};border:3px solid ${MAP_COLORS.driverRing};
  box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,46,34,.36),0 0 0 1px rgba(15,46,34,.08);z-index:2}
.yaar-driver-heading{position:absolute;inset:-11px;pointer-events:none;z-index:1}
.yaar-driver-chevron{position:absolute;left:50%;top:0;width:16px;height:12px;margin-left:-8px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
.yaar-driver.no-heading .yaar-driver-heading{display:none}
.yaar-avatar{width:48px;height:49px}
.yaar-avatar-pin{position:absolute;left:4px;top:0;width:40px;height:40px;border-radius:50% 50% 50% 0;border:3px solid #fff;
  box-sizing:border-box;transform:rotate(-45deg);box-shadow:-2px 3px 10px rgba(15,46,34,.34);z-index:2}
.yaar-avatar-text{position:absolute;left:4px;top:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;
  color:#fff;font:900 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.3px;
  z-index:3;pointer-events:none;user-select:none}
@media (prefers-reduced-motion: reduce){.yaar-radar,.yaar-pulse{animation:none;opacity:.35}}
`;

/** Chevron de cap : pointe vers le haut (nord de l'élément), vert à liseré blanc. */
const CHEVRON_SVG = `<svg class="yaar-driver-chevron" viewBox="0 0 16 12" aria-hidden="true" focusable="false"><path d="M1.2 10.8 8 1.2l6.8 9.6L8 8.2Z" fill="${MAP_COLORS.driver}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

let injected = false;

export function ensureMarkerCss(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'yaar-map-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Empilement : entreprise sous l'épingle du destinataire, livreur au-dessus de tout. */
export const MARKER_Z = { pickup: 2, dropoff: 3, driver: 4 } as const;

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

export function pickupElement(pulse: boolean, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('', 'pickup', title);
  const radar = pulse ? '<div class="yaar-radar"></div><div class="yaar-radar d2"></div><div class="yaar-radar d3"></div>' : '';
  el.innerHTML = `${radar}<div class="yaar-pickup">${artToSvg(STORE_GLYPH, 22)}</div>`;
  return el;
}

export function dropoffElement(pulse: boolean, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-dropoff', 'dropoff', title);
  el.innerHTML = `${pulse ? '<div class="yaar-pulse"></div>' : ''}<div class="yaar-pin-dot"></div><div class="yaar-pin"><div class="yaar-pin-glyph">${artToSvg(HOUSE_GLYPH, 20)}</div></div>`;
  return el;
}

/** Couleur de l'épingle « avatar » selon le type : orange pour l'entreprise (retrait), vert pour le destinataire. */
export function avatarPinColor(kind: 'pickup' | 'dropoff'): string {
  return kind === 'pickup' ? MAP_COLORS.pickup : MAP_COLORS.dropoff;
}

/**
 * Épingle « avatar » : initiales (blanches) dans un disque de la couleur du type, cerclé de blanc, dont la pointe
 * touche la position (ancre `bottom` : la pointe est à 48,3 px du haut d'un élément de 49 px). Destinataire : halo
 * pulsé sous la pointe si `pulse`.
 */
export function avatarPinElement(kind: 'pickup' | 'dropoff', initials: string, pulse: boolean, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-avatar', kind, title);
  el.dataset.avatar = '1';
  const pin = document.createElement('div');
  pin.className = 'yaar-avatar-pin';
  pin.style.background = avatarPinColor(kind);
  const text = document.createElement('div');
  text.className = 'yaar-avatar-text';
  // textContent (jamais innerHTML) : un nom saisi par l'utilisateur ne peut pas injecter de HTML.
  text.textContent = initials.slice(0, 3);
  el.innerHTML = `${pulse ? '<div class="yaar-pulse"></div>' : ''}<div class="yaar-pin-dot"></div>`;
  el.appendChild(pin);
  el.appendChild(text);
  return el;
}

/** Livreur : disque vert, véhicule de profil droit ; chevron de cap masqué tant que le cap n'est pas connu. */
export function driverElement(vehicle: VehicleType, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-driver no-heading', 'driver', title);
  el.dataset.vehicle = vehicle;
  el.innerHTML = `<div class="yaar-driver-heading">${CHEVRON_SVG}</div><div class="yaar-driver-disc">${artToSvg(vehicleSideGlyph(vehicle), 26)}</div>`;
  return el;
}

/**
 * Oriente le chevron de cap (rotation à l'écran, en degrés) ; null = cap inconnu ou livreur arrêté : pas de chevron.
 * Seul le chevron tourne, jamais le pictogramme.
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
