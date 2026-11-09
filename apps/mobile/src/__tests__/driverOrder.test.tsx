import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OrderDto } from '@yaar/shared';
import DriverOrderScreen from '../app/driver/order';
import { delivery, route } from './fixtures';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('../state/auth', () => ({ useApi: () => ({ pickupOrder: jest.fn(), sos: jest.fn(), disputeOrder: jest.fn() }) }));
jest.mock('../state/socket', () => ({ useOrderRoom: () => undefined }));
const mockDriver: {
  currentOrder: OrderDto | null;
  position: { lat: number; lng: number; at: number; heading: number | null } | null;
  [k: string]: unknown;
} = {
  currentOrder: null,
  position: null,
  setCurrentOrder: jest.fn(),
  refreshCurrentOrder: jest.fn(),
  refreshProfile: jest.fn(),
  orderNotice: null,
  clearOrderNotice: jest.fn(),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; initials?: string | null }[]; lines: { kind: string }[]; allowRotate?: boolean; theme?: string }) => (
      <>
        <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}|${p.allowRotate ? 'rotation' : ''}`}</RNText>
        <RNText testID="live-map-avatars">{`${p.markers.map((m) => `${m.kind}:${m.initials ?? '-'}`).join(',')}|${p.theme ?? 'light'}`}</RNText>
      </>
    ),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string> };
/** L'élément est-il dans un ScrollView (partie de la feuille qui défile) ? */
function insideScroll(el: unknown): boolean {
  for (let n = (el as Node).parent; n; n = n.parent) if (n.type === 'RCTScrollView') return true;
  return false;
}
/** testID des éléments, dans l'ordre d'affichage. */
function testIdsInOrder(root: unknown): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (typeof n.props.testID === 'string') out.push(n.props.testID);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(root as Node);
  return out;
}

describe('Course du livreur (carte, prochaine étape, montants)', () => {
  it('retrait : itinéraire vers l’entreprise, « Récupérer chez … · km · min », frais à encaisser au retrait', async () => {
    mockDriver.currentOrder = delivery({
      status: 'ASSIGNED',
      feePaidBy: 'SENDER',
      cashToCollect: 8000,
      deliveryFee: 1700,
      driverEarning: 1360,
      route: route({ target: 'PICKUP', points: [[12.3735, -1.492], [12.3727, -1.505], [12.3686, -1.5275]], distanceM: 4000, durationS: 600 }),
    });
    mockDriver.position = { lat: 12.3729, lng: -1.4985, at: 0, heading: 265 };
    const r = await render(wrap(<DriverOrderScreen />));
    // Étape, entreprise, puis distance et durée restantes de l'itinéraire.
    expect(r.getByTestId('next-step')).toHaveTextContent(/1 · RÉCUPÉRER.*Pharmacie du Centre.*Avenue Kwame Nkrumah.*\d,\d km · \d+ min/);
    // Espèces de l'étape (au retrait), puis ce qui sera à encaisser à la livraison.
    expect(r.getByTestId('collect-at-pickup')).toHaveTextContent(/À encaisser au retrait.*1 700 FCFA/);
    expect(r.getByTestId('collect-detail')).toHaveTextContent('1 700 FCFA : frais de livraison payés au retrait, en espèces.');
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(/Ensuite, à encaisser auprès du destinataire.*8 000 FCFA/);
    // Étape vue par le livreur (pas « Livreur en route », le statut de l'entreprise).
    expect(r.getByTestId('driver-order-chip')).toHaveTextContent('Course #1052 · Retrait');
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route,dashed|rotation');
    // Carte claire ; entreprise et destinataire en épingles « avatar » à leurs initiales.
    expect(r.getByTestId('live-map-avatars').props.children).toBe('pickup:PC,dropoff:AK,driver:-|light');
    expect(r.getByTestId('pickup-button')).toBeTruthy();
    expect(r.getByTestId('tracking-sheet')).toBeTruthy();
  });

  it('retrait : WhatsApp de l’entreprise avec un message prérempli, appel de l’entreprise', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockDriver.currentOrder = delivery({ status: 'ASSIGNED', route: null });
    mockDriver.position = null;
    const r = await render(wrap(<DriverOrderScreen />));
    await act(async () => fireEvent.press(r.getByTestId('whatsapp-contact')));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/22671000001\?text=Bonjour/));
    expect(decodeURIComponent(String(open.mock.calls.at(-1)?.[0]))).toContain('récupérer la course #1052');
    await act(async () => fireEvent.press(r.getByTestId('call-contact')));
    expect(open).toHaveBeenLastCalledWith('tel:+22671000001');
    open.mockRestore();
  });

  it('livraison : destinataire, montant à encaisser = marchandise + frais (payés par le destinataire)', async () => {
    mockDriver.currentOrder = delivery();
    mockDriver.position = { lat: 12.3536, lng: -1.5191, at: 0, heading: null };
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.getByTestId('next-step')).toHaveTextContent(/2 · LIVRER.*Colis pour Awa Kaboré.*Patte d’Oie, rue 15\.23 · Repère : Station Total.*\d,\d km · \d+ min/);
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(/À encaisser.*16 500 FCFA/);
    expect(r.getByTestId('collect-detail')).toHaveTextContent('16 500 FCFA : marchandise 15 000 FCFA + frais de livraison 1 500 FCFA, en espèces.');
    expect(r.queryByTestId('collect-at-pickup')).toBeNull();
    expect(r.getByTestId('collect-at-dropoff-value')).toHaveTextContent('16\u202f500\u202fFCFA', { normalizer: (t: string) => t });
    expect(r.getByTestId('driver-order-chip')).toHaveTextContent('Course #1052 · Livraison');
    // Plus de ligne « Contact : … · numéro » : les boutons WhatsApp et Appeler portent le numéro.
    expect(r.queryByText(/^Contact :/)).toBeNull();
    expect(r.getByLabelText('Appeler (+22670112233)')).toBeTruthy();
    expect(r.getByText('2 boîtes de médicaments')).toBeTruthy();
    expect(r.getByTestId('go-deliver')).toBeTruthy();
  });

  it('règle : les espèces de l’étape en cours sont fixées au-dessus des boutons ronds, jamais dans la partie qui défile', async () => {
    const cases: Array<{ order: OrderDto; id: string; action: string; amount: string }> = [
      // Retrait : frais payés par l'entreprise.
      { order: delivery({ status: 'ASSIGNED', feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }), id: 'collect-at-pickup', action: 'pickup-button', amount: '1700' },
      // Livraison : marchandise + frais payés par le destinataire.
      { order: delivery(), id: 'collect-at-dropoff', action: 'go-deliver', amount: '16500' },
    ];
    for (const c of cases) {
      mockDriver.currentOrder = c.order;
      const r = await render(wrap(<DriverOrderScreen />));
      const sheet = r.getByTestId('tracking-sheet');
      const amount = r.getByTestId(c.id);
      // Hors du ScrollView de la feuille (toujours visible, même sur 360 × 640)…
      expect(insideScroll(amount)).toBe(false);
      expect(insideScroll(r.getByTestId('next-step'))).toBe(true);
      // … juste au-dessus de la rangée de boutons (même pied de feuille, avant l'action principale).
      const ids = testIdsInOrder(sheet);
      expect(ids.indexOf(c.id)).toBeGreaterThan(ids.indexOf('next-step'));
      expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(c.action));
      expect(insideScroll(r.getByTestId(c.action))).toBe(false);
      // testID uniques, montant exact sous `-value` (vérifications de bout en bout).
      expect(ids.filter((id) => id === c.id)).toHaveLength(1);
      expect(ids.filter((id) => id === `${c.id}-value`)).toHaveLength(1);
      expect((r.getByTestId(`${c.id}-value`).props.children as string).replace(/\D/g, '')).toBe(c.amount);
      await r.unmount();
    }
  });

  it('règle : rien à encaisser à l’étape en cours → pas de montant fixé, « Rien à encaisser » dans le détail', async () => {
    // Retrait sans frais à encaisser (payés par le destinataire) : seul le montant de la livraison, dans le détail.
    mockDriver.currentOrder = delivery({ status: 'ASSIGNED', feePaidBy: 'RECIPIENT', cashToCollect: 5000, deliveryFee: 1500 });
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.queryByTestId('collect-at-pickup')).toBeNull();
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(/Ensuite, à encaisser auprès du destinataire.*6 500 FCFA/);
    expect(insideScroll(r.getByTestId('collect-at-dropoff'))).toBe(true);
    await r.unmount();
    // Livraison déjà payée.
    mockDriver.currentOrder = delivery({ feePaidBy: 'SENDER', cashToCollect: 0, deliveryFee: 1500 });
    const paid = await render(wrap(<DriverOrderScreen />));
    expect(paid.queryByTestId('collect-at-dropoff')).toBeNull();
    expect(paid.getByText('Rien à encaisser auprès du destinataire.')).toBeTruthy();
  });

  it('livraison : « Livré » ouvre la saisie du code ; « Signaler un problème » reste replié', async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
    mockDriver.currentOrder = delivery();
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.getByTestId('dispute-open')).toBeTruthy();
    expect(r.queryByText('Envoyer au support')).toBeNull();
    await act(async () => fireEvent.press(r.getByTestId('go-deliver')));
    expect(router.push).toHaveBeenCalledWith('/driver/deliver');
  });
});
