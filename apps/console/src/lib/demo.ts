/** Code OTP accepté pour tous les numéros quand l'API tourne avec DEMO_MODE=true (GET /config). */
export const DEMO_OTP_CODE = '123456';

/** Comptes back-office créés par apps/api/prisma/seed.ts (docs/API.md §12). */
export const DEMO_ACCOUNTS: ReadonlyArray<{ phone: string; label: string; role: string }> = [
  { phone: '70000002', label: 'Salif K.', role: 'Contrôleur' },
  { phone: '70000001', label: 'Admin Yaar', role: 'Administrateur' },
];
