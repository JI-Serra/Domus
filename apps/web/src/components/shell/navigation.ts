import {
  BookOpen,
  Building2,
  CircleUser,
  ClipboardList,
  House,
  HousePlus,
  KeyRound,
  LifeBuoy,
  MapPin,
  Megaphone,
  Package,
  Settings,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MembershipRole } from './active-context';

export type NavItemId =
  | 'home'
  | 'household'
  | 'access'
  | 'neighborhood'
  | 'account'
  | 'registry'
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
}

const item = (
  id: NavItemId,
  href: string,
  icon: LucideIcon,
  tab = true,
): NavItem => ({
  id,
  href,
  icon,
  tab,
});

const home = item('home', '/', House);
/** "Mi hogar": members, vehicles, pets and delegations of the resident's unit (M02-F05). */
const household = item('household', '/home', HousePlus);

/** Placeholder navigation per role. Each href renders the "coming soon" page until its module is built. */
const NAVIGATION: Record<MembershipRole, readonly NavItem[]> = {
  // Resident tab bar: Inicio · Mi hogar · Accesos · Barrio · Cuenta (DESIGN.md §A.6).
  unit_holder: [
    home,
    household,
    item('access', '/access', KeyRound),
    item('neighborhood', '/neighborhood', MapPin),
    item('account', '/account', CircleUser),
  ],
  household_member: [
    home,
    household,
    item('access', '/access', KeyRound),
    item('neighborhood', '/neighborhood', MapPin),
    item('account', '/account', CircleUser),
  ],
  tenant_admin: [
    home,
    item('registry', '/registry', ClipboardList),
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

/** Destinations that already have their own page and therefore no "coming soon" placeholder. */
const BUILT_SECTIONS = new Set<NavItemId>(['household']);

export function getNavigation(role: MembershipRole): readonly NavItem[] {
  return NAVIGATION[role];
}

export function getTabBarItems(role: MembershipRole): readonly NavItem[] {
  return NAVIGATION[role].filter((entry) => entry.tab);
}

/** Every top-level tenant-area href across roles, used to pre-render the placeholder pages. */
export function getPlaceholderSlugs(): string[] {
  const slugs = new Set<string>();
  for (const entries of Object.values(NAVIGATION)) {
    for (const entry of entries)
      if (
        entry.href !== '/' &&
        entry.href.split('/').length === 2 &&
        !BUILT_SECTIONS.has(entry.id)
      )
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
