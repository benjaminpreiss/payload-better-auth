// @ts-check

import payloadEsLintConfig from '@payloadcms/eslint-config'

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*', // ignore all dotfiles
  '**/.git',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/vitest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/*.d.ts', // ignore declaration files
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
]

export default [
  {
    ignores: defaultESLintIgnores,
  },
  ...payloadEsLintConfig,
  {
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  // Config for ./src files - uses root tsconfig.json
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Config for ./dev files - uses dev/tsconfig.json
  {
    files: ['dev/**/*.ts', 'dev/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        project: './dev/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
