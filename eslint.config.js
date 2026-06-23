import js from '@eslint/js';
import globals from 'globals';

/** Config plate ESLint v9 : navigateur pour le client, Node pour le serveur. */
export default [
  { ignores: ['**/node_modules/**', '**/dist/**'] },

  js.configs.recommended,

  // Code client (Three.js, DOM, WebSocket navigateur)
  {
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2023 },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
    },
  },

  // Code serveur (Node)
  {
    files: ['server/**/*.js', '*.js', 'bench/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
    },
  },
];
