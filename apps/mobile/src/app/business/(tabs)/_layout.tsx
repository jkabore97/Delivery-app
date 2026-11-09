import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { useIsDesktop } from '../../../components/business/desktop/layout';
import { Icon } from '../../../components/design/Icon';
import { FloatingTabBar, TabBarInsetProvider, tabIcon } from '../../../components/design/TabBar';
import { notify } from '../../../lib/dialog';
import { newDeliveryAccess } from '../../../lib/storeApproval';
import { useBusiness } from '../../../state/business';
import { palette } from '../../../theme';

/**
 * « Nouvelle » : disque cobalt plein (le parcours s'ouvre en plein écran par-dessus les onglets). Grisé tant que
 * l'entreprise ne peut pas demander de livraison (en attente de validation, suspendue, pas encore créée).
 */
function NewTabIcon({ enabled }: { enabled: boolean }) {
  return (
    <View style={[styles.newDisc, !enabled && styles.newDiscOff]} testID={enabled ? 'new-tab-disc' : 'new-tab-disc-off'}>
      <Icon name="plus" size={20} color={enabled ? palette.onCobalt : palette.inkMuted} strokeWidth={2.8} />
    </View>
  );
}

/**
 * Onglets de l'entreprise : barre Cobalt flottante (pilule blanche, onglet actif en capsule cobalt), « Nouvelle » en
 * disque cobalt (grisé si l'entreprise ne peut pas encore demander de livraison : son appui montre alors pourquoi, ou
 * ouvre le profil à créer). Ordinateur : pas de barre d'onglets (la barre latérale du cadre la remplace), ni de place
 * réservée pour elle en bas des écrans.
 */
export default function BusinessTabs() {
  const { stores, store } = useBusiness();
  const desktop = useIsDesktop();
  const access = newDeliveryAccess(stores, store);
  const enabled = access.kind === 'open';
  const tabs = (
    <Tabs
      tabBar={(props) => (desktop ? null : <FloatingTabBar {...props} />)}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.canvas } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Livraisons', tabBarIcon: tabIcon('package') }} />
      <Tabs.Screen
        name="new"
        options={{
          title: 'Nouvelle',
          tabBarIcon: () => <NewTabIcon enabled={enabled} />,
          tabBarAccessibilityLabel: enabled ? 'Nouvelle livraison' : 'Nouvelle livraison, indisponible pour le moment',
          tabBarButtonTestID: 'tab-new-delivery',
        }}
        listeners={{
          // Le parcours « nouvelle livraison » s'ouvre en plein écran (carte), hors des onglets ; entreprise pas
          // encore validée ou suspendue : le bandeau de validation à la place.
          tabPress: (e) => {
            e.preventDefault();
            if (access.kind === 'open') router.push('/business/nouvelle');
            else if (access.kind === 'profile') router.navigate('/business/profile');
            else notify(access.notice.title, access.notice.message);
          },
        }}
      />
      <Tabs.Screen name="history" options={{ title: 'Historique', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('store') }} />
    </Tabs>
  );
  return desktop ? tabs : <TabBarInsetProvider>{tabs}</TabBarInsetProvider>;
}

const styles = StyleSheet.create({
  newDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.cobalt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDiscOff: { backgroundColor: palette.raisedHigh },
});
