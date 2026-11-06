import { Tabs } from 'expo-router/tabs';
import { TabIcon } from '../../../components/TabIcon';
import { colors } from '../../../theme';

export default function SellerTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.orange }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Commandes', tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} /> }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menu', tabBarIcon: ({ focused }) => <TabIcon emoji="🍲" focused={focused} /> }}
      />
      <Tabs.Screen
        name="sales"
        options={{ title: 'Ventes', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tabs.Screen
        name="store"
        options={{ title: 'Boutique', tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}
      />
    </Tabs>
  );
}
