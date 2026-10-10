import { Archive, CircleDashed, Construction, House } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';

export type UnitStatusValue = 'occupied' | 'under_construction' | 'vacant';

const STATUS: Record<UnitStatusValue, { tone: BadgeTone; icon: LucideIcon }> = {
  occupied: { tone: 'success', icon: House },
  under_construction: { tone: 'warning', icon: Construction },
  vacant: { tone: 'neutral', icon: CircleDashed },
};

const icon = (Icon: LucideIcon) => (
  <Icon aria-hidden="true" className="size-[1.25em] shrink-0" strokeWidth={2} />
);

/** Unit status as icon + text, never color alone. An archived unit says so instead of its status. */
export function UnitStatusBadge({
  status,
  archived = false,
}: {
  status: UnitStatusValue;
  archived?: boolean;
}) {
  const t = useTranslations('unitStatus');
  const registryT = useTranslations('registry.units');
  if (archived)
    return (
      <Badge tone="neutral" icon={icon(Archive)}>
        {registryT('archived')}
      </Badge>
    );
  const { tone, icon: Icon } = STATUS[status];
  return (
    <Badge tone={tone} icon={icon(Icon)}>
      {t(status)}
    </Badge>
  );
}
