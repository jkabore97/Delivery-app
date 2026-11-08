import { Redirect } from 'expo-router';

/** Onglet « Nouvelle » ouvert par un lien direct : le parcours plein écran prend le relais. */
export default function NewDeliveryTab() {
  return <Redirect href="/business/nouvelle" />;
}
