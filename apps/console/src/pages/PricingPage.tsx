import { useEffect, useState, type FormEvent } from 'react';
import {
  LABELS,
  computeDeliveryPrice,
  pricingRuleUpdateSchema,
  type PricingRuleDto,
  type VehicleType,
} from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { Card, ErrorBanner, Loading, VEHICLE_ICON } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime, formatFcfa } from '../lib/format';

export interface PricingDraft {
  baseFare: string;
  perKm: string;
  minimumFare: string;
  commissionPercent: string;
  isActive: boolean;
}

export function draftFromRule(r: PricingRuleDto): PricingDraft {
  return {
    baseFare: String(r.baseFare),
    perKm: String(r.perKm),
    minimumFare: String(r.minimumFare),
    commissionPercent: String(r.commissionPercent),
    isActive: r.isActive,
  };
}

function toNumber(s: string): number {
  return s.trim() === '' ? Number.NaN : Number(s.replace(',', '.'));
}

/** Valide un brouillon avec le schéma partagé ; renvoie l'entrée API ou les messages d'erreur. */
export function parseDraft(
  d: PricingDraft,
):
  | { ok: true; value: { baseFare: number; perKm: number; minimumFare: number; commissionPercent: number; isActive: boolean } }
  | { ok: false; errors: Record<string, string> } {
  const res = pricingRuleUpdateSchema.safeParse({
    baseFare: toNumber(d.baseFare),
    perKm: toNumber(d.perKm),
    minimumFare: toNumber(d.minimumFare),
    commissionPercent: toNumber(d.commissionPercent),
    isActive: d.isActive,
  });
  if (res.success) return { ok: true, value: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? '_');
    errors[key] ??= issue.code === 'invalid_type' ? 'Nombre requis' : issue.message;
  }
  return { ok: false, errors };
}

/** Aperçu « 6 km en moto = 1 950 FCFA » avec la grille en cours d'édition. */
export function previewLine(vehicleType: VehicleType, value: { baseFare: number; perKm: number; minimumFare: number; commissionPercent: number }, km: number): string {
  const p = computeDeliveryPrice({ vehicleType, ...value }, km);
  return `${km} km en ${LABELS.vehicleType[vehicleType].toLowerCase()} = ${formatFcfa(p.deliveryFee)} (livreur ${formatFcfa(p.driverEarning)})`;
}

const PREVIEW_KM = [2, 6, 12];

function RuleEditor({ rule, onSaved }: { rule: PricingRuleDto; onSaved: (r: PricingRuleDto) => void }) {
  const api = useApi();
  const [draft, setDraft] = useState<PricingDraft>(() => draftFromRule(rule));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(draftFromRule(rule)), [rule]);

  const parsed = parseDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromRule(rule));

  function field(key: Exclude<keyof PricingDraft, 'isActive'>, label: string, suffix: string) {
    const err = parsed.ok ? undefined : parsed.errors[key];
    const id = `${rule.vehicleType}-${key}`;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <span className="input-suffix">
          <input
            id={id}
            inputMode="numeric"
            value={draft[key]}
            aria-invalid={err ? true : undefined}
            onChange={(e) => {
              setSaved(false);
              setDraft((d) => ({ ...d, [key]: e.target.value }));
            }}
          />
          <span>{suffix}</span>
        </span>
        {err && <span className="field-error">{err}</span>}
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updatePricingRule(rule.vehicleType, parsed.value);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <>
          {VEHICLE_ICON[rule.vehicleType]} {LABELS.vehicleType[rule.vehicleType]}
        </>
      }
      aside={<span className="muted small">Modifié le {formatDateTime(rule.updatedAt)}</span>}
    >
      <form className="form" onSubmit={submit} aria-label={`Tarif ${LABELS.vehicleType[rule.vehicleType]}`}>
        {field('baseFare', 'Prise en charge', 'FCFA')}
        {field('perKm', 'Prix par km', 'FCFA/km')}
        {field('minimumFare', 'Minimum', 'FCFA')}
        {field('commissionPercent', 'Commission plateforme', '%')}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => {
              setSaved(false);
              setDraft((d) => ({ ...d, isActive: e.target.checked }));
            }}
          />
          Proposé aux entreprises
        </label>
        <div className="preview" aria-live="polite">
          {parsed.ok ? (
            <ul>
              {PREVIEW_KM.map((km) => (
                <li key={km}>{previewLine(rule.vehicleType, parsed.value, km)}</li>
              ))}
            </ul>
          ) : (
            <span className="muted">Corrigez les champs pour voir l’aperçu.</span>
          )}
        </div>
        <ErrorBanner message={error} />
        {saved && !dirty && <div className="alert alert-success">Tarif enregistré (nouvelles livraisons uniquement).</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={!dirty || busy} onClick={() => setDraft(draftFromRule(rule))}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || !parsed.ok || busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Card>
  );
}

/** Grille tarifaire par véhicule : prix = max(minimum, base + prix/km × distance), arrondi au 50 FCFA supérieur. */
export function PricingPage() {
  const api = useApi();
  const rules = useAsync(() => api.pricingRules(), [api]);

  return (
    <div className="page">
      <h1>Tarifs</h1>
      <p className="muted">
        Prix de livraison = max(minimum, prise en charge + prix/km × distance routière estimée), arrondi aux 50 FCFA
        supérieurs. Les changements s’appliquent aux nouveaux devis et livraisons.
      </p>
      <ErrorBanner message={rules.error} onRetry={() => rules.reload()} />
      {rules.loading && !rules.data ? (
        <Loading />
      ) : (
        <div className="grid-3">
          {(rules.data ?? []).map((r) => (
            <RuleEditor
              key={r.vehicleType}
              rule={r}
              onSaved={(updated) =>
                rules.setData((prev) => (prev ? prev.map((x) => (x.vehicleType === updated.vehicleType ? updated : x)) : prev))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
