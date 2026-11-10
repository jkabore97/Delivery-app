import {
  deliveredToday,
  deliveryMinutes,
  deliveryTimeline,
  dropoffArea,
  focusedDelivery,
  formatAmount,
  frenchDate,
  heroCash,
  liveEta,
  liveStatusText,
  matchesSearch,
  neighbourhood,
  shortName,
  utcDay,
} from '../components/business/dashboardData';
import { delivery, route } from './fixtures';

const NOW = Date.parse('2026-11-08T14:20:00.000Z');
const NNBSP = ' ';

describe('données du tableau de bord : dates, noms, montants', () => {
  it('jour UTC (Ouagadougou = UTC+0) et date en toutes lettres', () => {
    expect(utcDay('2026-11-08T23:59:59.999Z')).toBe('2026-11-08');
    expect(utcDay(Date.parse('2026-11-09T00:00:00.000Z'))).toBe('2026-11-09');
    expect(frenchDate(Date.parse('2026-11-09T12:02:00.000Z'))).toBe('lundi 9 novembre');
    expect(frenchDate(Date.parse('2026-08-15T08:00:00.000Z'))).toBe('samedi 15 août');
  });

  it('prénom et initiale, montants sans unité, quartier du destinataire', () => {
    expect(shortName('Issouf Sawadogo')).toBe('Issouf S.');
    expect(shortName('Aïcha Traoré Kaboré')).toBe('Aïcha K.');
    expect(shortName('Karim')).toBe('Karim');
    expect(shortName(null)).toBe('');
    expect(formatAmount(87500)).toBe(`87${NNBSP}500`);
    expect(formatAmount(1250000)).toBe(`1${NNBSP}250${NNBSP}000`);
    expect(dropoffArea(delivery())).toBe('Patte d’Oie');
    // Hors des quartiers connus : début de l'adresse.
    expect(dropoffArea(delivery({ dropoff: { lat: 11.17, lng: -4.29, address: 'Bobo-Dioulasso, secteur 22', landmark: '' } }))).toBe('Bobo-Dioulasso');
    expect(dropoffArea(delivery({ dropoff: null }))).toBeNull();
  });

  it('carré d’environ 2 km autour de l’entreprise (carte sans livraison en cours)', () => {
    const [a, b] = neighbourhood({ lat: 12.3686, lng: -1.5275 });
    expect(a!.lat - b!.lat).toBeCloseTo(0.018, 6);
    expect(b!.lng - a!.lng).toBeCloseTo(0.018, 6);
  });
});

describe('livraisons du jour et livraison mise en avant', () => {
  const done = (id: string, deliveredAt: string, createdAt = '2026-11-08T10:00:00.000Z') => delivery({ id, status: 'DELIVERED', deliveredAt, createdAt });

  it('livrées aujourd’hui seulement (jour UTC), la plus récente d’abord ; délai demande → livraison', () => {
    const list = [
      done('veille', '2026-11-07T23:59:00.000Z'),
      done('matin', '2026-11-08T09:15:00.000Z', '2026-11-08T08:49:00.000Z'),
      done('midi', '2026-11-08T12:24:00.000Z', '2026-11-08T12:03:00.000Z'),
      delivery({ id: 'en-cours' }),
    ];
    const today = deliveredToday(list, NOW);
    expect(today.map((o) => o.id)).toEqual(['midi', 'matin']);
    expect(deliveryMinutes(today[0]!)).toBe(21);
    expect(deliveryMinutes(delivery())).toBeNull();
  });

  it('mise en avant : celle choisie si elle est encore en cours, sinon le premier colis en route, sinon le premier retrait', () => {
    const s = delivery({ id: 's', status: 'SEARCHING_DRIVER', driver: null });
    const a = delivery({ id: 'a', status: 'ASSIGNED' });
    const p = delivery({ id: 'p' });
    expect(focusedDelivery([s, a, p])?.id).toBe('p');
    expect(focusedDelivery([s, a])?.id).toBe('a');
    expect(focusedDelivery([s])?.id).toBe('s');
    expect(focusedDelivery([s, a, p], 'a')?.id).toBe('a');
    expect(focusedDelivery([s, p], 'disparue')?.id).toBe('p');
    expect(focusedDelivery([])).toBeNull();
  });

  it('recherche : numéro (avec ou sans #) ou destinataire sans accents ni majuscules', () => {
    const o = delivery({ number: 1052, recipientName: 'Awa Kaboré' });
    expect(matchesSearch(o, '')).toBe(true);
    expect(matchesSearch(o, '1052')).toBe(true);
    expect(matchesSearch(o, '#105')).toBe(true);
    expect(matchesSearch(o, 'n° 1052')).toBe(true);
    expect(matchesSearch(o, '2052')).toBe(false);
    expect(matchesSearch(o, 'kabore')).toBe(true);
    expect(matchesSearch(o, '  AWA ')).toBe(true);
    expect(matchesSearch(o, 'mariam')).toBe(false);
  });
});

describe('heure mise en avant, progression et montant', () => {
  it('colis en route : arrivée (estimation de l’API) ; livreur vers l’entreprise : arrivée au retrait et heure de livraison', () => {
    const p = liveEta(delivery({ etaMinutes: 9 }), NOW);
    expect(p).toMatchObject({ kind: 'dropoff', label: 'Arrivée', clock: '14:29', inText: 'dans 9 min', minutes: 9 });
    const a = delivery({
      status: 'ASSIGNED',
      etaMinutes: 25,
      driver: { ...delivery().driver!, lastLocation: { lat: 12.3627, lng: -1.521, at: '2026-11-08T14:19:55.000Z', heading: 170 } },
      route: route({ target: 'PICKUP', distanceM: 2000, durationS: 240, points: [[12.3627, -1.521], [12.3686, -1.5275]] }),
    });
    expect(liveEta(a, NOW)).toMatchObject({ kind: 'pickup', label: 'Au retrait', clock: '14:24', inText: 'dans 4 min', deliveryClock: '14:45' });
    expect(liveStatusText(a, liveEta(a, NOW))).toBe('Retrait dans 4 min');
    const s = delivery({ status: 'SEARCHING_DRIVER', driver: null, createdAt: '2026-11-08T14:18:00.000Z' });
    expect(liveEta(s, NOW)).toMatchObject({ kind: 'request', label: 'Demandée', clock: '14:18', inText: 'il y a 2 min' });
    expect(liveStatusText(s, liveEta(s, NOW))).toBe('Recherche d’un livreur');
    // Livreur sur place (à quelques mètres de l'entreprise) : pas d'heure, l'état lui-même.
    const here = delivery({ status: 'ASSIGNED', route: null, driver: { ...delivery().driver!, lastLocation: { lat: 12.36865, lng: -1.52752, at: '2026-11-08T14:19:55.000Z', heading: null } } });
    expect(liveEta(here, NOW)).toMatchObject({ label: 'Livreur sur place', clock: null, minutes: 0 });
  });

  it('progression Demandée → Récupérée → En route → Livrée avec les heures réelles et estimées', () => {
    const o = delivery({ etaMinutes: 9, createdAt: '2026-11-08T13:50:00.000Z', pickedUpAt: '2026-11-08T14:05:00.000Z' });
    expect(deliveryTimeline(o, NOW).map((s) => [s.label, s.state, s.time, s.approx])).toEqual([
      ['Demandée', 'done', '13:50', false],
      ['Récupérée', 'done', '14:05', false],
      ['En route', 'current', 'maintenant', false],
      ['Livrée', 'todo', '14:29', true],
    ]);
    const s = delivery({ status: 'SEARCHING_DRIVER', driver: null, createdAt: '2026-11-08T14:18:00.000Z' });
    expect(deliveryTimeline(s, NOW).map((x) => x.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    const d = delivery({ status: 'DELIVERED', deliveredAt: '2026-11-08T14:40:00.000Z', pickedUpAt: '2026-11-08T14:05:00.000Z' });
    expect(deliveryTimeline(d, NOW).map((x) => [x.state, x.time])).toEqual([
      ['done', expect.any(String)],
      ['done', '14:05'],
      ['done', '35\u00A0min'],
      ['done', '14:40'],
    ]);
    expect(deliveryTimeline(delivery({ status: 'CANCELLED' }), NOW)).toEqual([]);
  });

  it('montant : ce que le livreur encaisse auprès du destinataire (même modèle que le détail), et son détail', () => {
    // Le destinataire paie la marchandise et les frais.
    expect(heroCash(delivery({ cashToCollect: 8200, deliveryFee: 1600, feePaidBy: 'RECIPIENT' }))).toEqual({
      label: 'À encaisser',
      amount: 9800,
      detail: `marchandise 8${NNBSP}200 + frais 1${NNBSP}600`,
      payer: 'à payer par le destinataire',
    });
    // Livrée, destinataire entreprise.
    expect(heroCash(delivery({ status: 'DELIVERED', cashToCollect: 5000, feePaidBy: 'SENDER', recipientIsBusiness: true }))).toMatchObject({
      label: 'Encaissé',
      amount: 5000,
      detail: `marchandise 5${NNBSP}000`,
      payer: 'payés par l’entreprise destinataire',
    });
    // Rien à encaisser : frais payés par l'entreprise au retrait.
    expect(heroCash(delivery({ cashToCollect: 0, feePaidBy: 'SENDER', deliveryFee: 2300 }))).toEqual({
      label: 'Rien à encaisser',
      amount: 0,
      detail: null,
      payer: `frais 2${NNBSP}300 payés par l’entreprise au retrait`,
    });
  });
});
