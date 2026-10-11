import type base from '../../messages/es-AR.json';
import type registry from '../../messages/registry.es-AR.json';

type Messages = typeof base & typeof registry;

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es-AR';
    Messages: Messages;
  }
}
