import { formatDateTime } from '@domus/domain/format';
import {
  supportActualMinutes,
  supportDisplayStatus,
} from '@domus/domain/platform';
import type { SupportSessionStatus } from '@domus/domain/platform';
import { useTranslations } from 'next-intl';
import { Badge, StatusBadge } from '@/components/ui/badge';
import type { StatusTone } from '@/components/ui/badge';

const TONES: Record<SupportSessionStatus, StatusTone | 'neutral'> = {
  active: 'warning',
  ended: 'neutral',
  revoked: 'danger',
  expired: 'neutral',
};

export interface SupportSessionItem {
  support_session_id: string;
  support_session_reason: string;
  support_session_started_at: string;
  support_session_expires_at: string;
  support_session_ended_at: string | null;
  support_session_status: SupportSessionStatus;
  /** Barrio name (platform view) */
  tenantName?: string;
  /** Who started it, already worded ("Vos", "Otro super-admin", "Equipo de Domus"). */
  actorLabel: string;
  /** Person the admin acted as. */
  targetLabel: string;
}

/**
 * Support sessions as rows: status first, then who acted as whom and why, with when and for how long. Shared by the
 * platform view (all barrios) and the tenant view (`/settings/support`, M01-F04: the barrio sees every access).
 */
export function SupportSessionList({
  sessions,
  now,
  label,
  empty,
  durationLabel,
  statusLabels,
  whoLabel,
  asLabel,
  reasonLabel,
  minutesLabel,
}: {
  sessions: readonly SupportSessionItem[];
  now: Date;
  label: string;
  empty: string;
  durationLabel: string;
  statusLabels: Record<SupportSessionStatus, string>;
  whoLabel: string;
  asLabel: string;
  reasonLabel: string;
  minutesLabel: (minutes: number) => string;
}) {
  if (sessions.length === 0)
    return <p className="text-text-secondary">{empty}</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {sessions.map((session) => {
        const status = supportDisplayStatus(session, now);
        const tone = TONES[status];
        return (
          <li
            key={session.support_session_id}
            className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-card-dense bg-surface-0 p-4"
          >
            <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
              {session.tenantName ? (
                <span className="text-app-subheading">
                  {session.tenantName}
                </span>
              ) : null}
              <span className="text-app-body-dense">
                <span className="text-text-secondary">
                  {whoLabel}
                  {': '}
                </span>
                {session.actorLabel}
                <span className="text-text-secondary">
                  {' · '}
                  {asLabel}
                  {': '}
                </span>
                {session.targetLabel}
              </span>
              <span className="text-app-body-dense break-words">
                <span className="text-text-secondary">
                  {reasonLabel}
                  {': '}
                </span>
                {session.support_session_reason}
              </span>
            </div>
            <div className="flex flex-col items-start gap-1">
              {tone === 'neutral' ? (
                <Badge>{statusLabels[status]}</Badge>
              ) : (
                <StatusBadge status={tone}>{statusLabels[status]}</StatusBadge>
              )}
              <span className="text-app-caption text-text-secondary">
                {formatDateTime(session.support_session_started_at)}
              </span>
              <span className="text-app-caption text-text-secondary">
                {durationLabel}
                {': '}
                {minutesLabel(supportActualMinutes(session))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Platform wording of {@link SupportSessionList}. */
export function PlatformSupportSessionList({
  sessions,
  now,
}: {
  sessions: readonly SupportSessionItem[];
  now: Date;
}) {
  const t = useTranslations('platform.support.history');
  const statuses = useTranslations('platform.support.statuses');
  return (
    <SupportSessionList
      sessions={sessions}
      now={now}
      label={t('listLabel')}
      empty={t('empty')}
      durationLabel={t('duration')}
      whoLabel={t('actor')}
      asLabel={t('user')}
      reasonLabel={t('reason')}
      minutesLabel={(minutes) => t('minutes', { minutes })}
      statusLabels={{
        active: statuses('active'),
        ended: statuses('ended'),
        revoked: statuses('revoked'),
        expired: statuses('expired'),
      }}
    />
  );
}
