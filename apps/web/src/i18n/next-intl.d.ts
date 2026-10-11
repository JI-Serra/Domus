import type base from '../../messages/es-AR.json';
import type accessPolicy from '../../messages/access-policy.es-AR.json';
import type registry from '../../messages/registry.es-AR.json';

type Messages = typeof base & typeof registry & typeof accessPolicy;

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es-AR';
    Messages: Messages;
  }
}
