import type { ReactElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LiveTrackingLayout } from './LiveTrackingLayout';

// Carte simulée : un « geste » de l'utilisateur dès l'affichage (le bouton « Recentrer » apparaît alors).
// Les props reçues par la carte sont gardées (cadrage).
const mockMapProps: Array<{ padding?: { top: number }; recenterKey?: number }> = [];
jest.mock('../map/LiveMap', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    LiveMap: (p: { onUserGesture?: () => void; padding?: { top: number }; recenterKey?: number }) => {
      mockMapProps.push(p);
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
    expect(StyleSheet.flatten(r.getByTestId('sheet-handle-zone').props.style)).toMatchObject({ position: 'absolute', top: 0, height: 28 });
    const { height } = Dimensions.get('window');
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.56));
    await act(async () => fireEvent.press(handle));
    expect(r.getByLabelText('Réduire le détail')).toBeTruthy();
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.86));
  });

  it('feuille tirée : vers le bas, réduite (la carte s’agrandit) ; vers le haut, ouverte en grand', async () => {
    const r = await render(wrap(layout()));
    const { height } = Dimensions.get('window');
    const maxH = () => StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight as number;
    const zone = () => r.getByTestId('sheet-handle-zone');
    let t = 1000;
    const touch = (y0: number, y: number) => ({
      nativeEvent: { touches: [{}], changedTouches: [{}], pageX: 100, pageY: y, timestamp: t },
      touchHistory: {
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: t,
        touchBank: [{ touchActive: true, startPageX: 100, startPageY: y0, startTimeStamp: 1000, currentPageX: 100, currentPageY: y, currentTimeStamp: t, previousPageX: 100, previousPageY: y0, previousTimeStamp: 1000 }],
      },
    });
    const drag = async (dy: number) => {
      t += 600;
      const p = zone().props;
      await act(async () => {
        p.onStartShouldSetResponderCapture(touch(400, 400));
        p.onMoveShouldSetResponderCapture(touch(400, 400 + dy));
        expect(p.onMoveShouldSetResponder(touch(400, 400 + dy))).toBe(true);
        p.onResponderGrant(touch(400, 400 + dy));
        t += 16;
        p.onResponderMove(touch(400, 400 + dy));
      });
      await act(async () => p.onResponderRelease(touch(400, 400 + dy)));
    };
    const normal = Math.round(height * 0.56);
    expect(maxH()).toBe(normal);
    await drag(160);
    expect(maxH()).toBeLessThan(normal);
    expect(r.getByLabelText('Afficher le détail')).toBeTruthy();
    await drag(-160);
    expect(maxH()).toBe(normal);
    await drag(-160);
    expect(maxH()).toBe(Math.round(height * 0.86));
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

  it('fadeBottom : fondu blanc au-dessus du pied (ou du bas de la feuille), place du fondu ajoutée sous le contenu', async () => {
    const plain = await render(wrap(layout()));
    expect(plain.queryByTestId('sheet-fade')).toBeNull();
    await plain.unmount();
    const withFooter = await render(wrap(layout({ fadeBottom: 28, footer: <Text testID="foot">Pied</Text> })));
    const fade = withFooter.getByTestId('sheet-fade');
    expect(StyleSheet.flatten(fade.props.style)).toMatchObject({ position: 'absolute', top: -28, height: 28 });
    expect(fade.props.pointerEvents).toBe('none');
    // Dans le pied, juste avant son contenu.
    expect(fade.parent?.parent).toBe(withFooter.getByTestId('foot').parent?.parent);
    await withFooter.unmount();
    // Sans pied (accueil du livreur au-dessus de la barre d'onglets) : 24 px par défaut.
    const alone = await render(wrap(layout({ fadeBottom: true })));
    expect(StyleSheet.flatten(alone.getByTestId('sheet-fade').props.style)).toMatchObject({ top: -24, height: 24 });
  });

  it('sans pastille du milieu, `topLeft` est large (pastille alignée à gauche, jusqu’au bouton de droite)', async () => {
    const r = await render(wrap(layout({ topLeft: <Text testID="pill">3 en cours | 1 en recherche</Text>, topRight: <Text>◉</Text> })));
    const slot = StyleSheet.flatten(r.getByTestId('pill').parent!.props.style);
    expect(slot).toMatchObject({ flex: 1, alignItems: 'flex-start' });
    expect(slot.width).toBeUndefined();
  });

  it('recenterControl="always" : disque « Recentrer » toujours visible en haut à droite (pas de pastille en plus)', async () => {
    mockMapProps.length = 0;
    const r = await render(wrap(layout({ recenterControl: 'always' })));
    await act(async () => undefined);
    const buttons = r.getAllByTestId('recenter-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveProp('accessibilityLabel', 'Recentrer la carte');
    const before = mockMapProps.at(-1)!.recenterKey ?? 0;
    await act(async () => fireEvent.press(buttons[0]!));
    expect(mockMapProps.at(-1)!.recenterKey).toBe(before + 1);
  });

  it('cadrage : le haut garde la barre du haut et la hauteur d’une épingle', async () => {
    mockMapProps.length = 0;
    const r = await render(wrap(layout({ topCenter: <Text testID="chip">Course</Text> })));
    const bar = r.getByTestId('chip').parent!.parent!;
    await act(async () => fireEvent(bar, 'layout', { nativeEvent: { layout: { x: 0, y: 8, width: 366, height: 80 } } }));
    // 8 (marge) + 80 (barre) + 56 (épingle) = 144 > 104 (marge par défaut).
    expect(mockMapProps.at(-1)!.padding!.top).toBe(144);
  });
});
