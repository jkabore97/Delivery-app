import fs from 'node:fs';
import path from 'node:path';
import { Platform, StyleSheet, View } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { loadAsync } from 'expo-font';
import { Text, TextInput } from '../components/Text';
import {
  DEFAULT_WEIGHT,
  FONT_ASSETS,
  FONT_FILES,
  FONT_LOAD_TIMEOUT_MS,
  FONT_MISSING_CHARS,
  fontFor,
  getFontState,
  LOADED_WEIGHTS,
  setFontStateForTests,
  typeface,
  useAppFonts,
  withFontGlyphs,
} from '../fonts';
import { formatFcfa } from '../lib/format';

jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), loadAsync: jest.fn() }));
const mockLoad = loadAsync as jest.Mock;

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};

afterEach(() => {
  jest.restoreAllMocks();
  setFontStateForTests('loading');
  mockLoad.mockReset();
  jest.useRealTimers();
});

describe('module de police (src/fonts.ts)', () => {
  it('graisse → famille du fichier chargé le plus proche : 900 → 800, sans graisse → 500 (texte courant)', () => {
    expect(fontFor('800')).toBe('PlusJakartaSans-800');
    expect(fontFor('900')).toBe('PlusJakartaSans-800');
    expect(fontFor(900)).toBe('PlusJakartaSans-800');
    expect(fontFor('bold')).toBe('PlusJakartaSans-700');
    expect(fontFor('600')).toBe('PlusJakartaSans-600');
    expect(fontFor(undefined)).toBe(`PlusJakartaSans-${DEFAULT_WEIGHT}`);
    // 400 a un fichier mais n'est pas chargé : dessiné en 500.
    expect(Object.keys(FONT_FILES)).toEqual(['400', '500', '600', '700', '800']);
    expect(fontFor('400')).toBe('PlusJakartaSans-500');
    expect(fontFor('normal')).toBe('PlusJakartaSans-500');
    // Pas de fichier italique : famille droite (la plateforme penche le texte).
    expect(fontFor('700', true)).toBe('PlusJakartaSans-700');
  });

  it('liste des polices à charger : une famille par graisse chargée', () => {
    expect(Object.keys(FONT_ASSETS)).toEqual(LOADED_WEIGHTS.map((w) => `PlusJakartaSans-${w}`));
    expect(LOADED_WEIGHTS).toEqual([500, 600, 700, 800]);
  });

  it('scripts/web-postexport.mjs lit les mêmes graisses dans src/fonts.ts (préchargement des polices du web)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'fonts.ts'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'web-postexport.mjs'), 'utf8');
    // Même expression que le script (copiée ici : si l'une change, l'autre doit suivre).
    const re = /export const LOADED_WEIGHTS[^=]*=\s*\[([^\]]*)\]/;
    expect(script).toContain('/export const LOADED_WEIGHTS[^=]*=\\s*\\[([^\\]]*)\\]/');
    const weights = (re.exec(src)?.[1] ?? '').split(',').map((w) => Number(w.trim()));
    expect(weights).toEqual([...LOADED_WEIGHTS]);
  });

  it('Android / iOS : famille de la graisse et fontWeight normal une fois chargée ; rien avant (police du système)', () => {
    expect(typeface('900')).toBeNull();
    setFontStateForTests('ready');
    expect(typeface('900')).toEqual({ fontFamily: 'PlusJakartaSans-800', fontWeight: 'normal' });
    expect(typeface('900')).toBe(typeface(800)); // objet créé une seule fois
    setFontStateForTests('system');
    expect(typeface('700')).toBeNull();
  });

  it('web : famille puis police du système, vraie graisse gardée (déclarée par son @font-face : aucun gras synthétique)', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    setFontStateForTests('loading');
    expect(typeface('900')).toEqual({ fontFamily: 'PlusJakartaSans-800, System', fontWeight: '800' });
    expect(typeface(undefined)).toEqual({ fontFamily: 'PlusJakartaSans-500, System', fontWeight: '500' });
  });
});

describe('caractères absents de la police', () => {
  it('espace fine insécable (formatFcfa) dessinée en espace insécable, que la police possède', () => {
    expect(FONT_MISSING_CHARS).toEqual({ '\u202F': '\u00A0' });
    expect(withFontGlyphs(formatFcfa(16500))).toBe('16\u00a0500\u00a0FCFA');
    expect(withFontGlyphs('Arrivée vers 14:32')).toBe('Arrivée vers 14:32');
  });

  it('Text : remplacé à l’affichage une fois la police chargée, données inchangées sinon', async () => {
    setFontStateForTests('ready');
    const r = await render(<Text testID="m">{formatFcfa(16500)}</Text>);
    expect(r.getByTestId('m').props.children).toBe('16\u00a0500\u00a0FCFA');
    setFontStateForTests('system');
    const r2 = await render(<Text testID="s">{formatFcfa(16500)}</Text>);
    expect(r2.getByTestId('s').props.children).toBe('16\u202f500\u202fFCFA');
  });
});

describe('Text et TextInput de l’application', () => {
  it('appliquent la famille de la graisse, fontWeight normal, sans toucher au reste du style (chiffres tabulaires…)', async () => {
    setFontStateForTests('ready');
    const r = await render(
      <View>
        <Text style={[{ fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] }, { color: 'red' }]}>12:09</Text>
        <Text style={{ fontSize: 13 }}>Repère</Text>
        <TextInput style={{ fontSize: 16, fontWeight: '600' }} placeholder="Nom" testID="input" />
      </View>,
    );
    expect(flat(r.getByText('12:09'))).toEqual({
      fontSize: 40,
      fontVariant: ['tabular-nums'],
      color: 'red',
      fontFamily: 'PlusJakartaSans-800',
      fontWeight: 'normal',
    });
    expect(flat(r.getByText('Repère'))).toMatchObject({ fontSize: 13, fontFamily: 'PlusJakartaSans-500', fontWeight: 'normal' });
    expect(flat(r.getByTestId('input'))).toMatchObject({ fontSize: 16, fontFamily: 'PlusJakartaSans-600', fontWeight: 'normal' });
  });

  it('texte imbriqué : hérite de son parent sans graisse propre, prend sa famille avec une graisse propre', async () => {
    setFontStateForTests('ready');
    const r = await render(
      <Text style={{ fontWeight: '800' }}>
        Arrivée <Text style={{ color: 'blue' }}>12:09</Text> <Text style={{ fontWeight: '500' }}>dans 7 min</Text>
      </Text>,
    );
    expect(flat(r.getByText('12:09'))).toEqual({ color: 'blue' });
    expect(flat(r.getByText('dans 7 min'))).toMatchObject({ fontFamily: 'PlusJakartaSans-500', fontWeight: 'normal' });
  });

  it('police explicite (fontFamily) respectée ; avant le chargement, style inchangé (police du système)', async () => {
    setFontStateForTests('ready');
    const r = await render(<Text style={{ fontFamily: 'monospace', fontWeight: '700' }}>A1B2</Text>);
    expect(flat(r.getByText('A1B2'))).toEqual({ fontFamily: 'monospace', fontWeight: '700' });
    setFontStateForTests('loading');
    const r2 = await render(<Text style={{ fontWeight: '900' }}>Titre</Text>);
    expect(flat(r2.getByText('Titre'))).toEqual({ fontWeight: '900' });
  });

  it('transmet les props et la ref', async () => {
    setFontStateForTests('ready');
    const ref = { current: null as unknown };
    const onPress = jest.fn();
    const r = await render(
      <Text ref={ref as never} numberOfLines={2} onPress={onPress} accessibilityRole="header" testID="t">
        Titre
      </Text>,
    );
    const el = r.getByTestId('t');
    expect(el.props.numberOfLines).toBe(2);
    expect(el.props.accessibilityRole).toBe('header');
    expect(ref.current).not.toBeNull();
  });
});

function Probe({ skip }: { skip?: boolean }) {
  const ready = useAppFonts({ skip });
  return <Text>{ready ? 'prêt' : 'attente'}</Text>;
}

describe('chargement au démarrage (useAppFonts)', () => {
  it('attend les polices, puis les applique', async () => {
    let resolve!: () => void;
    mockLoad.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const r = await render(<Probe />);
    expect(r.getByText('attente')).toBeTruthy();
    expect(mockLoad).toHaveBeenCalledWith(FONT_ASSETS);
    await act(async () => resolve());
    expect(r.getByText('prêt')).toBeTruthy();
    expect(getFontState()).toBe('ready');
  });

  it('jamais plus de 2,5 s : police du système ensuite, même si les polices arrivent plus tard', async () => {
    jest.useFakeTimers();
    let resolve!: () => void;
    mockLoad.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const r = await render(<Probe />);
    await act(async () => {
      jest.advanceTimersByTime(FONT_LOAD_TIMEOUT_MS + 10);
    });
    expect(r.getByText('prêt')).toBeTruthy();
    expect(getFontState()).toBe('system');
    await act(async () => resolve());
    expect(getFontState()).toBe('system');
  });

  it('erreur de chargement : police du système aussitôt ; connexion très lente (skip) : rien n’est chargé', async () => {
    mockLoad.mockReturnValue(Promise.reject(new Error('réseau')));
    const r = await render(<Probe />);
    await act(async () => undefined);
    expect(r.getByText('prêt')).toBeTruthy();
    expect(getFontState()).toBe('system');

    setFontStateForTests('loading');
    mockLoad.mockClear();
    const r2 = await render(<Probe skip />);
    await act(async () => undefined);
    expect(r2.getByText('prêt')).toBeTruthy();
    expect(mockLoad).not.toHaveBeenCalled();
    expect(getFontState()).toBe('system');
  });
});
