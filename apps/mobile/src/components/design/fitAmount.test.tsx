import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { estimateTextWidth } from '../../fonts';
import { AmountBox } from '../tracking/TrackingParts';
import { FitAmount, fitAmountSize, fitFontSize } from './FitAmount';
import { AmountRow } from './Surfaces';

/** Largeur d'un montant tel que FitAmount le dessine (chiffres + « FCFA » à `unitScale`). */
const lineWidth = (figure: string, size: number, unitScale: number) =>
  estimateTextWidth(figure, size, -Math.round(size * 0.03 * 10) / 10) + estimateTextWidth(' FCFA', size * unitScale);

/** Taille des chiffres et de « FCFA » rendus sous `testID` (les deux textes voisins). */
function sizes(r: Awaited<ReturnType<typeof render>>, testID: string) {
  const box = r.getByTestId(testID);
  const [figure, unit] = box.children as unknown as Array<{ props: { style: unknown } }>;
  return { figure: StyleSheet.flatten(figure!.props.style as never).fontSize as number, unit: StyleSheet.flatten(unit!.props.style as never).fontSize as number };
}

async function layoutOf(r: Awaited<ReturnType<typeof render>>, testID: string, width: number) {
  await act(async () => fireEvent(r.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 40 } } }));
}

describe('FitAmount : un montant n’est jamais coupé', () => {
  // Places réelles : tuile d'une demi-largeur de l'offre (34 px) et montant héros de AmountRow (40 px), sur un
  // téléphone de 390 px et de 360 px de large.
  const HALF_TILE = { 390: 141, 360: 126 };
  const HERO = { 390: 318, 360: 288 };

  for (const amount of [12360, 1250000]) {
    for (const screen of [390, 360] as const) {
      it(`${amount} FCFA, ${screen} px : la plus grande taille qui tient sur une ligne, ≥ 18 px, sans « … »`, async () => {
        const r = await render(<FitAmount amount={amount} size={34} testID="m" />);
        await layoutOf(r, 'm', HALF_TILE[screen]);
        const s = sizes(r, 'm');
        const figure = amount === 12360 ? '12 360' : '1 250 000';
        expect(s.figure).toBeGreaterThanOrEqual(18);
        expect(s.figure).toBeLessThan(34); // ne tenait pas à 34 px
        expect(lineWidth(figure, s.figure, 0.5)).toBeLessThanOrEqual(HALF_TILE[screen]);
        expect(lineWidth(figure, s.figure + 1, 0.5)).toBeGreaterThan(HALF_TILE[screen]); // la plus grande
        expect(s.unit).toBe(Math.max(11, Math.round(s.figure * 0.5)));
        expect(r.getByTestId('m')).toHaveTextContent(amount === 12360 ? '12 360 FCFA' : '1 250 000 FCFA', { normalizer: (t: string) => t });
        for (const el of r.getByTestId('m').children as unknown as Array<{ props: { numberOfLines?: number } }>) expect(el.props.numberOfLines).toBeUndefined();

        const hero = await render(<AmountRow hero label="Encaissez" amount={amount} testID="h" />);
        await layoutOf(hero, 'h-value', HERO[screen]);
        const h = sizes(hero, 'h-value');
        expect(lineWidth(figure, h.figure, 0.5)).toBeLessThanOrEqual(HERO[screen]);
        expect(h.figure).toBeGreaterThanOrEqual(24);
      });
    }
  }

  it('place trop étroite : « FCFA » passe à la ligne, les chiffres restent entiers (jamais sous 12 px)', () => {
    expect(fitAmountSize('1 250 000', ' FCFA', 100, 34, 18, 0.5)).toEqual({ size: expect.any(Number), wrap: true });
    const { size } = fitAmountSize('1 250 000', ' FCFA', 100, 34, 18, 0.5);
    expect(size).toBeGreaterThanOrEqual(18);
    expect(estimateTextWidth('1 250 000', size, -Math.round(size * 0.03 * 10) / 10)).toBeLessThanOrEqual(100);
    expect(fitAmountSize('1 250 000', ' FCFA', 40, 34).size).toBe(12);
    // Largeur inconnue (avant la mesure) : taille maximale.
    expect(fitAmountSize('12 360', ' FCFA', null, 34)).toEqual({ size: 34, wrap: false });
    expect(fitFontSize('14:29', 120, 64, 36)).toBeLessThan(64);
    expect(fitFontSize('14:29', 400, 64, 36)).toBe(64);
  });

  it('AmountRow en ligne : le montant prend au plus 60 % de la ligne, à droite, « FCFA » plus petit', async () => {
    const r = await render(<AmountRow label="À encaisser" amount={1250000} testID="row" />);
    await layoutOf(r, 'row', 358);
    const box = r.getByTestId('row-value');
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ justifyContent: 'flex-end', maxWidth: Math.floor((358 - 32 - 12) * 0.6) });
    const s = sizes(r, 'row-value');
    expect(s.figure).toBe(22);
    expect(s.unit).toBe(13);
  });

  it('AmountBox : pastille facultative, version compacte d’une ligne, montant exact sous `-value`', async () => {
    const full = await render(<AmountBox label="À payer à la réception" detail="En espèces, au livreur." amount={16500} icon="cash" compact={false} testID="pay" />);
    expect(StyleSheet.flatten(full.getByTestId('pay').props.style)).toMatchObject({ backgroundColor: '#FFC93C', minHeight: 72 });
    expect(full.getByTestId('pay-value')).toHaveTextContent('16 500 FCFA', { normalizer: (t: string) => t });
    expect(sizes(full, 'pay-value')).toEqual({ figure: 24, unit: 14 });
    const compact = await render(<AmountBox label="À payer à la réception" amount={16500} icon="cash" compact testID="pay" />);
    expect(StyleSheet.flatten(compact.getByTestId('pay').props.style)).toMatchObject({ minHeight: 60, paddingVertical: 8 });
    expect(sizes(compact, 'pay-value').figure).toBe(22);
  });
});
