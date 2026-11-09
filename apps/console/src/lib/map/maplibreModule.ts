/**
 * Seul module qui importe MapLibre GL JS (≈ 1 Mo) et sa feuille de style : il n'est chargé qu'à la demande
 * (`import()` dans loadMaplibre), dans un bloc JS et CSS séparé. L'écran de connexion ne le télécharge jamais.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibre from 'maplibre-gl';

type Maplibre = typeof maplibre;

// Paquet UMD : selon l'interopérabilité du bundler, l'API est l'espace de noms ou son `default`.
const mod = maplibre as unknown as Maplibre & { default?: Maplibre };

export const ml: Maplibre = mod.default && typeof mod.default.Map === 'function' ? mod.default : mod;
