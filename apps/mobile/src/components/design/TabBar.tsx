import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Text } from '../Text';
import { palette } from '../../theme';
import { Icon, type IconName } from './Icon';
import { TAB_BAR_HEIGHT, tabBarBottom } from './tabBarInset';

export { TAB_BAR_HEIGHT, TabBarInsetProvider, useTabBarInset } from './tabBarInset';

/** Écart entre la pilule et les bords de l'écran. */
const SIDE_GAP = 16;

/** Pictogramme d'onglet du système de design (couleur fournie par la barre : blanc actif, encre secondaire sinon). */
export function tabIcon(name: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={22} color={typeof color === 'string' ? color : palette.inkMuted} strokeWidth={focused ? 2.4 : 2.1} />;
  };
}

/** Barre masquée pendant la saisie (Android / iOS) : le clavier la remonterait sur le champ. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * Barre d'onglets Cobalt : pilule blanche flottante (ombre flottante, 16 px des bords, au-dessus de la zone sûre),
 * onglet actif en capsule cobalt (pictogramme et libellé blancs), autres onglets en encre secondaire. Reprend les
 * options de chaque écran (`title`, `tabBarIcon`, `tabBarAccessibilityLabel`, `tabBarButtonTestID`, onglet masqué) et
 * le comportement de la barre standard : événement `tabPress` (annulable, ex. « Nouvelle » de l'entreprise qui ouvre
 * un écran plein), puis navigation ; `tabLongPress`. À utiliser : `<Tabs tabBar={(p) => <FloatingTabBar {...p} />}>`
 * dans un `TabBarInsetProvider`.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const keyboard = useKeyboardShown();
  if (keyboard) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: tabBarBottom(insets.bottom) }]}>
      <View style={styles.bar} role="tablist" testID="tab-bar">
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;
          const { options } = descriptor;
          const itemStyle = StyleSheet.flatten(options.tabBarItemStyle);
          if (itemStyle?.display === 'none') return null;
          const focused = index === state.index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
          const color = focused ? palette.onCobalt : palette.inkMuted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          const onLongPress = () => emitter.emit({ type: 'tabLongPress', target: route.key });
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              aria-selected={focused}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, focused && styles.tabActive, pressed && !focused && styles.tabPressed]}
              testID={options.tabBarButtonTestID}
            >
              {options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 22 }) : null}
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: SIDE_GAP, right: SIDE_GAP, alignItems: 'stretch' },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    backgroundColor: palette.card,
    padding: 6,
    flexDirection: 'row',
    gap: 4,
    boxShadow: '0 0 0 1px rgba(12, 18, 34, 0.04), 0 10px 30px rgba(12, 18, 34, 0.16)',
    ...(Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 28 ? { elevation: 10 } : null),
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 26, minWidth: 0 },
  tabActive: { backgroundColor: palette.cobalt },
  tabPressed: { backgroundColor: palette.raised },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
