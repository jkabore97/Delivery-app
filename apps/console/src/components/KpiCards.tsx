import type { DashboardDto } from '@yaar/shared';
import { formatFcfaCompact } from '../lib/format';
import { VEHICLE_ICON } from './ui';

interface Kpi {
  label: string;
  value: string;
  /**
   * Précision courte attachée au nombre (« 2 en course ») : à côté du nombre quand la carte est assez large, sinon d'un
   * bloc sur la ligne en dessous, jamais coupée au milieu.
   */
  note?: string;
  sub: string;
  tone: 'green' | 'red' | 'muted';
}

/** Espace insécable : un nombre reste collé à son mot, son unité ou son icône (« 5 min », « 🚲 14 »). */
const NBSP = ' ';

/**
 * Cartes d'indicateurs de la maquette « Carte en direct » : six côte à côte au-delà de 1280 px (cartes étroites, ≈ 125 à
 * 230 px de texte), d'où des lignes courtes qui ne se coupent qu'entre deux groupes.
 */
export function buildKpis(d: DashboardDto): Kpi[] {
  const v = d.onlineDrivers.byVehicle;
  const plural = (n: number, word: string) => `${n}${NBSP}${word}${n > 1 ? 's' : ''}`;
  return [
    {
      label: 'Livreurs en ligne',
      value: String(d.onlineDrivers.total),
      note: `${d.onlineDrivers.busy}${NBSP}en${NBSP}course`,
      sub: (['BIKE', 'MOTO', 'CAR'] as const).map((vt) => `${VEHICLE_ICON[vt]}${NBSP}${v[vt]}`).join(' · '),
      tone: 'green',
    },
    {
      label: 'Livraisons en cours',
      value: String(d.activeOrders),
      sub: `${plural(d.cancelledToday, 'annulée')} aujourd'hui`,
      tone: 'muted',
    },
    {
      label: "En attente d'un livreur",
      value: String(d.waitingForDriver),
      sub: d.waitingOver5Min > 0 ? `${d.waitingOver5Min}${NBSP}depuis plus de 5${NBSP}min` : 'aucune attente longue',
      tone: d.waitingOver5Min > 0 ? 'red' : 'green',
    },
    {
      label: "Livrées aujourd'hui",
      value: String(d.deliveredToday),
      sub: `${plural(d.openIncidents, 'incident')} ouvert${d.openIncidents > 1 ? 's' : ''}`,
      tone: d.openIncidents > 0 ? 'red' : 'green',
    },
    {
      label: 'Délai moyen',
      value: d.avgDeliveryMinutesToday === null ? '-' : `${d.avgDeliveryMinutesToday}${NBSP}min`,
      sub: `objectif <${NBSP}30${NBSP}min`,
      tone: d.avgDeliveryMinutesToday !== null && d.avgDeliveryMinutesToday > 30 ? 'red' : 'green',
    },
    {
      label: 'Cash détenu par les livreurs',
      value: formatFcfaCompact(d.cashHeldTotal),
      sub: d.driversAtCashLimit > 0 ? `${plural(d.driversAtCashLimit, 'livreur')} au plafond` : 'aucun livreur au plafond',
      tone: d.driversAtCashLimit > 0 ? 'red' : 'green',
    },
  ];
}

export function KpiCards({ dashboard }: { dashboard: DashboardDto }) {
  return (
    <div className="kpis">
      {buildKpis(dashboard).map((k) => (
        <article key={k.label} className="kpi" aria-label={k.label}>
          <div className="kpi-label">{k.label}</div>
          {k.note ? (
            <div className="kpi-value kpi-value-noted">
              <span>{k.value}</span>
              <span className="kpi-note">{k.note}</span>
            </div>
          ) : (
            <div className="kpi-value">{k.value}</div>
          )}
          <div className={`kpi-sub tone-${k.tone}`}>{k.sub}</div>
        </article>
      ))}
    </div>
  );
}
