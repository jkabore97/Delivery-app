import { LABELS, type OrderDto } from '@yaar/shared';
import { cashSplit, etaCell, FEE_PAYER_LABEL, isBusinessDelivery, nbsp, statusLabel } from '../lib/delivery';
import { formatFcfa, formatPhone, formatTime } from '../lib/format';
import { stageOf } from '../lib/map/scene';
import { Icon } from './Icon';
import { Avatar } from './ui';

interface Step {
  label: string;
  time: string | null;
  /** done = étape franchie, now = en cours (à moitié remplie), next = à venir. */
  state: 'done' | 'now' | 'next';
  approx?: boolean;
}

/** Quatre étapes de la livraison, comme les pilules segmentées de l'application (Demandée · … · Livrée). */
export function deliverySteps(o: OrderDto, nowMs: number): Step[] {
  const stage = stageOf(o.status);
  const order = ['searching', 'toPickup', 'toDropoff', 'delivered'] as const;
  const reached = stage === 'pending' ? 0 : stage === 'cancelled' ? -1 : order.indexOf(stage as (typeof order)[number]) + 1;
  const state = (i: number): Step['state'] => (i < reached ? 'done' : i === reached ? 'now' : 'next');
  const eta = etaCell(o.etaMinutes, nowMs);
  return [
    { label: 'Demandée', time: formatTime(o.createdAt), state: 'done' },
    { label: 'Livreur affecté', time: o.assignedAt ? formatTime(o.assignedAt) : null, state: state(1) },
    { label: 'Colis récupéré', time: o.pickedUpAt ? formatTime(o.pickedUpAt) : null, state: state(2) },
    {
      label: 'Livrée',
      time: o.deliveredAt ? formatTime(o.deliveredAt) : eta?.clock || null,
      state: o.status === 'DELIVERED' ? 'done' : state(3),
      approx: !o.deliveredAt && !!eta?.clock,
    },
  ];
}

const STEP_STATE_TEXT: Record<Step['state'], string> = { done: 'faite', now: 'en cours', next: 'à venir' };

/** Minutes écoulées depuis l'entrée en recherche d'un livreur (dernier passage en SEARCHING_DRIVER). */
function searchingSinceMin(o: OrderDto, nowMs: number): number {
  const ev = [...(o.events ?? [])].reverse().find((e) => e.toStatus === 'SEARCHING_DRIVER');
  const from = Date.parse(ev?.createdAt ?? o.createdAt);
  return Math.max(0, Math.round((nowMs - from) / 60_000));
}

/**
 * Tuile héros cobalt de la fiche (la seule de l'écran) pendant la livraison : heure d'arrivée en très grand, étape en
 * cours, pilules d'avancement, livreur, destinataire et espèces à encaisser (pilule soleil). Livraison terminée ou
 * annulée : un récapitulatif blanc.
 */
export function DeliveryHero({
  o,
  nowMs,
  stageText,
  details,
}: {
  o: OrderDto;
  nowMs: number;
  /** Étape en cours en clair (« Livreur en route vers le retrait (Tech Plus) »). */
  stageText: string;
  /** Précisions de l'étape (itinéraire restant, arrivée chez le destinataire). */
  details: string[];
}) {
  const stage = stageOf(o.status);
  const business = isBusinessDelivery(o);
  const status = statusLabel(o.status, business);

  if (stage === 'delivered' || stage === 'cancelled' || stage === 'pending') {
    const delivered = stage === 'delivered';
    const cancelled = stage === 'cancelled';
    const at = delivered ? o.deliveredAt : cancelled ? o.cancelledAt : o.createdAt;
    const minutes = delivered && o.deliveredAt ? Math.round((Date.parse(o.deliveredAt) - Date.parse(o.createdAt)) / 60_000) : null;
    const whenLabel = delivered ? 'Livrée à' : cancelled ? 'Annulée à' : 'Demandée à';
    return (
      <section className="summary-tile" aria-label="Récapitulatif de la livraison">
        <span className={`summary-disc${cancelled ? ' is-cancelled' : delivered ? '' : ' is-pending'}`} aria-hidden="true">
          <Icon name={delivered ? 'check' : cancelled ? 'close' : 'clock'} size={24} strokeWidth={2.6} />
        </span>
        <div className="summary-main">
          <b>{stageText}</b>
          <span>
            {delivered && o.driver?.name ? `par ${o.driver.name}` : null}
            {delivered && minutes !== null ? ` · ${minutes} min après la demande` : null}
            {cancelled ? (o.cancelReason ? `Motif\u00a0: ${o.cancelReason}` : 'Sans motif') : null}
            {!delivered && !cancelled ? `Demande reçue · ${status}` : null}
          </span>
        </div>
        {at && (
          <span className="summary-when">
            <span className="summary-when-label">{whenLabel}</span>
            <time className="summary-time" dateTime={at}>
              {formatTime(at)}
            </time>
          </span>
        )}
      </section>
    );
  }

  const eta = etaCell(o.etaMinutes, nowMs);
  const cash = cashSplit(o);
  const steps = deliverySteps(o, nowMs);
  const searching = stage === 'searching';
  const waited = searching ? searchingSinceMin(o, nowMs) : 0;
  const d = o.driver;
  // L'heure d'arrivée est déjà écrite en très grand : la précision « Destinataire : arrivée vers… » ne la répète pas.
  const notes = eta?.clock && !searching ? details.filter((t) => !t.startsWith('Destinataire')) : details;

  return (
    <section className="hero" aria-label="Livraison en cours">
      <div className="hero-grid">
        <div className="hero-left">
          {/* Le n° et le statut sont dans le titre de la page : la puce dit que la tuile suit la livraison en direct. */}
          <div className="hero-top">
            <span className="hero-chip">En direct</span>
            <span className="hero-id">
              {LABELS.vehicleType[o.vehicleType]}
              <span className="sr-only"> · {status}</span>
            </span>
          </div>
          {searching ? (
            <>
              <p className="hero-eta-label">En attente d’un livreur depuis</p>
              <div className="hero-eta">
                <b>{waited}</b>
                <span>min</span>
              </div>
            </>
          ) : eta?.clock ? (
            <>
              <p className="hero-eta-label">Arrivée chez le destinataire</p>
              <div className="hero-eta">
                <b>{eta.clock}</b>
                <span>dans {nbsp(eta.duration)}</span>
              </div>
            </>
          ) : (
            <>
              <p className="hero-eta-label">Arrivée chez le destinataire</p>
              <div className="hero-eta">
                <b className="hero-eta-none">en calcul</b>
              </div>
            </>
          )}
          <ul className="hero-notes" aria-label="Étape en cours">
            <li>
              <Icon name="route" size={16} />
              {stageText}
            </li>
            {notes.map((t) => (
              <li key={t}>
                <Icon name={t.startsWith('Destinataire') ? 'clock' : 'navigation'} size={16} />
                {t}
              </li>
            ))}
          </ul>
          <ol className="steps" aria-label="Avancement">
            {steps.map((s) => (
              <li key={s.label} className={s.state} aria-current={s.state === 'now' ? 'step' : undefined}>
                <span className="seg">{s.state === 'now' && <i />}</span>
                <b>
                  {s.label}
                  <span className="sr-only"> ({STEP_STATE_TEXT[s.state]})</span>
                </b>
                <span className="tm">
                  {s.approx && <span className="sr-only">environ </span>}
                  {s.approx && <Icon name="approx" size={12} strokeWidth={2.4} />}
                  {s.time ?? (s.state === 'now' ? 'en cours' : '-')}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hero-panel">
          {d ? (
            <div className="hero-person">
              <Avatar name={d.name} tone="sun" />
              <div className="hero-person-text">
                <b>{d.name ?? 'Livreur'}</b>
                <span className="hero-meta">
                  {d.ratingAvg !== null && (
                    <>
                      <Icon name="star" size={13} />
                      {d.ratingAvg.toFixed(1).replace('.', ',')} ·{' '}
                    </>
                  )}
                  {LABELS.vehicleType[d.vehicleType]}
                  {d.plate ? ` · ${d.plate}` : ''}
                </span>
              </div>
              {d.phone && (
                <a className="hero-call" href={`tel:${d.phone}`} aria-label={`Appeler le livreur (${formatPhone(d.phone)})`} title="Appeler le livreur">
                  <Icon name="phone" size={18} />
                </a>
              )}
            </div>
          ) : (
            <p className="hero-empty">Aucun livreur affecté pour l’instant : affectation automatique en cours.</p>
          )}
          <div className="hero-hr" />
          <div className="hero-recipient">
            <b>{o.recipientName ?? o.client?.name ?? 'Destinataire'}</b>
            <span className="hero-meta">{o.dropoff?.address ?? 'Adresse masquée'}</span>
            {o.dropoff?.landmark ? <span className="hero-meta">Repère «{'\u00a0'}{o.dropoff.landmark}{'\u00a0'}»</span> : null}
          </div>
          <div className="hero-hr" />
          <div className="hero-cash">
            <span>
              <span className="k">{cash.atDropoff > 0 ? 'À encaisser' : 'Rien à encaisser'}</span>
              <span className="d">
                {cash.business
                  ? `${cash.goods > 0 ? `marchandise ${formatFcfa(cash.goods)}` : 'pas de marchandise'}${
                      cash.feePaidBy ? ` · frais\u00a0: ${FEE_PAYER_LABEL[cash.feePaidBy].toLowerCase()}` : ''
                    }`
                  : `${LABELS.paymentMethod[o.paymentMethod]}`}
              </span>
            </span>
            {cash.atDropoff > 0 && <span className="sunpill">{formatFcfa(cash.atDropoff)}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
