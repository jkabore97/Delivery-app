import { Text } from './Text';

/**
 * @deprecated Icône d'onglet en émoji (anciennes maquettes). Cobalt n'a pas d'émoji : les barres d'onglets utilisent
 * `tabIcon('package')` de components/design/TabBar.tsx (pictogrammes dessinés). Plus utilisée ; à supprimer.
 */
export function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
}
