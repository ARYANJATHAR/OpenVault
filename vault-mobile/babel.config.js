module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required by react-native-reanimated (can crash standalone builds if missing)
      'react-native-reanimated/plugin',
    ],
  };
};
