import {
  BookOpen,
  Building2,
  CircleUser,
  ClipboardList,
  DoorOpen,
  FileUp,
  House,
  KeyRound,
  LifeBuoy,
  MapPin,
  Megaphone,
  Package,
  Settings,
  ShieldCheck,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminPermission } from '@/lib/registry/permissions';
import type { MembershipRole } from './active-context';

export type NavItemId =
  | 'home'
  | 'access'
  | 'neighborhood'
  | 'account'
  | 'registry'
  | 'registryUnits'
  | 'registryImport'
  | 'registryGuards'
  | 'registryGates'
  | 'announcements'
  | 'finance'
  | 'settings'
  | 'present'
  | 'guardLog'
  | 'packages'
  | 'tenants'
  | 'support';

export interface NavItem {
  id: NavItemId;
  href: string;
  icon: LucideIcon;
  /** Shown in the bottom tab bar on mobile. The bar holds 4–5 destinations (DESIGN.md §A.6). */
  tab: boolean;
  /** Administrative permissions that open this entry: any one of them is enough. Omitted = no permission needed. */
  permissions?: readonly AdminPermission[];
  /** Second-level destinations, listed under the entry in the sidebar and as a strip on small screens. */
  children?: readonly NavItem[];
}

const item = (
  id: NavItemId,
  href: string,
  icon: LucideIcon,
  tab = true,
  extra: Pick<NavItem, 'permissions' | 'children'> = {},
): NavItem => ({
  id,
  href,
  icon,
  tab,
  ...extra,
});

/** Padrón: its destinations are gated by the administrator's permissions (`registry`, `guards`). */
const registry = item('registry', '/registry', ClipboardList, true, {
  permissions: ['registry', 'guards'],
  children: [
    item('registryUnits', '/registry/units', Building2, false, {
      permissions: ['registry'],
    }),
    item('registryImport', '/registry/import', FileUp, false, {
      permissions: ['registry'],
    }),
    item('registryGuards', '/registry/guards', ShieldCheck, false, {
      permissions: ['registry'],
    }),
    item('registryGates', '/registry/gates', DoorOpen, false, {
      permissions: ['guards'],
    }),
  ],
});

const home = item('home', '/', House);

/** Placeholder navigation per role. Each href renders the "coming soon" page until its module is built. */
const NAVIGATION: Record<MembershipRole, readonly NavItem[]> = {
  // Resident tab bar: Inicio · Accesos · Barrio · Cuenta (DESIGN.md §A.6).
  unit_holder: [
    home,
    item('access', '/access', KeyRound),
    item('neighborhood', '/neighborhood', MapPin),
    item('account', '/account', CircleUser),
  ],
  household_member: [
    home,
    item('access', '/access', KeyRound),
    item('neighborhood', '/neighborhood', MapPin),
    item('account', '/account', CircleUser),
  ],
  tenant_admin: [
    home,
    registry,
    item('access', '/access', KeyRound),
    item('announcements', '/announcements', Megaphone),
    item('finance', '/finance', Wallet),
    item('settings', '/settings', Settings, false),
  ],
  guard: [
    home,
    item('present', '/present', UsersRound),
    item('guardLog', '/guard-log', BookOpen),
    item('packages', '/packages', Package),
  ],
  // The platform area (`/platform/**`) has its own navigation and no tenant home.
  platform_admin: [
    item('tenants', '/platform/tenants', Building2),
    item('support', '/platform/support', LifeBuoy),
  ],
};

export function getNavigation(role: MembershipRole): readonly NavItem[] {
  return NAVIGATION[role];
}

export function getTabBarItems(role: MembershipRole): readonly NavItem[] {
  return NAVIGATION[role].filter((entry) => entry.tab);
}

const isAllowed = (entry: NavItem, held: readonly AdminPermission[]): boolean =>
  !entry.permissions ||
  entry.permissions.some((permission) => held.includes(permission));

/**
 * The destinations an administrator may open: entries (and their children) whose permissions they hold. The
 * interface only offers what the database would also allow; it is never the control.
 */
export function filterByPermissions(
  entries: readonly NavItem[],
  held: readonly AdminPermission[],
): NavItem[] {
  return entries
    .filter((entry) => isAllowed(entry, held))
    .map((entry) =>
      entry.children
        ? { ...entry, children: filterByPermissions(entry.children, held) }
        : entry,
    );
}

/** First destination under a parent that the permissions allow (where `/registry` itself leads). */
export function firstAllowedChild(
  parent: NavItem | undefined,
  held: readonly AdminPermission[],
): NavItem | undefined {
  return parent?.children?.find((child) => isAllowed(child, held));
}

export function getRegistryNavigation(): NavItem {
  return registry;
}

/** Every top-level tenant-area href across roles, used to pre-render the placeholder pages. */
export function getPlaceholderSlugs(): string[] {
  const slugs = new Set<string>();
  for (const entries of Object.values(NAVIGATION)) {
    for (const entry of entries)
      if (entry.href !== '/' && entry.href.split('/').length === 2)
        slugs.add(entry.href.slice(1));
  }
  return [...slugs];
}

/** Home of the area the role works in: the tenant home, or the platform area for platform admins. */
export function getHomeHref(role: MembershipRole): string {
  return role === 'platform_admin' ? '/platform' : '/';
}

export function getNavItemBySlug(slug: string): NavItem | undefined {
  for (const entries of Object.values(NAVIGATION)) {
    const found = entries.find((entry) => entry.href === `/${slug}`);
    if (found) return found;
  }
  return undefined;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
