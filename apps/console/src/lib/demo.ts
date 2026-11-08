/**
 * Comptes back-office créés par apps/api/prisma/seed.ts (docs/API.md §12). En mode démo (GET /config →
 * demoMode), ils se connectent avec le code d'accès démo fourni par Yaar (DEMO_STAFF_CODE de l'API),
 * jamais avec le code 123456 des applications : le numéro seul est pré-rempli.
 */
export const DEMO_ACCOUNTS: ReadonlyArray<{ phone: string; label: string; role: string }> = [
  { phone: '70000002', label: 'Salif K.', role: 'Contrôleur' },
  { phone: '70000001', label: 'Admin Yaar', role: 'Administrateur' },
];
