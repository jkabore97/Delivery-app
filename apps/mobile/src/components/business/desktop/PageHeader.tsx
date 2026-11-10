import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type TextInput as RNTextInput } from 'react-native';
import { Text, TextInput } from '../../Text';
import { Icon } from '../../design/Icon';
import { alpha, palette, shadows, tabular } from '../../../theme';
import { frenchDate } from '../dashboardData';
import { POINTER, type WebPressState } from '../parts';
import { formatTime } from '../../../lib/format';

/** Mac : raccourci affiché « ⌘ K » ; ailleurs « Ctrl K ». */
function isMac(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
}

/** Ligne de date sous le titre : point vert « en direct », « lundi 9 novembre · 12:02 ». */
export function LiveDateLine({ now }: { now: number }) {
  return (
    <View style={styles.dateRow} accessible accessibilityLabel={`En direct, ${frenchDate(now)}, ${formatTime(new Date(now).toISOString())}`}>
      <View style={styles.liveDot} />
      <Text style={styles.date} numberOfLines={1}>
        {frenchDate(now)} · <Text style={tabular}>{formatTime(new Date(now).toISOString())}</Text>
      </Text>
    </View>
  );
}

/**
 * En-tête d'une page de l'ordinateur : titre 30/800 et sa ligne (date en direct ou sous-titre) à gauche ; à droite la
 * recherche (facultative) et l'action principale (« Nouvelle livraison »). `back` : bouton rond de retour à gauche du
 * titre (détail d'une livraison, parcours de demande).
 */
export function PageHeader({
  title,
  subtitle,
  search,
  actions,
  back,
  titleAccessory,
  wrap = false,
}: {
  title: string;
  subtitle?: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
  back?: { onPress: () => void; label?: string };
  titleAccessory?: ReactNode;
  /** Colonne étroite : la recherche et l'action passent sous le titre plutôt que de le couper. */
  wrap?: boolean;
}) {
  return (
    <View style={[styles.top, wrap && styles.topWrap]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={back.label ?? 'Retour'}
          onPress={back.onPress}
          style={(s: WebPressState) => [styles.back, POINTER, (s.hovered || s.pressed) && styles.backHover]}
          testID="page-back"
        >
          <Icon name="back" size={20} color={palette.ink} strokeWidth={2.3} />
        </Pressable>
      ) : null}
      <View style={styles.titleBox}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header" testID="page-title">
            {title}
          </Text>
          {titleAccessory}
        </View>
        {typeof subtitle === 'string' ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      <View style={styles.acts}>
        {search}
        {actions}
      </View>
    </View>
  );
}

/**
 * Recherche du tableau de bord (vraie : filtre les livraisons en cours et du jour par numéro ou destinataire). Pilule
 * blanche 48 px, raccourci clavier ⌘ K / Ctrl K (web) qui place le curseur dans le champ, Échap pour effacer. Pilule
 * étroite (fenêtre de 1 024 à ~1 250 px) : texte d'aide court (`shortPlaceholder`) et raccourci masqué sous 300 px.
 */
export function SearchPill({
  value,
  onChangeText,
  placeholder,
  shortPlaceholder = 'Rechercher…',
  testID,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  shortPlaceholder?: string;
  testID?: string;
}) {
  const ref = useRef<ComponentRef<typeof RNTextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [pillWidth, setPillWidth] = useState<number | null>(null);
  const narrow = pillWidth !== null && pillWidth < 360;
  const showKbd = pillWidth === null || pillWidth >= 300;
  const mac = isMac();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <View
      style={[styles.search, focused && styles.searchFocused]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== pillWidth) setPillWidth(w);
      }}
    >
      <Icon name="search" size={18} color={palette.inkMuted} strokeWidth={2.3} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={narrow ? shortPlaceholder : placeholder}
        placeholderTextColor={palette.inkMuted}
        accessibilityLabel={placeholder.replace(/…$/, '')}
        style={styles.searchInput}
        onKeyPress={(e) => {
          if ((e.nativeEvent as { key?: string }).key === 'Escape') onChangeText('');
        }}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => onChangeText('')} style={[styles.clear, POINTER]}>
          <Icon name="close" size={14} color={palette.ink} strokeWidth={2.6} />
        </Pressable>
      ) : Platform.OS === 'web' && showKbd ? (
        <View style={styles.kbd} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {mac ? <Icon name="command" size={13} color={palette.inkMuted} strokeWidth={2.4} /> : <Text style={styles.kbdText}>Ctrl</Text>}
          <Text style={styles.kbdText}>K</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 },
  topWrap: { flexWrap: 'wrap', rowGap: 12 },
  back: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center', ...shadows.hairline },
  backHover: { backgroundColor: palette.raised },
  // Le titre garde toute sa largeur (« Vue d’ensemble » jamais coupé) : la recherche se resserre à sa place.
  titleBox: { flexShrink: 0, maxWidth: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink, flexShrink: 0 },
  subtitle: { marginTop: 2, fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  dateRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.mint, boxShadow: `0 0 0 3px ${alpha(palette.mint, 0.18)}` },
  date: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  acts: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 },
  search: {
    flexShrink: 1,
    width: 424,
    minWidth: 220,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: 24,
    backgroundColor: palette.card,
    ...shadows.hairline,
  },
  // Anneau de focus Cobalt : 2 px cobalt (le champ lui-même n'a pas de contour).
  searchFocused: { boxShadow: `0 0 0 2px ${palette.cobalt}` },
  searchInput: { flex: 1, minWidth: 0, height: 46, fontSize: 14, fontWeight: '500', color: palette.ink, outlineWidth: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  kbd: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: palette.canvas },
  kbdText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.inkMuted },
  clear: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
});
