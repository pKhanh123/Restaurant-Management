const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedNodeModules = fs.realpathSync(path.resolve(monorepoRoot, 'node_modules'));

const config = getDefaultConfig(projectRoot);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((extension) => extension !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

config.watchFolders = [...(config.watchFolders || []), sharedNodeModules];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  sharedNodeModules,
];

module.exports = config;
