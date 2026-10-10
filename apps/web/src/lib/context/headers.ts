/**
 * Request headers the proxy sets from the *validated* active context so `@domus/observability` can attach tenant
 * context to server errors (see README "Error reporting"). They are informational: the proxy strips any value a
 * client sends, and authorization never reads them.
 */
export const TENANT_ID_HEADER = 'x-domus-tenant-id';
export const MEMBERSHIP_ROLE_HEADER = 'x-domus-membership-role';
