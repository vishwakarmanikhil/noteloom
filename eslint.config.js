import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

// jsx-a11y recommended, every rule forced to `warn` — these flag real
// accessibility work (focus management on custom option/menu roles, captions,
// autofocus) that belongs in its own pass, not a tooling-setup commit.
const jsxA11yWarnings = Object.fromEntries(
  Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn']),
);

// Phase 0 of docs/repackaging-plan.md: get a linter in place at all. Rules
// are deliberately conservative — real-bug rules stay as errors, everything
// stylistic or aspirational is `warn` so `npm run lint` passes in CI today
// without forcing a cleanup. The import-boundary rules that matter (core must
// not import react; feature packages must not import each other) land in
// Phase 1/2, once src/ is actually split into those layers.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '**/dist/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    linterOptions: {
      // The tree already carries inline eslint-disable comments from an
      // earlier intended setup; flag stale ones but don't fail on them yet.
      reportUnusedDisableDirectives: 'warn',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...jsxA11yWarnings,

      // React hooks: the two classic rules only (not plugin v7's expanded
      // set, which flags a lot of existing intentional patterns).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-irregular-whitespace': 'warn',
      'no-console': 'off',

      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',
      'react/no-unescaped-entities': 'off',

      'import/order': 'off', // 100+ hits; not worth the churn in Phase 0
    },
  },

  {
    files: ['test/**/*.{js,jsx}', 'test-e2e/**/*.{js,jsx}', '**/*.config.js', 'tools/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  prettier,
];
