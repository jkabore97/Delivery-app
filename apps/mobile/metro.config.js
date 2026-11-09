// Metro : le code partagé (packages/shared) vit hors du projet Expo.
// On le surveille (watchFolders) et on force la résolution de `@yaar/shared` et `zod`
// vers des emplacements uniques, pour ne pas dépendre du node_modules de la racine du monorepo.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

const aliases = {
  '@yaar/shared': path.join(sharedRoot, 'src/index.ts'),
};

// Toutes les langues de zod (zod/locales, z.locales) : remplacées par le français et l'anglais seulement
// (shims/zod-locales.js), ce qui allège chaque bundle de ~350 ko non minifiés.
const ZOD_LOCALES_INDEX = /[\\/]zod[\\/](?:v4[\\/])?locales[\\/]index\.c?js$/;
const zodLocalesShim = path.join(projectRoot, 'shims/zod-locales.js');

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (aliases[moduleName]) {
    return { type: 'sourceFile', filePath: aliases[moduleName] };
  }
  let resolved;
  if (moduleName === 'zod' || moduleName.startsWith('zod/')) {
    // Une seule copie de zod : celle de l'application mobile.
    resolved = context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  } else {
    resolved = upstreamResolveRequest
      ? upstreamResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  }
  if (
    resolved &&
    resolved.type === 'sourceFile' &&
    ZOD_LOCALES_INDEX.test(resolved.filePath) &&
    context.originModulePath !== zodLocalesShim
  ) {
    return { type: 'sourceFile', filePath: zodLocalesShim };
  }
  return resolved;
};

module.exports = config;
