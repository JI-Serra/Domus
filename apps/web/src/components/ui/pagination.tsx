import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ButtonLink } from './button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Link to a page, keeping the rest of the filters. */
  hrefFor: (page: number) => string;
  /** "Página 2 de 6" in the caller's language. */
  summary: string;
  previousLabel: string;
  nextLabel: string;
}

/** Previous / next links with the position; renders nothing when everything fits in one page. */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  summary,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={summary}
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      {page > 1 ? (
        <ButtonLink
          href={hrefFor(page - 1)}
          variant="secondary"
          icon={
            <ChevronLeft
              aria-hidden="true"
              className="size-5"
              strokeWidth={2}
            />
          }
        >
          {previousLabel}
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="text-app-body-dense text-text-secondary">{summary}</span>
      {page < pages ? (
        <ButtonLink
          href={hrefFor(page + 1)}
          variant="secondary"
          icon={
            <ChevronRight
              aria-hidden="true"
              className="size-5"
              strokeWidth={2}
            />
          }
        >
          {nextLabel}
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}
