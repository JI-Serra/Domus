import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { signOutAction } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';

/** Ends the session on this device. `icon` is the compact top-bar form; the default shows the label. */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('auth.logout');
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="secondary"
        size={compact ? 'icon' : 'md'}
        aria-label={compact ? t('label') : undefined}
        icon={<LogOut aria-hidden="true" className="size-5" strokeWidth={2} />}
      >
        {compact ? null : t('label')}
      </Button>
    </form>
  );
}
