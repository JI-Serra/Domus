import type messages from '../../messages/es-AR.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es-AR';
    Messages: typeof messages;
  }
}
