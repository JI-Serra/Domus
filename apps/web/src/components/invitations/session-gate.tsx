'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { establishInvitationSessionAction } from '@/app/(auth)/invitations/accept/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { parseAuthHash } from '@/lib/invitations/hash';

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};

/**
 * The email link ends at this page with the new session (or an error) in the URL fragment, which only the browser
 * can read. While a session is in the fragment this stores it through a Server Action (which redirects to the same
 * page without the fragment); otherwise the page is shown as is.
 */
export function InvitationSessionGate({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const t = useTranslations('invitations.accept');
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  const result = parseAuthHash(hash);
  const [rejected, setRejected] = useState<string | null>(null);

  const accessToken =
    result.kind === 'session' ? result.session.accessToken : null;
  const refreshToken =
    result.kind === 'session' ? result.session.refreshToken : null;
  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    let cancelled = false;
    void establishInvitationSessionAction(
      accessToken,
      refreshToken,
      token,
    ).then(() => {
      // Only a failure returns here (success redirects): drop the fragment so the page shows its own state.
      if (!cancelled) {
        setRejected(accessToken);
        history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshToken, token]);

  if (accessToken && rejected !== accessToken)
    return (
      <p role="status" className="text-text-secondary">
        {t('verifying')}
      </p>
    );
  if (result.kind === 'error' || rejected)
    return <AuthNotice tone="error">{t('errors.sessionExpired')}</AuthNotice>;
  return children;
}
