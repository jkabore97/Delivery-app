import { useId, useState } from 'react';
import type { CsvExportKind } from '../api/client';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';

const FILENAMES: Record<CsvExportKind, string> = {
  orders: 'yaar-commandes',
  'cash-ledger': 'yaar-caisse',
};

/** Nom du fichier téléchargé : yaar-commandes_2026-11-01_2026-11-07.csv */
export function exportFilename(kind: CsvExportKind, from?: string, to?: string): string {
  return `${FILENAMES[kind]}${from ? `_${from}` : ''}${to ? `_${to}` : ''}.csv`;
}

/** Déclenche le téléchargement d'un blob (l'export exige l'en-tête Authorization : pas de lien direct). */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export CSV (§8.9) sur une période facultative : « du » inclus, « au » inclus pour l'utilisateur
 * (l'API attend une borne `to` exclue : on envoie le lendemain).
 */
export function CsvExport({ kind, label }: { kind: CsvExportKind; label: string }) {
  const api = useApi();
  const fromId = useId();
  const toId = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const toExclusive = to ? nextDay(to) : undefined;
      const blob = await api.exportCsv(kind, { from: from || undefined, to: toExclusive });
      saveBlob(blob, exportFilename(kind, from || undefined, to || undefined));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const invalid = !!from && !!to && to < from;
  return (
    <div className="filters" role="group" aria-label={label}>
      <label htmlFor={fromId}>
        Du
        <input id={fromId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label htmlFor={toId}>
        Au
        <input id={toId} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="button" className="btn btn-ghost" disabled={busy || invalid} onClick={() => void run()}>
        {busy ? 'Export…' : `⬇ ${label}`}
      </button>
      <span className="muted small">Sans adresses ni téléphones clients · export enregistré dans le journal d’audit</span>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** « 2026-11-07 » → « 2026-11-08 » (dates calendaires UTC = heure de Ouagadougou). */
export function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
