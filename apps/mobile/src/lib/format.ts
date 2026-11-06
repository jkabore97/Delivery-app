import { formatFcfa, type OrderItemDto } from '@yaar/shared';

export { formatFcfa };

/** Montant court comme sur les maquettes : « 6 500 F ». */
export function formatFcfaShort(amount: number): string {
  return formatFcfa(amount).replace(' FCFA', ' F');
}

/** « il y a 3 min », « il y a 2 h », « à l’instant ». */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (diffSec < 45) return 'à l’instant';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

/** Heure locale de Ouagadougou (UTC+0) au format 14:05. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Date courte 06/11/2026 14:05 (UTC = heure de Ouagadougou). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mo}/${d.getUTCFullYear()} ${formatTime(iso)}`;
}

/** « 2× Riz gras poulet · 1× Bissap 50 cl » */
export function summarizeItems(items: Pick<OrderItemDto, 'name' | 'quantity'>[]): string {
  return items.map((i) => `${i.quantity}× ${i.name}`).join(' · ');
}

export function formatOrderNumber(n: number): string {
  return `#${n}`;
}

export function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Initiales pour l'avatar : « Issouf S. » → « IS ». */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}
