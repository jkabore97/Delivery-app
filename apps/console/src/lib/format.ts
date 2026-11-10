import { formatFcfa } from '@yaar/shared';

export { formatFcfa };

const TZ = 'Africa/Ouagadougou';

const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : dateTimeFmt.format(d);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : timeFmt.format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : dateFmt.format(d);
}

/**
 * Durée d'attente : « m:ss » sous une heure (le chrono qui bouge compte), puis « 1 h 02 », puis « 2 j 3 h »
 * au-delà d'un jour (une commande oubliée ne doit pas afficher « 24:52:06 »).
 */
export function formatWaiting(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return h > 0 ? `${d}\u00A0j ${h}\u00A0h` : `${d}\u00A0j`;
  if (h > 0) return `${h}\u00A0h ${m.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** « il y a 2 min » à partir d'une date ISO. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return 'à l’instant';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  return `il y a ${days} j`;
}

/**
 * Montant d'une tuile d'indicateur, nombre et unité séparés (l'unité s'affiche plus petite) :
 * 1 840 000 -> { value: « 1,84 M », unit: « FCFA » } ; 90 500 -> { value: « 90 500 », unit: « FCFA » }.
 */
export function splitFcfaCompact(amount: number, compact = true): { value: string; unit: string } {
  if (compact && Math.abs(amount) >= 1_000_000) {
    const v = (amount / 1_000_000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    return { value: `${v} M`, unit: 'FCFA' };
  }
  return { value: formatFcfa(amount).replace(/\s*FCFA$/, ''), unit: 'FCFA' };
}

/** Initiales pour les avatars (« Ousmane B. » -> « OB »). */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const m = /^\+226(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+226 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return '-';
  return `${km.toFixed(1).replace('.', ',')}\u00a0km`;
}
