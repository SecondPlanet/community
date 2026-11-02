/**
 * ESLint v9 flat config — SecondPlanet API
 *
 * v9 必须用 flat config(legacy .eslintrc.* 已被废弃)
 * 规则集:TypeScript 推荐 + 实用规则
 */
import tsplugin from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsplugin,
    },
    rules: {
      // TypeScript 项目里 `any` 历史包袱太多, 不强制
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 基础推荐规则
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'warn',
      'no-undef': 'off', // TS 自己查
      'no-unused-vars': 'off', // 交给 TS plugin
    },
  },
];
