import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../../components/design/Icon';
import { dark } from '../../../theme';

function tabIcon(name: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : dark.textFaint} strokeWidth={focused ? 2.6 : 2.1} />;
  };
}

/** Onglets du livreur : barre sombre (comme ses feuilles), onglet actif en vert vif, libellés jamais coupés. */
export default function DriverTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark.green,
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
      <Tabs.Screen name="index" options={{ title: 'Courses', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Gains', tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', tabBarIcon: tabIcon('document') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('user') }} />
    </Tabs>
  );
}
