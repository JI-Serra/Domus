import shared from '@domus/config/eslint';
import next from 'eslint-config-next/core-web-vitals';

const config = [...shared, ...next];
export default config;
