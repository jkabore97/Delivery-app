import { Tabs } from 'expo-router/tabs';
import { FloatingTabBar, TabBarInsetProvider, tabIcon } from '../../../components/design/TabBar';
import { palette } from '../../../theme';

/** Onglets du livreur : barre Cobalt flottante (pilule blanche, onglet actif en capsule cobalt). */
export default function DriverTabs() {
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.canvas } }}
      >
        <Tabs.Screen name="index" options={{ title: 'Courses', tabBarIcon: tabIcon('map') }} />
        <Tabs.Screen name="earnings" options={{ title: 'Gains', tabBarIcon: tabIcon('wallet') }} />
        <Tabs.Screen name="documents" options={{ title: 'Documents', tabBarIcon: tabIcon('document') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('user') }} />
      </Tabs>
    </TabBarInsetProvider>
  );
}
