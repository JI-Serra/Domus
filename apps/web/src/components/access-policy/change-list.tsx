'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PolicyChange } from '@/lib/access-policy/rules';
import {
  LIMIT_IDS,
  limitValueUnit,
  parseChangePath,
} from '@/lib/access-policy/rules';

/** Compact "what changed" list: one line per field with its value before and after (M03-F05 preview, M03-F06). */
export function ChangeList({
  changes,
  label,
}: {
  changes: readonly PolicyChange[];
  label: string;
}) {
  const t = useTranslations('accessPolicy');

  const modeName = (mode: string) =>
    t.has(`modes.${mode}` as 'modes.notify')
      ? t(`modes.${mode}` as 'modes.notify')
      : mode;

  const describe = (change: PolicyChange) => {
    const target = parseChangePath(change.path);
    if (!target) return { name: change.path, before: '', after: '' };
    if (target.kind === 'limit') {
      const unit = limitValueUnit(target.key);
      const format = (value: PolicyChange['before']) =>
        t(`values.${unit}`, { count: Number(value) });
      return {
        name: t(`limits.${LIMIT_IDS[target.key]}.label`),
        before: format(change.before),
        after: format(change.after),
      };
    }
    const type = t(`visitorTypes.${target.visitor}`);
    const field = t(`fields.${target.field}`);
    const format = (value: PolicyChange['before']) => {
      if (target.field === 'allowedModes')
        return Array.isArray(value) ? value.map(modeName).join(', ') : '';
      if (target.field === 'identity')
        return t(
          value === true
            ? 'values.identityRequired'
            : 'values.identityNotRequired',
        );
      return modeName(String(value));
    };
    return {
      name: `${type} · ${field}`,
      before: format(change.before),
      after: format(change.after),
    };
  };

  return (
    <ul aria-label={label} className="flex flex-col">
      {changes.map((change) => {
        const { name, before, after } = describe(change);
        return (
          <li
            key={change.path}
            className="flex flex-col gap-1 border-t border-hairline py-2 first:border-t-0"
          >
            <span className="text-app-subheading">{name}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-app-body-dense">
              <span className="text-text-secondary">{before}</span>
              <ArrowRight
                aria-label="→"
                role="img"
                className="size-4 shrink-0 text-text-secondary"
                strokeWidth={2}
              />
              <span className="font-semibold">{after}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
