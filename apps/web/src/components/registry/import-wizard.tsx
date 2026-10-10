'use client';

import { summarizeImportPreview } from '@domus/domain/registry-ui';
import type { ImportRowPreview } from '@domus/domain/registry-ui';
import {
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilePicker } from '@/components/ui/file-picker';
import { InfoButton } from '@/components/ui/info-button';
import {
  confirmImportAction,
  stageImportAction,
} from '@/app/(app)/registry/import/actions';
import {
  ImportFileError,
  downloadCsvTemplate,
  downloadXlsxTemplate,
  parseImportFile,
} from '@/lib/registry/import-parse';
import type { ParsedImport } from '@/lib/registry/import-parse';
import type { ImportResult, ImportStaged } from '@/lib/registry/import-types';
import { useErrorMessage } from './use-error-message';

const PREVIEW_ROWS = 100;
const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

type Step =
  | { name: 'idle' }
  | { name: 'parsed'; fileName: string; parsed: ParsedImport }
  | {
      name: 'staged';
      fileName: string;
      parsed: ParsedImport;
      staged: ImportStaged;
      confirmEventId: string;
    }
  | { name: 'done'; fileName: string; result: ImportResult };

/**
 * Bulk import of units and residents (M02-F02): template → file → local preview → server validation → confirm →
 * result. The file is read in the browser; only typed rows reach the server, and only the database decides.
 */
export function ImportWizard({ writable }: { writable: boolean }) {
  const t = useTranslations('registry.import');
  const message = useErrorMessage();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [problem, setProblem] = useState<{
    key: string;
    columns?: readonly string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [pickerKey, setPickerKey] = useState(0);
  // One idempotency key per staging attempt of the same parsed file.
  const [stageEventId, setStageEventId] = useState(() => crypto.randomUUID());

  const reset = () => {
    setStep({ name: 'idle' });
    setProblem(null);
    setPickerKey((key) => key + 1);
    setStageEventId(crypto.randomUUID());
  };

  const choose = (file: File | null) => {
    setProblem(null);
    if (!file) {
      setStep({ name: 'idle' });
      return;
    }
    startTransition(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const parsed = await parseImportFile(file, today);
        setStageEventId(crypto.randomUUID());
        setStep({ name: 'parsed', fileName: file.name, parsed });
      } catch (error) {
        setStep({ name: 'idle' });
        setPickerKey((key) => key + 1);
        if (error instanceof ImportFileError)
          setProblem({ key: error.problem, columns: error.columns });
        else setProblem({ key: 'unreadable' });
      }
    });
  };

  const validate = () => {
    if (step.name !== 'parsed') return;
    const current = step;
    setProblem(null);
    startTransition(async () => {
      const answer = await stageImportAction(
        current.parsed.preview.map((row) => row.data),
        stageEventId,
      );
      if (!answer.ok) {
        setProblem({ key: `server:${answer.error}` });
        return;
      }
      setStep({
        name: 'staged',
        fileName: current.fileName,
        parsed: current.parsed,
        staged: answer.data,
        confirmEventId: crypto.randomUUID(),
      });
    });
  };

  const confirm = () => {
    if (step.name !== 'staged') return;
    const current = step;
    setProblem(null);
    startTransition(async () => {
      const answer = await confirmImportAction(
        current.staged.importId,
        current.confirmEventId,
      );
      if (!answer.ok) {
        setProblem({ key: `server:${answer.error}` });
        return;
      }
      if (answer.data.status === 'invalid') {
        setProblem({ key: 'confirmInvalid' });
        return;
      }
      setStep({
        name: 'done',
        fileName: current.fileName,
        result: answer.data,
      });
    });
  };

  const problemText = (() => {
    if (!problem) return null;
    if (problem.key.startsWith('server:'))
      return message(problem.key.slice('server:'.length));
    return t(`fileProblems.${problem.key}` as 'fileProblems.type', {
      columns: (problem.columns ?? []).join(', '),
    });
  })();

  return (
    <div className="flex flex-col gap-6">
      <Card density="dense" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h2 className="text-app-heading">{t('fileTitle')}</h2>
            <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FileText {...iconProps} />}
              onClick={downloadCsvTemplate}
            >
              {t('templateCsv')}
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet {...iconProps} />}
              onClick={() => void downloadXlsxTemplate()}
            >
              {t('templateXlsx')}
            </Button>
          </div>
        </div>
        {writable ? (
          <FilePicker
            key={pickerKey}
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            chooseLabel={t('choose')}
            emptyLabel={t('noFile')}
            clearLabel={t('clearFile')}
            fileName={step.name === 'idle' ? null : step.fileName}
            disabled={pending}
            invalid={Boolean(problem)}
            onChange={choose}
          />
        ) : null}
        {problemText ? (
          <AuthNotice tone="error">{problemText}</AuthNotice>
        ) : null}
      </Card>

      {step.name === 'parsed' ? (
        <LocalPreview
          parsed={step.parsed}
          pending={pending}
          onValidate={validate}
        />
      ) : null}

      {step.name === 'staged' ? (
        <ServerPreview
          step={step}
          pending={pending}
          onConfirm={confirm}
          onReset={reset}
        />
      ) : null}

      {step.name === 'done' ? (
        <ResultCard result={step.result} onReset={reset} />
      ) : null}
    </div>
  );
}

function useIssueText() {
  const t = useTranslations('registry.import');
  return (code: string, field?: string): string => {
    if (t.has(`codes.${code}` as 'codes.generic'))
      return t(`codes.${code}` as 'codes.generic');
    const column =
      field && t.has(`columns.${field}` as 'columns.unit_code')
        ? t(`columns.${field}` as 'columns.unit_code')
        : (field ?? '');
    return t('codes.generic', { field: column });
  };
}

function Summary({
  items,
}: {
  items: readonly { label: string; value: number | string; testId: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.testId}
          className="flex flex-col rounded-card-dense bg-surface-2 px-4 py-3"
        >
          <dt className="text-app-caption text-text-secondary">{item.label}</dt>
          <dd data-testid={item.testId} className="text-app-title tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LocalPreview({
  parsed,
  pending,
  onValidate,
}: {
  parsed: ParsedImport;
  pending: boolean;
  onValidate: () => void;
}) {
  const t = useTranslations('registry.import');
  const issueText = useIssueText();
  const summary = summarizeImportPreview(parsed.preview);
  const hasErrors = summary.rowsWithErrors > 0;
  const shown: ImportRowPreview[] = hasErrors
    ? parsed.preview
        .filter((row) => row.errors.length > 0)
        .slice(0, PREVIEW_ROWS)
    : parsed.preview.slice(0, PREVIEW_ROWS);

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('previewTitle')}</h2>
        {!hasErrors ? (
          <Button disabled={pending} onClick={onValidate}>
            {pending ? t('validating') : t('validate')}
          </Button>
        ) : null}
      </div>
      <Summary
        items={[
          {
            label: t('summary.rows'),
            value: summary.rows,
            testId: 'import-rows',
          },
          {
            label: t('summary.units'),
            value: summary.units,
            testId: 'import-units',
          },
          {
            label: t('summary.residents'),
            value: summary.residents,
            testId: 'import-residents',
          },
          {
            label: t('summary.errors'),
            value: summary.rowsWithErrors,
            testId: 'import-errors',
          },
        ]}
      />
      {parsed.unknownColumns.length > 0 ? (
        <AuthNotice tone="info">
          {t('ignoredColumns', { columns: parsed.unknownColumns.join(', ') })}
        </AuthNotice>
      ) : null}
      {hasErrors ? (
        <AuthNotice tone="error">{t('fixErrors')}</AuthNotice>
      ) : (
        <p className="flex items-center gap-2 text-app-body-dense text-success">
          <CircleCheck {...iconProps} />
          {t('localOk')}
        </p>
      )}
      <div className="overflow-x-auto rounded-card-dense border border-hairline">
        <table aria-label={t('previewLabel')} className="w-full text-left">
          <thead>
            <tr className="text-app-caption text-text-secondary">
              <th scope="col" className="px-3 py-2 font-normal">
                {t('table.line')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('table.unit')}
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2 font-normal md:table-cell"
              >
                {t('table.status')}
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2 font-normal md:table-cell"
              >
                {t('table.person')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('table.result')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const data = row.data;
              const raw = parsed.rows[row.row_number - 1] ?? {};
              return (
                <tr
                  key={row.row_number}
                  className="border-t border-hairline align-top"
                >
                  <td className="px-3 py-2 text-app-body-dense tabular-nums">
                    {parsed.lines[row.row_number - 1]}
                  </td>
                  <td className="px-3 py-2 text-app-body-dense">
                    {data?.unit_code ?? String(raw.unit_code ?? '—')}
                  </td>
                  <td className="hidden px-3 py-2 text-app-body-dense md:table-cell">
                    {data?.unit_status ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-app-body-dense md:table-cell">
                    {data?.person_first_name
                      ? `${data.person_first_name} ${data.person_last_name ?? ''}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-app-body-dense">
                    {row.errors.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <CircleCheck
                          aria-hidden="true"
                          className="size-4"
                          strokeWidth={2}
                        />
                        {t('rowOk')}
                      </span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {row.errors.map((issue) => (
                          <li
                            key={`${issue.field}-${issue.code}`}
                            className="flex items-start gap-1.5 text-danger"
                          >
                            <CircleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0"
                              strokeWidth={2}
                            />
                            <span>{issueText(issue.code, issue.field)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(hasErrors ? summary.rowsWithErrors : summary.rows) > PREVIEW_ROWS ? (
        <p className="text-app-caption text-text-secondary">
          {t('shownOf', {
            shown: PREVIEW_ROWS,
            total: hasErrors ? summary.rowsWithErrors : summary.rows,
          })}
        </p>
      ) : null}
    </Card>
  );
}

function ServerPreview({
  step,
  pending,
  onConfirm,
  onReset,
}: {
  step: Extract<Step, { name: 'staged' }>;
  pending: boolean;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const t = useTranslations('registry.import');
  const issueText = useIssueText();
  const { staged, parsed } = step;
  const summary = summarizeImportPreview(parsed.preview);
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('serverTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<RotateCcw {...iconProps} />}
            disabled={pending}
            onClick={onReset}
          >
            {t('startOver')}
          </Button>
          {staged.errorCount === 0 ? (
            <Button disabled={pending} onClick={onConfirm}>
              {pending ? t('confirming') : t('confirm')}
            </Button>
          ) : null}
        </div>
      </div>
      <Summary
        items={[
          {
            label: t('summary.rows'),
            value: staged.rowCount,
            testId: 'import-rows',
          },
          {
            label: t('summary.units'),
            value: summary.units,
            testId: 'import-units',
          },
          {
            label: t('summary.residents'),
            value: summary.residents,
            testId: 'import-residents',
          },
          {
            label: t('summary.errors'),
            value: staged.errorCount,
            testId: 'import-errors',
          },
        ]}
      />
      {staged.errorCount === 0 ? (
        <p className="flex items-center gap-2 text-app-body-dense text-success">
          <CircleCheck {...iconProps} />
          {t('serverOk')}
        </p>
      ) : (
        <>
          <AuthNotice tone="error">{t('fixErrors')}</AuthNotice>
          <div className="overflow-x-auto rounded-card-dense border border-hairline">
            <table aria-label={t('errorsLabel')} className="w-full text-left">
              <thead>
                <tr className="text-app-caption text-text-secondary">
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t('table.line')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t('table.unit')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t('table.result')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {staged.errorRows.map((row) => (
                  <tr
                    key={row.row_number}
                    className="border-t border-hairline align-top"
                  >
                    <td className="px-3 py-2 text-app-body-dense tabular-nums">
                      {parsed.lines[row.row_number - 1] ?? row.row_number}
                    </td>
                    <td className="px-3 py-2 text-app-body-dense">
                      {row.unit_code || '—'}
                    </td>
                    <td className="px-3 py-2 text-app-body-dense">
                      <ul className="flex flex-col gap-1">
                        {row.errors.map((code) => (
                          <li
                            key={code}
                            className="flex items-start gap-1.5 text-danger"
                          >
                            <CircleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0"
                              strokeWidth={2}
                            />
                            <span>
                              {issueText(
                                code,
                                code.replace(/_(invalid|required)$/, ''),
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {staged.errorCount > staged.errorRows.length ? (
            <p className="text-app-caption text-text-secondary">
              {t('shownOf', {
                shown: staged.errorRows.length,
                total: staged.errorCount,
              })}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function ResultCard({
  result,
  onReset,
}: {
  result: ImportResult;
  onReset: () => void;
}) {
  const t = useTranslations('registry.import.result');
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <h2 className="text-app-heading">{t('title')}</h2>
      <p
        role="status"
        data-testid="import-outcome"
        className="flex items-center gap-2 text-app-subheading text-success"
      >
        <CircleCheck {...iconProps} />
        {result.unchanged ? t('unchanged') : t('changed')}
      </p>
      <Summary
        items={[
          {
            label: t('units'),
            value: result.unitCount,
            testId: 'result-units',
          },
          {
            label: t('residents'),
            value: result.residentCount,
            testId: 'result-residents',
          },
          {
            label: t('createdUnits'),
            value: result.createdUnits,
            testId: 'result-created-units',
          },
          {
            label: t('createdResidents'),
            value: result.createdResidents,
            testId: 'result-created-residents',
          },
        ]}
      />
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/registry/units">{t('viewUnits')}</ButtonLink>
        <Button variant="secondary" onClick={onReset}>
          {t('another')}
        </Button>
      </div>
    </Card>
  );
}
