'use client';

import { Car, Loader, Search, User, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SearchHit } from '@/app/api/registry/search/route';
import { cn } from '@/lib/cn';
import { useAdminPermissions } from './admin-permissions';
import { useActiveContext } from './active-context';

const DEBOUNCE_MS = 120;
const MIN_LENGTH = 2;

const KIND_ICONS = { unit: Building2, person: User, vehicle: Car } as const;

type Status = 'idle' | 'loading' | 'done' | 'error';

/**
 * Global search of the admin top bar (M02-F08): unit, person, plate or email. A combobox with a result list that is
 * fully keyboard operable (↑ ↓ move, Enter opens the unit sheet, Esc closes, Ctrl/⌘ + K focuses the field). Requests
 * are debounced and a newer one cancels the older one, so a slow answer never overwrites a fresh one.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const permissions = useAdminPermissions();
  const { active } = useActiveContext();
  if (
    active.membership_role !== 'tenant_admin' ||
    !permissions.includes('registry')
  )
    return null;
  return <SearchBox className={className} />;
}

function SearchBox({ className }: { className?: string }) {
  const t = useTranslations('registry.search');
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Debounced, cancellable lookup. The state updates happen in the timer / fetch callbacks, never synchronously.
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await fetch(
          `/api/registry/search?q=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok) throw new Error('search failed');
        const body = (await response.json()) as { hits: SearchHit[] };
        setHits(body.hits);
        setHighlight(body.hits.length > 0 ? 0 : -1);
        setStatus('done');
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        setHits([]);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const searching = term.trim().length >= MIN_LENGTH;
  const showPanel = open && searching;
  const go = (hit: SearchHit) => {
    setOpen(false);
    setTerm('');
    setHits([]);
    setStatus('idle');
    router.push(`/registry/units/${hit.unitId}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (hits.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => (current + step + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      const hit = hits[highlight];
      if (showPanel && status === 'done' && hit) {
        event.preventDefault();
        go(hit);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else {
        setTerm('');
      }
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  return (
    <div
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-secondary"
          strokeWidth={2}
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={t('label')}
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && highlight >= 0 ? optionId(highlight) : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder={t('placeholder')}
          value={term}
          onChange={(event) => {
            const next = event.target.value;
            setTerm(next);
            setOpen(true);
            if (next.trim().length >= MIN_LENGTH) setStatus('loading');
            else {
              setHits([]);
              setStatus('idle');
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="block min-h-(--control-height) w-full rounded-input border-2 border-transparent bg-surface-2 pr-4 pl-10 text-app-body-dense text-text-primary placeholder:text-text-placeholder"
        />
      </div>
      <div aria-live="polite" className="sr-only">
        {showPanel && status === 'done'
          ? t('resultCount', { count: hits.length })
          : ''}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={t('label')}
        hidden={!showPanel}
        className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70dvh] overflow-y-auto rounded-card-dense border border-hairline bg-surface-0 p-1 lg:min-w-[26rem]"
      >
        {status === 'loading' && hits.length === 0 ? (
          <li
            role="presentation"
            className="flex items-center gap-2 p-3 text-text-secondary"
          >
            <Loader
              aria-hidden="true"
              className="size-4 animate-spin"
              strokeWidth={2}
            />
            {t('searching')}
          </li>
        ) : null}
        {status === 'done' && hits.length === 0 ? (
          <li role="presentation" className="p-3 text-text-secondary">
            {t('noResults')}
          </li>
        ) : null}
        {status === 'error' ? (
          <li role="presentation" className="p-3 text-danger">
            {t('error')}
          </li>
        ) : null}
        {hits.map((hit, index) => {
          const Icon = KIND_ICONS[hit.kind];
          return (
            <li
              key={`${hit.kind}-${hit.id}-${hit.unitId}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(hit)}
              className={cn(
                'flex min-h-(--control-height) cursor-pointer items-center gap-3 rounded-input px-3 py-2',
                index === highlight && 'bg-surface-2',
              )}
            >
              <Icon
                aria-hidden="true"
                className="size-5 shrink-0"
                strokeWidth={1.75}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-app-body-dense font-semibold">
                  {hit.title}
                </span>
                <span className="truncate text-app-caption text-text-secondary">
                  {[
                    t(`kinds.${hit.kind}`),
                    t('unitOf', { unit: hit.unitCode }),
                  ].join(' · ')}
                  {hit.detail && hit.kind !== 'vehicle'
                    ? ` · ${hit.detail}`
                    : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
