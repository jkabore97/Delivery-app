import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setupEnv.ts'],
    // Les tests d'intégration partagent une même base PostgreSQL : exécution séquentielle.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
