'use server';

import {
  billableCriteriaFormSchema,
  fieldErrors,
  firstAdminFormSchema,
  isLogoMimeType,
  logoObjectPath,
  logoProblem,
  tenantDetailsSchema,
  tenantFormSchema,
} from '@domus/domain/platform';
import { tenantSubscriptionStatusSchema } from '@domus/domain/tenant/subscription-status';
import {
  createTenant,
  revokeInvitation,
  sendInvitation,
} from '@domus/supabase/platform';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { reportError } from '@domus/observability';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { functionErrorCode } from '@/lib/platform/function-errors';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { getPlatformClient } from '@/lib/platform/guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_FIELDS = [
  'tenant_name',
  'tenant_slug',
  'tenant_address',
  'tenant_time_zone',
  'tenant_subscription_status',
  'client_event_id',
] as const;

const detailPath = (tenantId: string) => `/platform/tenants/${tenantId}`;

function uploadedLogo(formData: FormData): File | null {
  const value = formData.get('logo');
  return value instanceof File && value.size > 0 ? value : null;
}

/** Uploads the logo to the private bucket and records its path. Returns false when either step failed. */
async function storeLogo(
  client: DomusSupabaseClient,
  tenantId: string,
  file: File,
): Promise<boolean> {
  if (!isLogoMimeType(file.type)) return false;
  const path = logoObjectPath(tenantId, file.type);
  const upload = await client.storage
    .from('tenant-logo')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upload.error) {
    reportError(new Error('Logo upload failed'), {
      operation: 'tenant.logo.upload',
    });
    return false;
  }
  const update = await client
    .from('tenant')
    .update({ tenant_logo_path: path })
    .eq('tenant_id', tenantId);
  if (update.error) {
    reportError(new Error(`Logo path update failed (${update.error.code})`), {
      operation: 'tenant.logo.path',
    });
    return false;
  }
  return true;
}

/** M01-F01: creates the barrio, then uploads its logo into the tenant's folder of the private bucket. */
export async function createTenantAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, TENANT_FIELDS);
  const client = await getPlatformClient();
  if (!client) return formError('denied', values);

  const parsed = tenantFormSchema.safeParse(values);
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  const logo = uploadedLogo(formData);
  const problem = logo ? logoProblem(logo) : null;
  if (problem) errors.logo = problem;
  if (!UUID.test(values.client_event_id ?? '')) errors.form = 'unknown';
  if (!parsed.success || problem || errors.form)
    return errors.form
      ? formError('unknown', values)
      : fieldError(errors, values);

  const { data: tenantId, error } = await createTenant(client, {
    tenant_name: parsed.data.tenant_name,
    tenant_slug: parsed.data.tenant_slug,
    tenant_address: parsed.data.tenant_address ?? undefined,
    tenant_time_zone: parsed.data.tenant_time_zone,
    tenant_subscription_status: parsed.data.tenant_subscription_status,
    client_event_id: values.client_event_id ?? '',
  });
  if (error || !tenantId) {
    if (error?.code === '23505')
      return fieldError({ tenant_slug: 'slugTaken' }, values);
    if (error?.code === '42501') return formError('denied', values);
    if (error?.code === '22023') return formError('invalid', values);
    reportError(
      new Error(`Tenant creation failed (${error?.code ?? 'no id'})`),
      {
        operation: 'tenant.create',
      },
    );
    return formError('unknown', values);
  }

  const logoStored = logo ? await storeLogo(client, tenantId, logo) : true;
  redirect(`${detailPath(tenantId)}${logoStored ? '' : '?notice=logoFailed'}`);
}

/** Edits the barrio's data (name, address, time zone) and replaces its logo when a new file is chosen. */
export async function updateTenantAction(
  tenantId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, TENANT_FIELDS);
  const client = await getPlatformClient();
  if (!client || !UUID.test(tenantId)) return formError('denied', values);

  const parsed = tenantDetailsSchema.safeParse(values);
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  const logo = uploadedLogo(formData);
  const problem = logo ? logoProblem(logo) : null;
  if (problem) errors.logo = problem;
  if (!parsed.success || problem) return fieldError(errors, values);

  const { data, error } = await client
    .from('tenant')
    .update(parsed.data)
    .eq('tenant_id', tenantId)
    .select('tenant_id');
  if (error || !data?.length) {
    if (error)
      reportError(new Error(`Tenant update failed (${error.code})`), {
        operation: 'tenant.update',
      });
    return formError(
      error?.code === '42501' || !error ? 'denied' : 'unknown',
      values,
    );
  }
  if (logo && !(await storeLogo(client, tenantId, logo)))
    return fieldError({ logo: 'logoUploadFailed' }, values);

  revalidatePath(detailPath(tenantId));
  return { status: 'success', notice: 'saved' };
}

/**
 * Changes the subscription status (M01-F02). The effect is confirmed in the UI first; the database RPC is the
 * control (MFA platform admin only) and keeps the slug as it is.
 */
export async function changeSubscriptionAction(
  tenantId: string,
  status: string,
): Promise<PlatformFormState> {
  const client = await getPlatformClient();
  const parsed = tenantSubscriptionStatusSchema.safeParse(status);
  if (!client || !UUID.test(tenantId) || !parsed.success)
    return formError('denied');

  const current = await client
    .from('tenant')
    .select('tenant_slug')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (current.error || !current.data) return formError('denied');

  const { error } = await client.rpc('update_tenant_platform_settings', {
    target_tenant_id: tenantId,
    new_slug: current.data.tenant_slug,
    new_subscription_status: parsed.data,
  });
  if (error) {
    if (error.code !== '42501')
      reportError(new Error(`Subscription change failed (${error.code})`), {
        operation: 'tenant.subscription',
      });
    return formError(error.code === '42501' ? 'denied' : 'unknown');
  }
  revalidatePath(detailPath(tenantId));
  revalidatePath('/platform/tenants');
  return { status: 'success', notice: 'statusChanged' };
}

/** D20: which unit statuses count as billable. The count is computed by `billable_unit_count`. */
export async function saveBillableCriteriaAction(
  tenantId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const client = await getPlatformClient();
  if (!client || !UUID.test(tenantId)) return formError('denied');

  const selected = formData
    .getAll('unit_status')
    .filter((value): value is string => typeof value === 'string');
  const parsed = billableCriteriaFormSchema.safeParse(selected);
  if (!parsed.success) return formError('billableRequired');

  const { data, error } = await client
    .from('tenant')
    .update({ tenant_billable_unit_statuses: parsed.data })
    .eq('tenant_id', tenantId)
    .select('tenant_id');
  if (error || !data?.length) {
    if (error)
      reportError(new Error(`Billable criteria failed (${error.code})`), {
        operation: 'tenant.billable',
      });
    return formError(error?.code === '42501' || !error ? 'denied' : 'unknown');
  }
  revalidatePath(detailPath(tenantId));
  return { status: 'success', notice: 'saved' };
}

const INVITATION_FIELDS = [
  'invited_email',
  'first_name',
  'last_name',
  'client_event_id',
] as const;

/** M01-F01: invites the barrio's first administrator by email through the `send-invitation` Edge Function. */
export async function inviteAdminAction(
  tenantId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, INVITATION_FIELDS);
  const client = await getPlatformClient();
  if (!client || !UUID.test(tenantId)) return formError('denied', values);

  const parsed = firstAdminFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (!UUID.test(values.client_event_id ?? ''))
    return formError('unknown', values);

  const { error } = await sendInvitation(client, {
    target_tenant_id: tenantId,
    invited_email: parsed.data.invited_email,
    target_role: 'tenant_admin',
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    client_event_id: values.client_event_id ?? '',
  });
  if (error) {
    const code = await functionErrorCode(error);
    if (code === 'delivery_failed') return formError('deliveryFailed', values);
    if (code === 'forbidden' || code === 'unauthorized')
      return formError('denied', values);
    if (code === 'invalid_input') return formError('invalid', values);
    reportError(new Error(`Invitation failed (${code})`), {
      operation: 'invitation.send',
    });
    return formError('unknown', values);
  }
  revalidatePath(detailPath(tenantId));
  return { status: 'success', notice: 'invited' };
}

export async function revokeInvitationAction(
  tenantId: string,
  invitationId: string,
): Promise<PlatformFormState> {
  const client = await getPlatformClient();
  if (!client || !UUID.test(tenantId) || !UUID.test(invitationId))
    return formError('denied');
  const { error } = await revokeInvitation(client, invitationId);
  if (error) {
    if (error.code !== '42501')
      reportError(new Error(`Invitation revoke failed (${error.code})`), {
        operation: 'invitation.revoke',
      });
    return formError(error.code === '42501' ? 'denied' : 'unknown');
  }
  revalidatePath(detailPath(tenantId));
  return { status: 'success', notice: 'revoked' };
}
