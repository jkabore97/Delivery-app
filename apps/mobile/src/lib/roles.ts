import type { Role } from '@yaar/shared';

/**
 * Yaar Livraison est un service de livraison pour les entreprises (comme Uber Direct / DoorDash Drive) :
 * l'application a deux espaces, Entreprise (compte SELLER) et Livreur (DRIVER). Les destinataires n'ont pas
 * de compte : ils suivent leur colis avec le lien reçu (page publique /suivi/<jeton>).
 */
export type MobileSpace = 'business' | 'driver';

/** Espace de l'application selon le rôle ; null pour les comptes client (anciens) et back-office. */
export function spaceForRole(role: Role): MobileSpace | null {
  switch (role) {
    case 'SELLER':
      return 'business';
    case 'DRIVER':
      return 'driver';
    case 'CLIENT':
    case 'CONTROLLER':
    case 'ADMIN':
      return null;
  }
}

export function homePathForRole(role: Role): '/business' | '/driver' | '/login' {
  const space = spaceForRole(role);
  return space ? `/${space}` : '/login';
}

/** Rôles proposés à l'inscription (premier code) : il n'y a pas d'inscription client. */
export const SIGNUP_ROLES = [
  { role: 'SELLER', label: 'Entreprise', emoji: '🏪', hint: 'Je fais livrer mes clients' },
  { role: 'DRIVER', label: 'Livreur', emoji: '🛵', hint: 'Je livre avec Yaar' },
] as const;

export type SignupRole = (typeof SIGNUP_ROLES)[number]['role'];

export function isSignupRole(v: unknown): v is SignupRole {
  return v === 'SELLER' || v === 'DRIVER';
}

/** Libellé du rôle dans l'application (« Vendeur » de l'API = « Entreprise »). */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'SELLER':
      return 'Entreprise';
    case 'DRIVER':
      return 'Livreur';
    case 'CLIENT':
      return 'Client';
    case 'CONTROLLER':
      return 'Contrôleur';
    case 'ADMIN':
      return 'Administrateur';
  }
}

export const BACK_OFFICE_MESSAGE = 'Ce compte est un compte de contrôle : utilisez la console web.';

export const CLIENT_ACCOUNT_MESSAGE =
  'Bonjour ! Yaar Livraison est réservé aux entreprises et aux livreurs. Vous attendez un colis ? Pas besoin de compte : ouvrez le lien de suivi reçu par SMS ou WhatsApp pour suivre votre livreur en direct.';

/** Message affiché quand un compte sans espace mobile se connecte (null : compte autorisé). */
export function blockedAccountMessage(role: Role): string | null {
  if (spaceForRole(role)) return null;
  return role === 'CLIENT' ? CLIENT_ACCOUNT_MESSAGE : BACK_OFFICE_MESSAGE;
}
