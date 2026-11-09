/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Bloc principal ≈ 165 Ko gzip (react, zod, écrans). MapLibre GL (≈ 1 Mo, 275 Ko gzip, + 10 Ko de CSS) est un
  // bloc séparé chargé à la demande par la première carte affichée (src/lib/map/engine.ts → maplibreModule.ts) :
  // l'écran de connexion ne le télécharge pas. Limite d'avertissement relevée pour ce seul bloc.
  build: { chunkSizeWarningLimit: 1100 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
