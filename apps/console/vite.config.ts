/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Précharge la police de l'interface (alphabet latin, fichier variable) dès les premiers octets de index.html, en
 * parallèle du JavaScript et du CSS. Le fichier est retrouvé dans le build par son motif de nom fontsource
 * (« …-latin-wght-normal-<hash>.woff2 ») : aucun nom de police ici (il n'est écrit que dans src/fonts.css).
 */
function preloadLatinFont(): Plugin {
  return {
    name: 'yaar-preload-latin-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /-latin-wght-normal-[\w-]+\.woff2$/.test(f));
        if (!file) return [];
        return [
          {
            tag: 'link',
            attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: true },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadLatinFont()],
  server: { port: 5173 },
  // Bloc principal ≈ 165 Ko gzip (react, zod, écrans). MapLibre GL (≈ 1 Mo, 275 Ko gzip, + 10 Ko de CSS) est un
  // bloc séparé chargé à la demande par la première carte affichée (src/lib/map/engine.ts → maplibreModule.ts) :
  // l'écran de connexion ne le télécharge pas. Limite d'avertissement relevée pour ce seul bloc.
  build: {
    chunkSizeWarningLimit: 1100,
    // Les polices restent des fichiers (jamais copiées en base64 dans le CSS, même un petit sous-ensemble).
    assetsInlineLimit: (file) => (file.endsWith('.woff2') || file.endsWith('.woff') ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
