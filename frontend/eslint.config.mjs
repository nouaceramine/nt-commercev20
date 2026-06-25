// ESLint flat config for nt-commerce frontend
// Catches the bugs we just hit (undefined JSX components like `<History />`),
// while not failing the build on existing exhaustive-deps / unused-import warnings.
import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'public/**',
      'coverage/**',
      'src/components/ui/**',  // shadcn primitives, generated
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        process: 'readonly',
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ── Errors we want to BLOCK in CI ──
      'no-undef': 'error',                  // catches `<History />` when not imported
      'react/jsx-no-undef': 'error',        // same, JSX-aware
      'react/jsx-uses-react': 'off',        // React 17+ JSX transform
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-vars': 'error',       // counts imported components as "used"
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',

      // ── Allow during transition (warnings only) ──
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-empty-pattern': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',  // huge backlog, addressed separately

      // Project preferences
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
];
