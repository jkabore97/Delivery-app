import { Redirect } from 'expo-router';
import { Loading } from '../components/ui';
import { homePathForRole } from '../lib/roles';
import { useAuth } from '../state/auth';

/**
 * Aiguillage : connexion, puis espace selon le rôle (Entreprise, Livreur). Un compte sans espace (ancien
 * compte client, console) revient à la connexion, qui explique pourquoi.
 */
export default function Index() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'signedOut' || !user) return <Redirect href="/login" />;
  return <Redirect href={homePathForRole(user.role)} />;
}
