import { Text } from 'react-native';

/** Icône d'onglet simple (emoji), comme sur les maquettes. */
export function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
}
