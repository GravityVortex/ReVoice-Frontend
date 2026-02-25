const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const nextPlugin = require('@next/eslint-plugin-next');

// Minimal, production-friendly lint setup:
// - Keep rules small (avoid noisy repo-wide refactors).
// - Enable Next.js core-web-vitals rules (catch real foot-guns).
// - Parse TypeScript so ESLint can run at all under ESLint v9+ (flat config).
module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next.*',
      '**/.next.*/**',
      '**/.next.build/**',
      '**/.next.codex/**',
      '**/.next.dev*/**',
      '**/.next.local/**',
      '**/.source/**',
      '**/.source.gen/**',
      '**/.source.local/**',
      '**/.source.next/**',
      '**/dist/**',
      // Config/build-time files: not user-land code, and they legitimately use Node globals.
      'eslint.config.*',
      'next.config.*',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  eslint.configs.recommended,
  tseslint.configs.base,
  tseslint.configs.eslintRecommended,
  nextPlugin.configs['core-web-vitals'],
  {
    rules: {
      // Style-only; keep as warning to avoid repo-wide churn.
      'prefer-const': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // Prefer the TypeScript-aware version (warn-only to avoid repo-wide churn).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  }
);
