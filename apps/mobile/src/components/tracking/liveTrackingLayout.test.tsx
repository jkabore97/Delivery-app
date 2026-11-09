import type { ReactElement } from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LiveTrackingLayout } from './LiveTrackingLayout';

// Carte simulée : un « geste » de l'utilisateur dès l'affichage (le bouton « Recentrer » apparaît alors).
jest.mock('../map/LiveMap', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    LiveMap: (p: { onUserGesture?: () => void }) => {
      useEffect(() => p.onUserGesture?.(), []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    },
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;
const layout = (extra: Partial<Parameters<typeof LiveTrackingLayout>[0]> = {}) => (
  <LiveTrackingLayout markers={[]} lines={[]} fitPoints={[{ lat: 12.37, lng: -1.52 }]} stageKey="a" animationMs={4000} {...extra}>
    <Text>Contenu</Text>
  </LiveTrackingLayout>
);

describe('LiveTrackingLayout', () => {
  it('« Recentrer » : pictogramme du système de design (plus de symbole « ◎ »)', async () => {
    const r = await render(wrap(layout()));
    await act(async () => undefined);
    const button = r.getByTestId('recenter-button');
    expect(button).toHaveTextContent(/^Recentrer$/);
    expect(r.queryByText(/◎/)).toBeNull();
  });

  it('poignée : zone à toucher plus haute posée par-dessus le haut de la feuille, sans déplacer le contenu', async () => {
    const r = await render(wrap(layout()));
    const handle = r.getByLabelText('Afficher tout le détail');
    expect(StyleSheet.flatten(handle.props.style)).toMatchObject({ position: 'absolute', top: 0, height: 28 });
    const { height } = Dimensions.get('window');
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.56));
    await act(async () => fireEvent.press(handle));
    expect(r.getByLabelText('Réduire le détail')).toBeTruthy();
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.86));
  });

  it('sans bouton flottant à gauche ni à droite, la pastille du milieu a toute la largeur', async () => {
    const chip = <Text testID="chip">2 en route · 1 recherche d’un livreur</Text>;
    const alone = await render(wrap(layout({ topCenter: chip })));
    // Barre du haut : premier ancêtre en rangée ; son premier enfant est l'emplacement de gauche.
    const side = (r: typeof alone) => {
      let n = r.getByTestId('chip').parent;
      while (n && StyleSheet.flatten(n.props.style)?.flexDirection !== 'row') n = n.parent;
      return StyleSheet.flatten((n!.children[0] as unknown as { props: { style: object } }).props.style);
    };
    expect(side(alone)).toMatchObject({ width: 0 });
    await alone.unmount();
    const withBack = await render(wrap(layout({ topCenter: chip, topLeft: <Text>Retour</Text> })));
    expect(side(withBack)).toMatchObject({ width: 52 });
  });
});
