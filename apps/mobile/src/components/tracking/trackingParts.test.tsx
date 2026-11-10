import { StyleSheet, useWindowDimensions } from 'react-native';
import { render } from '@testing-library/react-native';
import { ArrivalHeadline } from './TrackingParts';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
const mockDims = useWindowDimensions as jest.Mock;

const NOW = Date.parse('2026-11-08T14:20:10.000Z');
const headline = { title: 'Votre colis est en route', subtitle: 'Issouf arrive chez vous.' };
const fontSizeOf = (el: { props: Record<string, unknown> }) => StyleSheet.flatten(el.props.style as never).fontSize as number;

describe('ArrivalHeadline size="hero" (page publique, détail entreprise)', () => {
  afterEach(() => mockDims.mockReset());

  it('téléphone (390 × 844) : heure en 64 px, pastille 16/800, libellé au-dessus, phrase du livreur', async () => {
    mockDims.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    const r = await render(<ArrivalHeadline size="hero" etaMinutes={9} headline={headline} now={NOW} />);
    const clock = r.getByText(/^\d\d:\d\d$/);
    expect(fontSizeOf(clock)).toBe(64);
    expect(StyleSheet.flatten(r.getByText('dans 9 min').props.style)).toMatchObject({ fontSize: 16, fontWeight: '800' });
    expect(r.getByText('Arrivée vers')).toBeTruthy();
    expect(r.getByText('Issouf arrive chez vous.')).toBeTruthy();
    expect(r.getByLabelText(/^Arrivée vers \d\d:\d\d · dans 9 min$/)).toBeTruthy();
  });

  it('petit téléphone (360 × 640) : heure en 48 px au plus, la phrase du livreur cède sa place (heure, code et montant visibles)', async () => {
    mockDims.mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
    const r = await render(<ArrivalHeadline size="hero" etaMinutes={9} headline={headline} now={NOW} />);
    expect(fontSizeOf(r.getByText(/^\d\d:\d\d$/))).toBeLessThanOrEqual(48);
    expect(r.queryByText('Issouf arrive chez vous.')).toBeNull();
    // Taille standard : heure plus petite (48 au plus, 34 sur écran court).
    const std = await render(<ArrivalHeadline etaMinutes={9} headline={headline} now={NOW} />);
    expect(fontSizeOf(std.getByText(/^\d\d:\d\d$/))).toBeLessThanOrEqual(34);
  });
});
