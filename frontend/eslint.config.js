import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  { files: ['src/**/*.{js,jsx}'], languageOptions: { globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }] } },
  { files: ['src/**/*.test.js'], languageOptions: { globals: globals.vitest } },
];
