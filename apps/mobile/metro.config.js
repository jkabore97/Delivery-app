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

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (aliases[moduleName]) {
    return { type: 'sourceFile', filePath: aliases[moduleName] };
  }
  if (moduleName === 'zod' || moduleName.startsWith('zod/')) {
    // Une seule copie de zod : celle de l'application mobile.
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
