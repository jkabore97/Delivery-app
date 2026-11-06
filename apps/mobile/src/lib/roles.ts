import type { Role } from '@yaar/shared';

export type MobileSpace = 'client' | 'seller' | 'driver';

/** Espace de l'application selon le rôle ; null pour les comptes back-office (console web). */
export function spaceForRole(role: Role): MobileSpace | null {
  switch (role) {
    case 'CLIENT':
      return 'client';
    case 'SELLER':
      return 'seller';
    case 'DRIVER':
      return 'driver';
    case 'CONTROLLER':
    case 'ADMIN':
      return null;
  }
}

export function homePathForRole(role: Role): '/client' | '/seller' | '/driver' | '/login' {
  const space = spaceForRole(role);
  return space ? `/${space}` : '/login';
}

export const BACK_OFFICE_MESSAGE = 'Ce compte est un compte de contrôle : utilisez la console web.';
