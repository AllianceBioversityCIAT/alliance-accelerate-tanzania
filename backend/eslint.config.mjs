// ESLint 9 flat config — added by R-3 follow-up (archived admin/actor-crud-audit
// validation-report §10): the `lint` script predates ESLint 9 but no config was
// ever committed, so `npm run lint` failed to start. Non-type-aware on purpose:
// fast, and independent of tsconfig include lists.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.aws-sam/**'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Nest relies on emitted decorator metadata; parameter properties and
      // injection tokens trip these two in their strictest form.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
