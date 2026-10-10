import { z } from 'zod';

// PostgreSQL accepts UUIDs without imposing an RFC version/variant.
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const adminPermissionSchema = z.enum([
  'registry',
  'access_config',
  'access_audit',
  'communication',
  'complaints',
  'amenities',
  'finance',
  'guards',
  'tenant_settings',
  'admin_management',
]);
export const membershipRoleSchema = z.enum([
  'tenant_admin',
  'guard',
  'unit_holder',
  'household_member',
]);
export const billableUnitStatusesSchema = z
  .array(z.enum(['occupied', 'under_construction', 'vacant']))
  .min(1)
  .max(3)
  .refine((values) => new Set(values).size === values.length);
export const createTenantSchema = z.object({
  tenant_name: z.string().trim().min(1).max(200),
  tenant_slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(100),
  tenant_address: z.string().trim().max(500).nullable().optional(),
  tenant_time_zone: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('es-AR', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    })
    .default('America/Argentina/Tucuman'),
  tenant_subscription_status: z
    .enum(['pilot', 'active', 'suspended', 'cancelled'])
    .default('pilot'),
  tenant_logo_path: z.string().max(1024).nullable().optional(),
  client_event_id: uuidSchema,
});
export const sendInvitationSchema = z
  .object({
    target_tenant_id: uuidSchema,
    invited_email: z.email().transform((value) => value.trim().toLowerCase()),
    target_role: membershipRoleSchema,
    target_person_id: uuidSchema.nullable().optional(),
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    admin_permissions: z.array(adminPermissionSchema).max(10).default([]),
    client_event_id: uuidSchema,
  })
  .refine((value) =>
    Boolean(value.target_person_id || (value.first_name && value.last_name)),
  )
  .refine(
    (value) =>
      value.target_role === 'tenant_admin' ||
      value.admin_permissions.length === 0,
  );
export const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const startSupportSessionSchema = z.object({
  target_tenant_id: uuidSchema,
  target_user_id: uuidSchema,
  reason: z.string().trim().min(1).max(500),
  duration_minutes: z.number().int().min(1).max(60).default(30),
  client_event_id: uuidSchema,
});
export const endSupportSessionSchema = z.object({
  target_support_session_id: uuidSchema,
});

export * from './tenant-form';
export * from './invitation';
export * from './support';
