import { expect, it } from 'vitest';
import { createSupportClient } from './platform';

it('keeps support tokens out of normal Auth session and credential APIs', () => {
  const client = createSupportClient(
    'http://127.0.0.1:54321',
    'public-key',
    'support-token',
  );
  expect(() => client.auth.getUser()).toThrow('accessToken');
});
