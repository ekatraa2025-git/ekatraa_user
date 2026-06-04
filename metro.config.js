const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Keep Pipecat / Daily in async chunks — do not inline into the app entry bundle.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Metro's package-exports resolver cannot handle @babel/runtime's fallback-array
// "exports" map (7.29.x), so it fails to resolve helpers like
// "@babel/runtime/helpers/interopRequireDefault". Resolve those via Node's
// classic resolver instead. Scoped to @babel/runtime so package exports stay
// enabled for every other dependency.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@babel/runtime' || moduleName.startsWith('@babel/runtime/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [__dirname] }),
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
