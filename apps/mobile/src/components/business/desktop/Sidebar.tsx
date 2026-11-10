import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type PressableStateCallbackType, type ViewStyle } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Text } from '../../Text';
import { Icon, type IconName } from '../../design/Icon';
import { avatarInitials } from '../../map/markerArt';
import { useAuth } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { alpha, palette, shadows, tabular } from '../../../theme';
import { shortName } from '../dashboardData';
import { NavLink } from '../parts';
import { useBusinessSummary, useSummaryRefresh } from '../summary';
import { POINTER, SIDEBAR_WIDTH } from './layout';

type NavKey = 'overview' | 'history' | 'stores';

/** Destinations réelles de l'espace entreprise (pas de lien mort) : tableau de bord, historique, établissements. */
const NAV: { key: NavKey; label: string; icon: IconName; href: '/business' | '/business/history' | '/business/profile' }[] = [
  { key: 'overview', label: 'Vue d’ensemble', icon: 'grid', href: '/business' },
  { key: 'history', label: 'Historique', icon: 'history', href: '/business/history' },
  { key: 'stores', label: 'Établissements', icon: 'store', href: '/business/profile' },
];

/** Entrée active d'après l'adresse : le détail d'une livraison et le parcours de demande dépendent du tableau de bord. */
export function activeNav(pathname: string | null | undefined): NavKey | null {
  const p = (pathname ?? '').replace(/\/+$/, '');
  if (p.startsWith('/business/history')) return 'history';
  if (p.startsWith('/business/profile')) return 'stores';
  if (p === '/business' || p === '' || p.startsWith('/business/livraison') || p.startsWith('/business/nouvelle')) return 'overview';
  return null;
}

/** État d'un élément pressable sur le web (react-native-web ajoute `hovered` et `focused`). */
type WebState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/**
 * Barre latérale de l'ordinateur (spec Cobalt) : marque « Yaar » et son point cobalt, entrées en pilules (active :
 * cobaltTint, texte cobaltText), nombre de livraisons en cours, carte de l'entreprise en bas (initiales sur carré encre,
 * nom de l'établissement, personne connectée) : sélecteur d'établissement s'il y en a plusieurs, sinon accès au profil.
 */
export function Sidebar() {
  const pathname = usePathname();
  const active = activeNav(pathname);
  const { summary } = useBusinessSummary();
  const live = summary?.active ?? 0;
  // Hors du tableau de bord (qui relit lui-même le résumé), le badge « en cours » reste à jour : même rythme.
  const onDashboard = (pathname ?? '').replace(/\/+$/, '') === '/business';
  useSummaryRefresh(!onDashboard);
  return (
    <View style={styles.side} accessibilityRole="navigation" testID="business-sidebar">
      <NavLink href="/business">
        <Pressable accessibilityRole="link" accessibilityLabel="Yaar Livraison, vue d’ensemble" style={[styles.brand, POINTER]} testID="nav-brand">
          <Text style={styles.brandText}>Yaar</Text>
          <View style={styles.brandDot} />
        </Pressable>
      </NavLink>
      <View style={styles.nav}>
        {NAV.map((item) => {
          const on = item.key === active;
          const badge = item.key === 'overview' && live > 0 ? live : null;
          return (
            // Lien (`<a href>` sur le web) : style fixe sur le Pressable (le `Slot` du lien ne sait pas fusionner un style
            // fonction), le survol est dessiné par son enfant.
            <NavLink key={item.key} href={item.href}>
              <Pressable
                accessibilityRole="link"
                accessibilityState={{ selected: on }}
                aria-current={on ? 'page' : undefined}
                accessibilityLabel={badge ? `${item.label}, ${badge} livraison${badge > 1 ? 's' : ''} en cours` : item.label}
                style={[styles.itemLink, POINTER]}
                testID={`nav-${item.key}`}
              >
                {(s: WebState) => (
                  <View style={[styles.item, on ? styles.itemOn : s.hovered || s.pressed ? styles.itemHover : null]}>
                    <Icon name={item.icon} size={20} color={on ? palette.cobaltText : palette.inkMuted} strokeWidth={on ? 2.3 : 2.1} />
                    <Text style={[styles.itemText, on && styles.itemTextOn]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badge}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            </NavLink>
          );
        })}
      </View>
      <BusinessCard />
    </View>
  );
}

/** Carte de l'entreprise (bas de la barre latérale). */
function BusinessCard() {
  const { user } = useAuth();
  const { stores, store, selectStore } = useBusiness();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const selected = useRef<ComponentRef<typeof Pressable>>(null);
  const wasOpen = useRef(false);
  const several = (stores?.length ?? 0) > 1;
  const name = store?.name ?? 'Mon entreprise';
  const person = shortName(user?.name) || 'Compte entreprise';
  const sub = several ? `${person} · ${stores!.length} établissements` : person;
  // Clavier (web) : à l'ouverture, le focus va sur l'établissement choisi ; à la fermeture, il revient au bouton.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (open) {
      wasOpen.current = true;
      const t = setTimeout(() => (selected.current as unknown as { focus?: () => void } | null)?.focus?.(), 0);
      return () => clearTimeout(t);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      (trigger.current as unknown as { focus?: () => void } | null)?.focus?.();
    }
    return undefined;
  }, [open]);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={several ? `Établissement : ${name}. Changer d’établissement` : `${name}, ${person}. Ouvrir le profil de l’entreprise`}
        onPress={() => (several ? setOpen(true) : router.navigate('/business/profile'))}
        style={(s: WebState) => [styles.biz, POINTER, (s.hovered || s.pressed) && styles.bizHover]}
        testID="sidebar-business"
      >
        <View style={styles.bizMark}>
          <Text style={styles.bizMarkText}>{avatarInitials(name) ?? '?'}</Text>
        </View>
        <View style={styles.bizText}>
          <Text style={styles.bizName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.bizSub} numberOfLines={2}>
            {sub}
          </Text>
        </View>
        <Icon name={several ? 'selector' : 'chevronRight'} size={18} color={palette.inkMuted} strokeWidth={2.2} />
      </Pressable>
      {several ? (
        <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer le choix d’établissement" />
          <View style={[styles.menu, shadows.float]} accessibilityRole="menu" testID="store-switcher">
            <Text style={styles.menuTitle}>Point de retrait des nouvelles livraisons</Text>
            <Text style={styles.menuNote}>Le tableau de bord montre les livraisons de tous vos établissements.</Text>
            {stores!.map((s) => {
              const on = s.id === store?.id;
              return (
                <Pressable
                  key={s.id}
                  ref={on ? selected : undefined}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    selectStore(s.id);
                    setOpen(false);
                  }}
                  style={(st: WebState) => [styles.menuItem, POINTER, (st.hovered || st.pressed) && styles.itemHover]}
                >
                  <View style={[styles.menuMark, on && styles.menuMarkOn]}>
                    <Text style={[styles.menuMarkText, on && styles.menuMarkTextOn]}>{avatarInitials(s.name) ?? '?'}</Text>
                  </View>
                  <Text style={[styles.menuText, on && styles.menuTextOn]} numberOfLines={1}>
                    {s.name}
                  </Text>
                  {on ? <Icon name="check" size={16} color={palette.cobaltText} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                router.navigate('/business/profile');
              }}
              style={(st: WebState) => [styles.menuItem, styles.menuManage, POINTER, (st.hovered || st.pressed) && styles.itemHover]}
            >
              <Icon name="settings" size={18} color={palette.inkMuted} strokeWidth={2.1} />
              <Text style={styles.menuText}>Gérer les établissements</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const webOnly = (s: object): ViewStyle => (Platform.OS === 'web' ? (s as ViewStyle) : {});

const styles = StyleSheet.create({
  side: {
    width: SIDEBAR_WIDTH,
    backgroundColor: palette.card,
    paddingTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 16,
    ...webOnly({ boxShadow: `1px 0 0 ${alpha(palette.ink, 0.04)}` }),
  },
  brand: { flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-start', gap: 3, height: 36, paddingLeft: 12 },
  brandText: { fontSize: 27, lineHeight: 30, fontWeight: '800', letterSpacing: -1.2, color: palette.ink },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.cobalt, marginBottom: 6 },
  nav: { marginTop: 36, gap: 4 },
  itemLink: { borderRadius: 24 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 12, borderRadius: 24 },
  itemOn: { backgroundColor: palette.cobaltTint },
  itemHover: { backgroundColor: palette.raised },
  itemText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.ink },
  itemTextOn: { color: palette.cobaltText, fontWeight: '700' },
  badge: { minWidth: 22, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: palette.cobalt, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: palette.onCobalt, ...tabular },
  biz: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: palette.canvas },
  bizHover: { backgroundColor: palette.raisedHigh },
  bizMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  bizMarkText: { fontSize: 13, lineHeight: 16, fontWeight: '800', color: palette.white, letterSpacing: 0.2 },
  bizText: { flex: 1, minWidth: 0 },
  bizName: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.ink },
  bizSub: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: { position: 'absolute', left: 16, bottom: 92, width: SIDEBAR_WIDTH + 24, backgroundColor: palette.card, borderRadius: 20, padding: 8, gap: 2 },
  menuTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink, paddingHorizontal: 12, paddingTop: 6 },
  menuNote: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 14 },
  menuManage: { marginTop: 4 },
  menuMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.raised, alignItems: 'center', justifyContent: 'center' },
  menuMarkOn: { backgroundColor: palette.ink },
  menuMarkText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: palette.ink },
  menuMarkTextOn: { color: palette.white },
  menuText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.ink },
  menuTextOn: { fontWeight: '700' },
});
