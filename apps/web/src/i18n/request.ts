import { DEFAULT_TENANT_TIME_ZONE, DISPLAY_LOCALE } from '@domus/domain/format';
import { getRequestConfig } from 'next-intl/server';

/**
 * es-AR is the only locale (M00-F08), so there is no locale routing: every request resolves to the same
 * messages. The fallback time zone is the default tenant zone; tenant-specific zones are passed explicitly to the
 * `@domus/domain/format` helpers.
 */
export default getRequestConfig(async () => ({
  locale: DISPLAY_LOCALE,
  timeZone: DEFAULT_TENANT_TIME_ZONE,
  messages: (await import('../../messages/es-AR.json')).default,
}));
