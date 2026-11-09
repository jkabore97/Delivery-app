import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ORDER_STATUSES } from '@yaar/shared';
import { CodeInput } from '../components/driver/CodeInput';
import { CashMeter, Money, shortDateTime } from '../components/driver/DriverKit';
import { ICON_PARTS } from '../components/design/iconPaths';
import DriverDocuments from '../app/driver/(tabs)/documents';
import { sellerBadge } from '../lib/orderProgress';
import { SIGNUP_ROLES } from '../lib/roles';
import { driverProfile } from './fixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Redirect: () => null }));
jest.mock('../lib/photo', () => ({ capturePhoto: jest.fn(async () => null) }));
jest.mock('../state/auth', () => ({ useApi: () => ({ uploadDocument: jest.fn() }) }));
const mockDriver = { profile: driverProfile({ isOnline: false }), setProfile: jest.fn() };
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));
jest.mock('../state/config', () => ({ useAppConfig: () => ({ config: null }) }));

/** Saisie contrôlée, comme sur les écrans (code de livraison, code de connexion). */
function Code({ length, onValue }: { length: number; onValue?: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <CodeInput
      value={v}
      onChangeText={(t) => {
        setV(t);
        onValue?.(t);
      }}
      length={length}
      accessibilityLabel="Code"
      testID="code"
    />
  );
}

describe('saisie d’un code en cases (Cobalt)', () => {
  it('chiffres seulement ; un code collé (« Code : 4 8 2 1 ») est réduit à ses chiffres, sans dépasser la longueur', async () => {
    const r = await render(<Code length={4} />);
    const input = r.getByTestId('code');
    // Pas de maxLength : il couperait le texte collé avant d'en extraire les chiffres.
    expect(input.props.maxLength).toBeUndefined();
    await act(async () => fireEvent.changeText(input, 'Code : 4 8 2 1'));
    expect(r.getByTestId('code').props.value).toBe('4821');
    await act(async () => fireEvent.changeText(r.getByTestId('code'), '48219999'));
    expect(r.getByTestId('code').props.value).toBe('4821');
    // Les cases montrent les chiffres ; elles sont décoratives, cachées aux lecteurs d'écran (le champ porte le libellé).
    expect(r.queryByText('4')).toBeNull();
    expect(r.getByText('4', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByLabelText('Code')).toBe(r.getByTestId('code'));
  });

  it('code à 6 chiffres reçu par SMS : complétion automatique du système, clavier numérique', async () => {
    const r = await render(<CodeInput value="" onChangeText={jest.fn()} length={6} oneTimeCode accessibilityLabel="Code à 6 chiffres" testID="otp" />);
    const input = r.getByTestId('otp');
    expect(input.props).toMatchObject({ textContentType: 'oneTimeCode', autoComplete: 'sms-otp', keyboardType: 'number-pad' });
  });

  it('erreur : toutes les cases cerclées de rouge foncé', async () => {
    const r = await render(<CodeInput value="12" onChangeText={jest.fn()} length={4} error accessibilityLabel="Code" />);
    const box = r.getByText('1', { includeHiddenElements: true }).parent;
    expect(StyleSheet.flatten(box?.props.style)).toMatchObject({ borderColor: '#B42318' });
  });
});

describe('montants et espèces (Cobalt)', () => {
  it('montant : un seul texte, « FCFA » plus petit, mêmes espaces fines insécables que formatFcfa', async () => {
    const r = await render(<Money amount={16500} size={40} sign="+" testID="m" />);
    expect(r.getByTestId('m')).toHaveTextContent('+16 500 FCFA', { normalizer: (t: string) => t });
    expect(StyleSheet.flatten(r.getByTestId('m').props.style)).toMatchObject({ fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] });
  });

  it('espèces détenues : jauge soleil ; plafond atteint : texte et jauge rouges', async () => {
    const ok = await render(<CashMeter held={18500} limit={50000} />);
    expect(ok.getByRole('progressbar').props['aria-valuenow']).toBe(37);
    expect(StyleSheet.flatten(ok.getByRole('progressbar').props.children.props.style)).toMatchObject({ backgroundColor: '#FFC93C' });
    await ok.unmount();
    const full = await render(<CashMeter held={52000} limit={50000} blocked />);
    expect(StyleSheet.flatten(full.getByRole('progressbar').props.children.props.style)).toMatchObject({ backgroundColor: '#D92D20' });
    expect(full.getByTestId('cash-held-limit')).toHaveTextContent('Plafond 50 000 FCFA');
  });

  it('dates courtes des listes (« 09/11 · 21:42 »), année si ce n’est pas l’année en cours', () => {
    const now = Date.parse('2026-11-09T12:00:00.000Z');
    expect(shortDateTime('2026-11-09T21:42:00.000Z', now)).toBe('09/11 · 21:42');
    expect(shortDateTime('2025-12-31T08:05:00.000Z', now)).toBe('31/12/2025 · 08:05');
  });
});

describe('libellés à la source, en minuscules (Cobalt n’écrit pas en capitales)', () => {
  it('pastilles d’état des commandes', () => {
    for (const s of ORDER_STATUSES) {
      const { label } = sellerBadge(s);
      expect(label).not.toBe(label.toUpperCase());
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
    expect(sellerBadge('PICKED_UP').label).toBe('En livraison');
  });

  it('profils de l’écran de connexion : pictogrammes du système de design, aucun émoji', () => {
    for (const r of SIGNUP_ROLES) {
      expect(ICON_PARTS[r.icon]).toBeDefined();
      expect(JSON.stringify(r)).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
    }
  });

  it('pièces du livreur : « Reçue » avec une coche dessinée (la police n’a pas de ✓), « Manquante », « Expirée »', async () => {
    mockDriver.profile = driverProfile({
      isOnline: false,
      vehicleType: 'MOTO',
      documents: [
        { id: 'doc-1', type: 'CNIB', mimeType: 'image/jpeg', sizeBytes: 120_000, uploadedAt: '2026-10-31T22:07:00.000Z', expiresAt: null, isExpired: false },
        {
          id: 'doc-2',
          type: 'ASSURANCE',
          mimeType: 'image/jpeg',
          sizeBytes: 98_000,
          uploadedAt: '2026-01-02T10:00:00.000Z',
          expiresAt: '2026-06-30T00:00:00.000Z',
          isExpired: true,
        },
      ],
    });
    const r = await render(<DriverDocuments />);
    expect(r.getByTestId('document-CNIB-state')).toHaveTextContent(/^Reçue$/);
    expect(r.getByTestId('document-ASSURANCE-state')).toHaveTextContent(/^Expirée$/);
    expect(r.getByTestId('document-PERMIS-state')).toHaveTextContent(/^Manquante$/);
    expect(r.queryByText(/✓|REÇUE|MANQUANTE|EXPIRÉE/)).toBeNull();
    expect(r.getByTestId('document-CNIB')).toHaveTextContent(/Envoyée le 31\/10\/2026/);
    // Pièce reçue : simple remplacement (secondaire) ; pièce à fournir : « Photographier » (cobalt).
    expect(r.getAllByText('Remplacer')).toHaveLength(1);
    expect(r.getAllByText('Photographier').length).toBeGreaterThanOrEqual(2);
  });
});
