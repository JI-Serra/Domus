import shared from '@domus/config/eslint';
import next from 'eslint-config-next/core-web-vitals';

const config = [
  ...shared,
  ...next,
  {
    // User-facing text lives in messages/es-AR.json, never in components (AGENTS.md "Language").
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    rules: { 'react/jsx-no-literals': ['error', { noStrings: false }] },
  },
];
export default config;
