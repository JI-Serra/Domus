import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { JoinForm } from '@/components/join/join-form';
import { MyJoinRequests } from '@/components/join/my-requests';
import { PageHeader } from '@/components/shell/page-header';
import { listMyJoinRequests } from '@/lib/household/join-rpc';
import { createRequestClient } from '@/lib/supabase/request-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('join');
  return { title: t('metaTitle') };
}

/**
 * Join a unit with its code (D22). Open to anybody signed in, with or without a membership: the account layout shows
 * the shell when there is a context and a bare frame otherwise. Requests wait for the holder's approval.
 */
export default async function JoinPage() {
  const t = await getTranslations('join');
  const requests = await listMyJoinRequests(await createRequestClient());
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <JoinForm />
        <MyJoinRequests requests={requests} />
      </div>
    </>
  );
}
