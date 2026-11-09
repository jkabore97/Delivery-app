import type { DashboardDto, VehicleType } from '@yaar/shared';
import { LABELS } from '@yaar/shared';
import { splitFcfaCompact } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { VEHICLE_ICON } from './ui';

/** Espace insécable : un nombre reste collé à son mot, son unité ou son pictogramme (« 5 min », « Moto 61 »). */
const NBSP = '\u00a0';

export interface Kpi {
  label: string;
  icon: IconName;
  /** Nombre en très grand (800, chiffres tabulaires). */
  value: string;
  /** Unité plus petite collée au nombre (« min », « FCFA »). */
  unit?: string;
  /**
   * Précision courte attachée au nombre (« 40 en course ») : à côté du nombre quand la tuile est assez large, sinon d'un
   * bloc sur la ligne en dessous, jamais coupée au milieu.
   */
  note?: string;
  /** Ligne du bas ; `vehicles` : répartition des livreurs en ligne par véhicule (pictogrammes). */
  sub: string;
  vehicles?: Record<VehicleType, number>;
  tone: 'green' | 'red' | 'muted';
  /**
   * Apparence : `cobalt` = LA tuile héros de l'écran (livraisons en cours), `sun` = espèces, `alert` = problème à
   * traiter (pastille et pictogramme corail), `mint` = réussite (pictogramme menthe).
   */
  look?: 'cobalt' | 'sun' | 'alert' | 'mint';
}

/**
 * Tuiles d'indicateurs de la carte en direct : six côte à côte (≈ 150 à 190 px chacune), nombre en 800, libellé 13/600,
 * pictogramme dans un disque teinté en haut à gauche. Une seule tuile cobalt (héros), la tuile des espèces en soleil.
 */
export function buildKpis(d: DashboardDto): Kpi[] {
  const plural = (n: number, word: string) => `${n}${NBSP}${word}${n > 1 ? 's' : ''}`;
  const cash = splitFcfaCompact(d.cashHeldTotal);
  const late = d.avgDeliveryMinutesToday !== null && d.avgDeliveryMinutesToday > 30;
  return [
    {
      label: 'Livreurs en ligne',
      icon: 'moto',
      value: String(d.onlineDrivers.total),
      note: `${d.onlineDrivers.busy}${NBSP}en${NBSP}course`,
      sub: '',
      vehicles: d.onlineDrivers.byVehicle,
      tone: 'muted',
    },
    {
      label: 'Livraisons en cours',
      icon: 'package',
      value: String(d.activeOrders),
      sub: `${plural(d.cancelledToday, 'annulée')} aujourd'hui`,
      tone: 'muted',
      look: 'cobalt',
    },
    {
      label: "En attente d'un livreur",
      icon: 'search',
      value: String(d.waitingForDriver),
      sub: d.waitingOver5Min > 0 ? `${d.waitingOver5Min}${NBSP}depuis plus de 5${NBSP}min` : 'aucune attente longue',
      tone: d.waitingOver5Min > 0 ? 'red' : 'green',
      look: d.waitingOver5Min > 0 ? 'alert' : undefined,
    },
    {
      label: "Livrées aujourd'hui",
      icon: 'check',
      value: String(d.deliveredToday),
      sub: `${plural(d.openIncidents, 'incident')} ouvert${d.openIncidents > 1 ? 's' : ''}`,
      tone: d.openIncidents > 0 ? 'red' : 'green',
      look: 'mint',
    },
    {
      label: 'Délai moyen',
      icon: 'clock',
      value: d.avgDeliveryMinutesToday === null ? '-' : String(d.avgDeliveryMinutesToday),
      unit: d.avgDeliveryMinutesToday === null ? undefined : 'min',
      sub: `objectif <${NBSP}30${NBSP}min`,
      tone: late ? 'red' : 'green',
      look: late ? 'alert' : undefined,
    },
    {
      label: 'Cash détenu par les livreurs',
      icon: 'wallet',
      value: cash.value,
      unit: cash.unit,
      sub: d.driversAtCashLimit > 0 ? `${plural(d.driversAtCashLimit, 'livreur')} au plafond` : 'aucun livreur au plafond',
      tone: d.driversAtCashLimit > 0 ? 'red' : 'green',
      look: 'sun',
    },
  ];
}

const VEHICLES: VehicleType[] = ['BIKE', 'MOTO', 'CAR'];

/** Tuile d'indicateur (aussi utilisée par la caisse). */
export function KpiTile({ k }: { k: Kpi }) {
  const look = k.look ? ` kpi-${k.look}` : '';
  return (
    <article className={`kpi${look}`} aria-label={k.label}>
      <div className="kpi-top">
        <span className="kpi-icon" aria-hidden="true">
          <Icon name={k.icon} size={18} />
        </span>
        {k.look === 'alert' && <span className="kpi-flag" aria-hidden="true" />}
      </div>
      <div className="kpi-value">
        <span className="kpi-number">
          {k.value}
          {/* Espace ordinaire : sans effet sur la mise en page (flex), présente dans le texte (« 25 500 FCFA »). */}
          {k.unit && ' '}
          {k.unit && <span className="kpi-unit">{k.unit}</span>}
        </span>
        {k.note && <span className="kpi-note">{k.note}</span>}
      </div>
      <div className="kpi-label">{k.label}</div>
      {k.sub === '' && !k.vehicles ? null : k.vehicles ? (
        <div className="kpi-sub kpi-vehicles-line">
          {VEHICLES.map((vt) => (
            <span key={vt} className="kpi-vehicles" title={LABELS.vehicleType[vt]}>
              <Icon name={VEHICLE_ICON[vt]} size={15} />
              {/* Lu « Moto 61 » ; à l'écran, le pictogramme tient lieu du mot. */}
              <span className="sr-only">{`${LABELS.vehicleType[vt]}${NBSP}`}</span>
              {k.vehicles![vt]}
            </span>
          ))}
        </div>
      ) : (
        <div className={`kpi-sub tone-${k.tone}`}>
          {k.tone === 'red' && <i className="alert-dot" aria-hidden="true" />}
          {k.sub}
        </div>
      )}
    </article>
  );
}

export function KpiCards({ dashboard }: { dashboard: DashboardDto }) {
  return (
    <div className="kpis">
      {buildKpis(dashboard).map((k) => (
        <KpiTile key={k.label} k={k} />
      ))}
    </div>
  );
}
