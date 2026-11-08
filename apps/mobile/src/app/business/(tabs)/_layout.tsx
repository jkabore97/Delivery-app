import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { TabIcon } from '../../../components/TabIcon';
import { colors } from '../../../theme';

export default function BusinessTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.orange }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Livraisons', tabBarIcon: ({ focused }) => <TabIcon emoji="🛵" focused={focused} /> }}
      />
      <Tabs.Screen
        name="new"
        options={{ title: 'Nouvelle', tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} /> }}
        listeners={{
          // Le parcours « nouvelle livraison » s'ouvre en plein écran (carte), hors des onglets.
          tabPress: (e) => {
            e.preventDefault();
            router.push('/business/nouvelle');
          },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Historique', tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon emoji="🏪" focused={focused} /> }}
      />
    </Tabs>
  );
}
