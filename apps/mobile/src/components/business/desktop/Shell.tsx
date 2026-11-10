import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { palette } from '../../../theme';
import { Sidebar } from './Sidebar';

/**
 * Cadre de l'espace entreprise. Téléphone : le contenu seul (barre d'onglets flottante). Ordinateur : barre latérale
 * blanche à gauche, contenu sur canvas à droite, toute la fenêtre (web : la mise en page racine, `isWideAppPath`). Le contenu
 * garde sa place dans l'arbre (clé stable) quand la fenêtre passe d'un format à l'autre : la navigation n'est pas
 * remontée.
 */
export function BusinessFrame({ desktop, children }: { desktop: boolean; children: ReactNode }) {
  return (
    <View style={[styles.frame, desktop && styles.desktop]} testID={desktop ? 'business-desktop' : undefined}>
      {desktop ? <Sidebar key="sidebar" /> : null}
      <View key="content" style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: palette.canvas },
  desktop: { flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
});
