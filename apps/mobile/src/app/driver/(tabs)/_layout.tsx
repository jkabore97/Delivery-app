import { Tabs } from 'expo-router/tabs';
import { TabIcon } from '../../../components/TabIcon';
import { colors } from '../../../theme';

export default function DriverTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Courses', tabBarIcon: ({ focused }) => <TabIcon emoji="🛵" focused={focused} /> }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Gains', tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} /> }}
      />
      <Tabs.Screen
        name="documents"
        options={{ title: 'Documents', tabBarIcon: ({ focused }) => <TabIcon emoji="📄" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tabs>
  );
}
