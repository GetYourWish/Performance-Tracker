// Purity enforcement for @performance-tracker/core.
// The package must run identically under Node (Electron/Vitest) and
// Hermes/React Native (Jest + jest-expo). Anything platform-specific is
// forbidden here — it belongs in the apps or in the allowed dependencies.
const globals = require('globals')

const FORBIDDEN_IMPORTS = {
  paths: {
    // Node builtins & runtime
    fs: 'core must not import Node builtins',
    path: 'core must not import Node builtins',
    os: 'core must not import Node builtins',
    util: 'core must not import Node builtins',
    crypto: 'core must not import Node builtins (use the uuid dependency)',
    child_process: 'core must not import Node builtins',
    http: 'core must not import Node builtins',
    https: 'core must not import Node builtins',
    net: 'core must not import Node builtins',
    url: 'core must not import Node builtins',
    stream: 'core must not import Node builtins',
    zlib: 'core must not import Node builtins',
    electron: 'core must not import Electron',
    // UI / platform frameworks
    react: 'core must not import React',
    'react-dom': 'core must not import React DOM',
    'react-native': 'core must not import React Native',
    expo: 'core must not import Expo',
    'expo-file-system': 'core must not import Expo modules',
    '@dnd-kit/core': 'core must not import UI libraries',
    recharts: 'core must not import UI libraries',
    'framer-motion': 'core must not import UI libraries',
    'html-to-image': 'core must not import UI libraries'
  },
  patterns: [
    {
      group: ['node:*'],
      message: 'core must not import Node builtins'
    },
    {
      group: ['electron/**', 'react-native/**', 'expo/**', '@expo/**'],
      message: 'core must not import platform frameworks'
    }
  ]
}

const FORBIDDEN_GLOBALS = [
  { name: 'process', message: 'core must not read process (env/platform detection)' },
  { name: 'Buffer', message: 'core must not use Buffer' },
  { name: 'window', message: 'core must not touch the DOM/window' },
  { name: 'document', message: 'core must not touch the DOM' },
  { name: 'navigator', message: 'core must not touch navigator' },
  { name: 'fetch', message: 'core must not perform network I/O' },
  { name: 'localStorage', message: 'core must not touch storage' }
]

module.exports = [
  {
    ignores: ['node_modules/**', '__fixtures__/**', 'coverage/**']
  },
  {
    files: ['index.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.commonjs
      }
    },
    rules: {
      'no-restricted-imports': ['error', FORBIDDEN_IMPORTS],
      'no-restricted-globals': ['error', FORBIDDEN_GLOBALS],
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // Test tooling (this folder) runs in Node and MAY use fs/path to load
    // fixtures — the purity contract applies to shipped package code only.
    files: ['tests/**/*.js', 'tests/**/*.cjs', 'scripts/**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.commonjs,
        ...globals.node
      }
    },
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off'
    }
  }
]
