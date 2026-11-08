import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';
import { artToSvg, HOUSE_GLYPH, STORE_GLYPH, vehicleGlyph } from './markerArt';

/**
 * Ne jamais fixer `position` sur l'élément racine d'un marqueur : MapLibre le place avec
 * `.maplibregl-marker { position: absolute }` (une règle de même spécificité injectée après l'écraserait).
 *
 * Marqueurs HTML des cartes MapLibre (web) : entreprise (carré orange), destinataire (épingle verte pulsée),
 * livreur (rond blanc avec le véhicule vu du dessus, orienté selon son cap), radar « recherche d'un livreur ».
 */
const CSS = `
.yaar-mk{cursor:default;-webkit-tap-highlight-color:transparent}
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
.yaar-driver{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;
  box-shadow:0 5px 14px rgba(15,46,34,.34),0 0 0 1px rgba(15,46,34,.07)}
.yaar-driver-nose{position:absolute;top:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;
  border-right:6px solid transparent;border-bottom:8px solid ${MAP_COLORS.route}}
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

function wrap(className: string, title?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `yaar-mk ${className}`;
  if (title) {
    el.title = title;
    el.setAttribute('aria-label', title);
    el.setAttribute('role', 'img');
  }
  return el;
}

export function pickupElement(pulse: boolean, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('', title);
  el.dataset.kind = 'pickup';
  const radar = pulse ? '<div class="yaar-radar"></div><div class="yaar-radar d2"></div><div class="yaar-radar d3"></div>' : '';
  el.innerHTML = `${radar}<div class="yaar-pickup">${artToSvg(STORE_GLYPH, 22)}</div>`;
  return el;
}

export function dropoffElement(pulse: boolean, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-dropoff', title);
  el.dataset.kind = 'dropoff';
  el.innerHTML = `${pulse ? '<div class="yaar-pulse"></div>' : ''}<div class="yaar-pin-dot"></div><div class="yaar-pin"><div class="yaar-pin-glyph">${artToSvg(HOUSE_GLYPH, 20)}</div></div>`;
  return el;
}

export function driverElement(vehicle: VehicleType, title?: string): HTMLDivElement {
  ensureMarkerCss();
  const el = wrap('yaar-driver', title);
  el.dataset.kind = 'driver';
  el.dataset.vehicle = vehicle;
  el.innerHTML = `<div class="yaar-driver-nose"></div>${artToSvg(vehicleGlyph(vehicle), 30)}`;
  return el;
}
