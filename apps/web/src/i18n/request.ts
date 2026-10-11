import { DEFAULT_TENANT_TIME_ZONE, DISPLAY_LOCALE } from '@domus/domain/format';
import { getRequestConfig } from 'next-intl/server';
import accessPolicyMessages from '../../messages/access-policy.es-AR.json';
import registryMessages from '../../messages/registry.es-AR.json';

/**
 * es-AR is the only locale (M00-F08), so there is no locale routing: every request resolves to the same
 * messages. The fallback time zone is the default tenant zone; tenant-specific zones are passed explicitly to the
 * `@domus/domain/format` helpers.
 */
export default getRequestConfig(async () => ({
  locale: DISPLAY_LOCALE,
  timeZone: DEFAULT_TENANT_TIME_ZONE,
  // The admin registry area (M02) keeps its texts in its own file; the top-level keys never overlap.
  messages: {
    ...(await import('../../messages/es-AR.json')).default,
    ...registryMessages,
    ...accessPolicyMessages,
  },
}));
