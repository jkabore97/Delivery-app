import { lazy, Suspense } from 'react';
import { Loading } from '../../ui';

/*
 * Web : le tableau de bord de l'ordinateur est un morceau de code à part (React.lazy, `import()`), téléchargé seulement
 * sur une fenêtre d'ordinateur ; l'accueil du téléphone n'en porte pas le poids.
 */
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.BusinessDashboard })));

export function LazyDashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
