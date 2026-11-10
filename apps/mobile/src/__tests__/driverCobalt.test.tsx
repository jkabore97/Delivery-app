import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Stars } from '../components/Rating';
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys';
import { CodeInput } from '../components/driver/CodeInput';
import { AmountLine, CashMeter, ListRow, shortDateTime } from '../components/driver/DriverKit';
import { FitAmount } from '../components/design/FitAmount';
import { formatFcfa } from '../lib/format';
import { estimateTextWidth } from '../fonts';
import { ICON_PARTS } from '../components/design/iconPaths';
import DriverDocuments from '../app/driver/(tabs)/documents';
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

  it('plein soleil : case vide gris clair au contour gris de 2 px (3:1), case remplie au contour gris foncé', async () => {
    const r = await render(<CodeInput value="1" onChangeText={jest.fn()} length={4} accessibilityLabel="Code" />);
    const filled = r.getByText('1', { includeHiddenElements: true }).parent;
    expect(StyleSheet.flatten(filled?.props.style)).toMatchObject({ backgroundColor: '#FFFFFF', borderColor: '#5B6475' });
    const empty = r.getAllByText('', { includeHiddenElements: true }).map((t) => StyleSheet.flatten(t.parent?.props.style));
    expect(empty[0]).toMatchObject({ backgroundColor: '#E9EDF3', borderWidth: 2, borderColor: 'rgba(91, 100, 117, 0.75)' });
  });

  it('erreur : toutes les cases cerclées de rouge foncé', async () => {
    const r = await render(<CodeInput value="12" onChangeText={jest.fn()} length={4} error accessibilityLabel="Code" />);
    const box = r.getByText('1', { includeHiddenElements: true }).parent;
    expect(StyleSheet.flatten(box?.props.style)).toMatchObject({ borderColor: '#B42318' });
  });
});

describe('note en étoiles', () => {
  it('à choisir : groupe radio, l’étoile choisie cochée ; contours lisibles (vide inkMuted, pleine cerclée d’ambre)', async () => {
    const onChange = jest.fn();
    const r = await render(<Stars value={3} onChange={onChange} />);
    expect(r.getByLabelText('Note').props.accessibilityRole).toBe('radiogroup');
    const radios = r.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.map((b) => b.props.accessibilityState.checked)).toEqual([false, false, true, false, false]);
    await act(async () => fireEvent.press(r.getByTestId('star-5')));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('lecture seule : une image « 4 étoiles sur 5 », sans boutons', async () => {
    const r = await render(<Stars value={4} />);
    expect(r.getByLabelText('4 étoiles sur 5')).toBeTruthy();
    expect(r.queryAllByRole('radio')).toHaveLength(0);
  });

  it('web : un seul arrêt de tabulation, flèches et Espace changent la note', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      const onChange = jest.fn();
      const { result } = await renderHook(() => useRadioGroupKeys([1, 2, 3, 4, 5], 3, onChange));
      const props = [0, 1, 2, 3, 4].map((i) => result.current(i) as { tabIndex: number; onKeyDown: (e: unknown) => void });
      expect(props.map((p) => p.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
      const key = (k: string) => ({ key: k, preventDefault: jest.fn() });
      props[2]!.onKeyDown(key('ArrowRight'));
      props[0]!.onKeyDown(key('ArrowLeft'));
      props[1]!.onKeyDown(key(' '));
      props[4]!.onKeyDown(key('Home'));
      expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, 5, 2, 1]);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });
});

describe('montants et espèces (Cobalt)', () => {
  /** Largeur (estimée) d'un montant rendu : chiffres, plus « FCFA » s'il est sur la même ligne. */
  function renderedWidth(r: Awaited<ReturnType<typeof render>>, id: string) {
    const box = r.getByTestId(id);
    const [figure, unit] = box.props.children.filter(Boolean) as { props: { children: string; style: unknown } }[];
    const fs = StyleSheet.flatten(figure!.props.style as never) as { fontSize: number; letterSpacing: number };
    const us = StyleSheet.flatten(unit!.props.style as never) as { fontSize: number };
    return { size: fs.fontSize, figure: estimateTextWidth(figure!.props.children, fs.fontSize, fs.letterSpacing), unit: estimateTextWidth(unit!.props.children, us.fontSize), texts: [figure, unit] };
  }

  // Tuiles de l'offre : moitié de la feuille moins les marges (≈ 142 px à 390 de large, 127 à 360).
  it.each([
    [12360, 390, 142],
    [12360, 360, 127],
    [1250000, 390, 142],
    [1250000, 360, 127],
  ])('montant %d dans une tuile (écran de %d px) : jamais coupé ni « … », plus petit ou « FCFA » à la ligne', async (amount, _screen, width) => {
    const r = await render(<FitAmount amount={amount} size={34} testID="m" />);
    await act(async () => fireEvent(r.getByTestId('m'), 'layout', { nativeEvent: { layout: { width, height: 40, x: 0, y: 0 } } }));
    const m = renderedWidth(r, 'm');
    for (const t of m.texts) expect((t as { props: { numberOfLines?: number } }).props.numberOfLines).toBeUndefined();
    expect(m.size).toBeGreaterThanOrEqual(18);
    // Sur une ligne (chiffres + FCFA) ou, sinon, les chiffres seuls tiennent dans la largeur.
    expect(m.figure + m.unit <= width || m.figure <= width).toBe(true);
    expect(r.getByTestId('m')).toHaveTextContent(formatFcfa(amount), { normalizer: (t: string) => t });
  });

  it('ligne libellé / montant : le montant tient dans 60 % de la ligne mesurée (jamais réglé sur son propre texte)', async () => {
    const r = await render(<AmountLine label="Gains du jour · 6 courses" amount={1250000} size={18} testID="line" />);
    await act(async () => fireEvent(r.getByTestId('line-line'), 'layout', { nativeEvent: { layout: { width: 200, height: 40, x: 0, y: 0 } } }));
    const m = renderedWidth(r, 'line');
    const budget = Math.floor((200 - 8) * 0.6);
    expect(StyleSheet.flatten(r.getByTestId('line').props.style)).toMatchObject({ maxWidth: budget });
    expect(m.figure + m.unit <= budget || m.figure <= budget).toBe(true);
    expect(r.getByTestId('line')).toHaveTextContent('1 250 000 FCFA');
  });

  it('ligne de liste : montant signé à droite, entier', async () => {
    const r = await render(<ListRow title="Course #1052" amount={{ value: 16500, sign: '+' }} testID="row" />);
    expect(r.getByTestId('row')).toHaveTextContent('Course #1052+16 500 FCFA');
  });

  it('espèces détenues : jauge ambre sur piste soleil pâle (5,35:1, plein soleil) ; plafond atteint : texte et jauge rouges', async () => {
    const ok = await render(<CashMeter held={18500} limit={50000} />);
    expect(ok.getByRole('progressbar').props['aria-valuenow']).toBe(37);
    expect(StyleSheet.flatten(ok.getByRole('progressbar').props.style)).toMatchObject({ backgroundColor: '#FFF3CC' });
    expect(StyleSheet.flatten(ok.getByRole('progressbar').props.children.props.style)).toMatchObject({ backgroundColor: '#8A5A00' });
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
