import type { DashboardDto } from '@yaar/shared';
import { formatFcfaCompact } from '../lib/format';
import { VEHICLE_ICON } from './ui';

interface Kpi {
  label: string;
  value: string;
  sub: string;
  tone: 'green' | 'red' | 'muted';
}

/** Cartes d'indicateurs de la maquette « Carte en direct ». */
export function buildKpis(d: DashboardDto): Kpi[] {
  const v = d.onlineDrivers.byVehicle;
  return [
    {
      label: 'Livreurs en ligne',
      value: String(d.onlineDrivers.total),
      sub: `${VEHICLE_ICON.BIKE} ${v.BIKE} · ${VEHICLE_ICON.MOTO} ${v.MOTO} · ${VEHICLE_ICON.CAR} ${v.CAR} · ${d.onlineDrivers.busy} en course`,
      tone: 'green',
    },
    {
      label: 'Courses en cours',
      value: String(d.activeOrders),
      sub: `${d.cancelledToday} annulée${d.cancelledToday > 1 ? 's' : ''} aujourd'hui`,
      tone: 'muted',
    },
    {
      label: "En attente d'un livreur",
      value: String(d.waitingForDriver),
      sub: d.waitingOver5Min > 0 ? `${d.waitingOver5Min} depuis plus de 5 min` : 'aucune attente longue',
      tone: d.waitingOver5Min > 0 ? 'red' : 'green',
    },
    {
      label: "Livrées aujourd'hui",
      value: String(d.deliveredToday),
      sub: `${d.openIncidents} incident${d.openIncidents > 1 ? 's' : ''} ouvert${d.openIncidents > 1 ? 's' : ''}`,
      tone: d.openIncidents > 0 ? 'red' : 'green',
    },
    {
      label: 'Délai moyen',
      value: d.avgDeliveryMinutesToday === null ? '-' : `${d.avgDeliveryMinutesToday} min`,
      sub: 'objectif < 30 min',
      tone: d.avgDeliveryMinutesToday !== null && d.avgDeliveryMinutesToday > 30 ? 'red' : 'green',
    },
    {
      label: 'Cash détenu par les livreurs',
      value: formatFcfaCompact(d.cashHeldTotal),
      sub:
        d.driversAtCashLimit > 0
          ? `${d.driversAtCashLimit} livreur${d.driversAtCashLimit > 1 ? 's' : ''} au plafond`
          : 'aucun livreur au plafond',
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
          <div className="kpi-value">{k.value}</div>
          <div className={`kpi-sub tone-${k.tone}`}>{k.sub}</div>
        </article>
      ))}
    </div>
  );
}
