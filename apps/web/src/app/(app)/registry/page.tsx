import { notFound, redirect } from 'next/navigation';
import {
  firstAllowedChild,
  getRegistryNavigation,
} from '@/components/shell/navigation';
import { getAdminPermissions } from '@/lib/registry/permissions';

/** `/registry` leads to the first Padrón destination the administrator may open. */
export default async function RegistryIndexPage() {
  const target = firstAllowedChild(
    getRegistryNavigation(),
    await getAdminPermissions(),
  );
  if (!target) notFound();
  redirect(target.href);
}
