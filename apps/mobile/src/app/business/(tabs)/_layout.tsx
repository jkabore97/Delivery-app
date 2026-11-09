import { StyleSheet, View, type ColorValue } from 'react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BUSINESS_ACCENT, ORANGE_INK } from '../../../components/business/accent';
import { Icon, type IconName } from '../../../components/design/Icon';
import { notify } from '../../../lib/dialog';
import { newDeliveryAccess } from '../../../lib/storeApproval';
import { useBusiness } from '../../../state/business';
import { dark } from '../../../theme';

function tabIcon(name: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : dark.textFaint} strokeWidth={focused ? 2.6 : 2.1} />;
  };
}

/**
 * « Nouvelle » : disque orange plein, le parcours s'ouvre en plein écran par-dessus les onglets. Grisé tant que
 * l'entreprise ne peut pas demander de livraison (en attente de validation, suspendue, pas encore créée).
 */
function NewTabIcon({ enabled }: { enabled: boolean }) {
  return (
    <View style={[styles.newDisc, !enabled && styles.newDiscOff]} testID={enabled ? 'new-tab-disc' : 'new-tab-disc-off'}>
      <Icon name="plus" size={22} color={enabled ? ORANGE_INK : dark.textMuted} strokeWidth={2.8} />
    </View>
  );
}

/**
 * Onglets de l'entreprise : barre sombre (dans le prolongement des feuilles sombres de l'accueil et de l'historique,
 * comme celle du livreur), pictogrammes du système de design, onglet actif en orange (accent de l'entreprise),
 * « Nouvelle » en disque orange (grisé si l'entreprise ne peut pas encore demander de livraison : son appui montre
 * alors pourquoi, ou ouvre le profil à créer).
 */
export default function BusinessTabs() {
  const insets = useSafeAreaInsets();
  const { stores, store } = useBusiness();
  const access = newDeliveryAccess(stores, store);
  const enabled = access.kind === 'open';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BUSINESS_ACCENT,
        tabBarInactiveTintColor: dark.textFaint,
        // Onglet : 5 + icône 28 + libellé ~15 + 5 px ; la barre par défaut (49 px) coupe le bas des libellés.
        tabBarStyle: {
          backgroundColor: dark.surface,
          borderTopColor: dark.border,
          height: 58 + insets.bottom,
          paddingTop: 2,
          paddingBottom: 2 + insets.bottom,
        },
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11.5 },
      }}
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
}

const styles = StyleSheet.create({
  newDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginTop: -2,
    backgroundColor: BUSINESS_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDiscOff: { backgroundColor: dark.raisedHigh },
});
