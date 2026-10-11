import { isInvitationToken } from '@domus/domain/platform';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AcceptInvitationForm } from '@/components/invitations/accept-form';
import { InvitationSessionGate } from '@/components/invitations/session-gate';
import { Button, ButtonLink } from '@/components/ui/button';
import { loginUrlFor } from '@/lib/auth/redirect';
import { getRequestIdentity } from '@/lib/context/request-context';
import { previewInvitation } from '@/lib/invitations/preview';
import { createRequestClient } from '@/lib/supabase/request-client';
import { switchAccountAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invitations.accept');
  return { title: t('metaTitle') };
}

/** One uniform answer for every invitation that cannot be used, so the page never reveals why (no enumeration). */
async function Unavailable({
  token,
  signedIn,
}: {
  token: string | null;
  signedIn: boolean;
}) {
  const t = await getTranslations('invitations.accept.unavailable');
  return (
    <div className="flex flex-col gap-5">
      <AuthNotice tone="error" title={t('title')}>
        {t('description')}
      </AuthNotice>
      {signedIn ? (
        <form action={switchAccountAction}>
          <input type="hidden" name="token" value={token ?? ''} />
          <Button type="submit" variant="secondary" className="w-full">
            {t('otherAccount')}
          </Button>
        </form>
      ) : null}
      <ButtonLink href="/" variant={signedIn ? 'ghost' : 'primary'}>
        {t('home')}
      </ButtonLink>
    </div>
  );
}

/**
 * Landing page of the invitation email. Public on purpose: the visitor arrives from the email link possibly without a
 * session (the gate stores the one the link carries). Signed out → sign in; signed in → confirm what they join and
 * accept. Every unusable invitation looks the same.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const t = await getTranslations('invitations.accept');
  const roles = await getTranslations('roles');
  const { token } = await searchParams;
  const valid = typeof token === 'string' && isInvitationToken(token);
  const identity = await getRequestIdentity();

  let content;
  if (!valid) {
    content = <Unavailable token={null} signedIn={identity !== null} />;
  } else if (!identity) {
    content = (
      <div className="flex flex-col gap-5">
        <p className="text-app-body">{t('signIn.title')}</p>
        <ButtonLink
          href={loginUrlFor(
            `/invitations/accept?token=${encodeURIComponent(token)}`,
          )}
        >
          {t('signIn.action')}
        </ButtonLink>
      </div>
    );
  } else {
    const preview = await previewInvitation(await createRequestClient(), token);
    content = preview ? (
      <AcceptInvitationForm
        token={token}
        tenantName={preview.tenantName}
        roleLabel={roles(preview.role)}
        role={preview.role}
      />
    ) : (
      <Unavailable token={token} signedIn />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-app-title">{t('title')}</h1>
      {valid ? (
        <InvitationSessionGate token={token}>{content}</InvitationSessionGate>
      ) : (
        content
      )}
    </div>
  );
}
