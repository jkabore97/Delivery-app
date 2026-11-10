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
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { Banner, Card, ErrorBanner, Loading, VEHICLE_ICON } from '../components/ui';
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
          {/* Second libellé du champ : lu avec lui (« Prise en charge FCFA »), un clic sur l'unité y place le curseur. */}
          <label htmlFor={id} className="input-unit">
            {suffix}
          </label>
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
        <span className="rule-title">
          <span className="vehicle-disc" aria-hidden="true">
            <Icon name={VEHICLE_ICON[rule.vehicleType]} size={20} />
          </span>
          {LABELS.vehicleType[rule.vehicleType]}
        </span>
      }
      aside={<span className="tnum">Modifié le {formatDateTime(rule.updatedAt)}</span>}
    >
      <form className="form rule-form" onSubmit={submit} aria-label={`Tarif ${LABELS.vehicleType[rule.vehicleType]}`}>
        <div className="rule-fields">
          {field('baseFare', 'Prise en charge', 'FCFA')}
          {field('perKm', 'Prix par km', 'FCFA/km')}
          {field('minimumFare', 'Minimum', 'FCFA')}
          {field('commissionPercent', 'Commission plateforme', '%')}
        </div>
        <label className="checkbox rule-active">
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
          <div className="preview-title">Exemples avec cette grille</div>
          {parsed.ok ? (
            <ul className="preview-list">
              {PREVIEW_KM.map((km) => {
                const p = computeDeliveryPrice({ vehicleType: rule.vehicleType, ...parsed.value }, km);
                return (
                  <li key={km} title={previewLine(rule.vehicleType, parsed.value, km)}>
                    <span className="tnum">{km}\u00a0km</span>
                    <span>
                      <b>{formatFcfa(p.deliveryFee)}</b>
                      <span className="tnum"> · livreur {formatFcfa(p.driverEarning)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="muted">Corrigez les champs pour voir l’aperçu.</span>
          )}
        </div>
        <ErrorBanner message={error} />
        {saved && !dirty && <Banner tone="success">Tarif enregistré (nouvelles livraisons uniquement).</Banner>}
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
      <PageTitle>Tarifs</PageTitle>
      <p className="page-lead">
        Prix de livraison = max(minimum, prise en charge + prix/km × distance routière estimée), arrondi aux 50 FCFA
        supérieurs. Les changements s’appliquent aux nouveaux devis et livraisons.
      </p>
      <ErrorBanner message={rules.error} onRetry={() => rules.reload()} />
      {!rules.data ? (
        rules.loading ? <Loading /> : null
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
