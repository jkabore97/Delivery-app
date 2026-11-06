import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import type { Role } from '@yaar/shared';
import { homePathForRole } from '../lib/roles';
import { useAuth } from '../state/auth';
import { Loading } from './ui';

/** N'affiche l'espace que pour le bon rôle ; sinon redirige (connexion ou bon espace). */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'signedOut' || !user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={homePathForRole(user.role)} />;
  return <>{children}</>;
}
