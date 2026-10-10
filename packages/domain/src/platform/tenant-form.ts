import { z } from 'zod';
import { DEFAULT_TENANT_TIME_ZONE } from '../format/constants';
import { tenantSubscriptionStatusSchema } from '../tenant/subscription-status';

/**
 * Time zones offered when creating or editing a barrio. Every barrio is in Argentina (spec §8.6); Tucumán is the
 * default. The database stores any IANA name, so a barrio configured otherwise is still shown (see
 * {@link timeZoneOptions}).
 */
export const ARGENTINA_TIME_ZONES = [
  'America/Argentina/Tucuman',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Catamarca',
  'America/Argentina/Cordoba',
  'America/Argentina/Jujuy',
  'America/Argentina/La_Rioja',
  'America/Argentina/Mendoza',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Salta',
  'America/Argentina/San_Juan',
  'America/Argentina/San_Luis',
  'America/Argentina/Ushuaia',
] as const;

/** The selectable zones, with the current value kept in the list when it is not one of the usual ones. */
export function timeZoneOptions(current?: string | null): string[] {
  const zones: string[] = [...ARGENTINA_TIME_ZONES];
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

/** Largest logo the private bucket accepts (2 MiB) and the formats it allows. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number];

const LOGO_EXTENSIONS: Record<LogoMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export type LogoProblem = 'logoType' | 'logoSize';

export function isLogoMimeType(type: string): type is LogoMimeType {
  return (LOGO_MIME_TYPES as readonly string[]).includes(type);
}

/** Checks a chosen logo file before it is uploaded; null when it is acceptable. */
export function logoProblem(file: {
  type: string;
  size: number;
}): LogoProblem | null {
  if (!isLogoMimeType(file.type)) return 'logoType';
  if (file.size > LOGO_MAX_BYTES || file.size === 0) return 'logoSize';
  return null;
}

/** Object name inside the tenant folder of the private `tenant-logo` bucket; the extension follows the type. */
export function logoObjectPath(tenantId: string, type: LogoMimeType): string {
  return `${tenantId}/logo.${LOGO_EXTENSIONS[type]}`;
}

/** URL slug suggested from a barrio name: lowercase ASCII words joined by hyphens, at most 100 characters. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
}

const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'timeZoneInvalid');

const blankToNull = (value: string | null | undefined) =>
  value === undefined || value === null || value.trim() === ''
    ? null
    : value.trim();

/** Messages are keys under `platform.tenants.errors` in the es-AR file: the schema decides, the UI words it. */
export const tenantDetailsSchema = z.object({
  tenant_name: z.string().trim().min(1, 'nameRequired').max(200, 'nameTooLong'),
  tenant_address: z
    .string()
    .trim()
    .max(500, 'addressTooLong')
    .nullish()
    .transform(blankToNull),
  tenant_time_zone: timeZoneSchema.default(DEFAULT_TENANT_TIME_ZONE),
});

export const tenantFormSchema = tenantDetailsSchema.extend({
  tenant_slug: z
    .string()
    .trim()
    .min(1, 'slugRequired')
    .max(100, 'slugInvalid')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slugInvalid'),
  tenant_subscription_status: tenantSubscriptionStatusSchema.default('pilot'),
});
export type TenantFormInput = z.input<typeof tenantFormSchema>;
export type TenantFormValues = z.output<typeof tenantFormSchema>;

export const billableCriteriaFormSchema = z
  .array(z.enum(['occupied', 'under_construction', 'vacant']))
  .min(1, 'billableRequired')
  .refine(
    (values) => new Set(values).size === values.length,
    'billableRequired',
  );

/** Flattens a Zod error to `{ field: message-key }`, keeping the first problem of each field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}
