// Babel config for the Performance Tracker Android app.
// The worklets plugin (reanimated 4 ships it as react-native-worklets/plugin,
// older reanimated 3 as react-native-reanimated/plugin) MUST be listed last.
let workletsPlugin
try {
  workletsPlugin = require.resolve('react-native-worklets/plugin')
} catch (e) {
  workletsPlugin = 'react-native-reanimated/plugin'
}

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [workletsPlugin]
  }
}
