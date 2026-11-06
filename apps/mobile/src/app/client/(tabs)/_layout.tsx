import { Tabs } from 'expo-router/tabs';
import { TabIcon } from '../../../components/TabIcon';
import { colors } from '../../../theme';

export default function ClientTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Accueil', tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Commandes', tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} /> }}
      />
      <Tabs.Screen
        name="stores"
        options={{ title: 'Boutiques', tabBarIcon: ({ focused }) => <TabIcon emoji="🏪" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tabs>
  );
}
