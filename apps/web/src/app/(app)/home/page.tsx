import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JoinCodeSection } from '@/components/household/join-code';
import { JoinRequestSection } from '@/components/household/join-requests';
import { DelegatedSections, OwnData } from '@/components/household/member-view';
import { MemberSection } from '@/components/household/members';
import { PetSection } from '@/components/household/pets';
import { VehicleSection } from '@/components/household/vehicles';
import { PageHeader } from '@/components/shell/page-header';
import { getHouseholdScope, loadHouseholdSheet } from '@/lib/household/scope';
import { buildHouseholdView } from '@/lib/household/view';
import type { HouseholdView } from '@/lib/household/view';
import type { DomusSupabaseClient } from '@domus/supabase/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('household');
  return { title: `${t('title')} · Domus` };
}

/** Short-lived signed URLs of the pets' photos (private bucket), keyed by pet id. */
async function petPhotoUrls(
  client: DomusSupabaseClient,
  pets: HouseholdView['pets'],
): Promise<Record<string, string>> {
  const withPhoto = pets.filter((pet) => pet.photoPath);
  if (withPhoto.length === 0) return {};
  const { data, error } = await client.storage
    .from('pet-photo')
    .createSignedUrls(
      withPhoto.map((pet) => pet.photoPath ?? ''),
      60 * 60,
    );
  if (error) return {};
  const urls: Record<string, string> = {};
  for (const [index, entry] of data.entries()) {
    const pet = withPhoto[index];
    if (pet && entry.signedUrl) urls[pet.petId] = entry.signedUrl;
  }
  return urls;
}

/**
 * "Mi hogar" (M02-F05). The holder manages members, delegations, vehicles, pets, join requests and the unit code;
 * a household member sees the household read-only plus only what the holder enabled for them. The unit sheet is the
 * database's own answer, so what is not granted never reaches this page.
 */
export default async function HouseholdPage() {
  const scope = await getHouseholdScope();
  if (!scope) notFound();
  const sheet = await loadHouseholdSheet(scope);
  if (!sheet) notFound();

  const t = await getTranslations('household');
  const view = buildHouseholdView(
    sheet,
    { membershipId: scope.membershipId, isHolder: scope.isHolder },
    new Date(),
  );
  const photoUrls = await petPhotoUrls(scope.client, view.pets);
  const own = view.members.find((member) => member.isSelf);

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid items-start gap-6 xl:grid-cols-6">
        {scope.isHolder ? (
          <div className="xl:col-span-6 empty:hidden">
            <JoinRequestSection requests={view.requests} />
          </div>
        ) : (
          <div className="xl:col-span-6">
            <DelegatedSections permissions={view.permissions} />
          </div>
        )}
        <div className="xl:col-span-4">
          <MemberSection members={view.members} canManage={scope.isHolder} />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-2">
          {scope.isHolder ? <JoinCodeSection /> : null}
          {!scope.isHolder && own ? <OwnData member={own} /> : null}
        </div>
        <div className="xl:col-span-3">
          <VehicleSection vehicles={view.vehicles} canManage={scope.isHolder} />
        </div>
        <div className="xl:col-span-3">
          <PetSection
            pets={view.pets}
            photoUrls={photoUrls}
            canManage={scope.isHolder}
            tenantId={view.tenantId}
            unitId={view.unitId}
          />
        </div>
      </div>
    </>
  );
}
