import { describe, expect, it, vi } from 'vitest';
import { createConsoleAdapter } from './console-adapter';
import { createReporter } from './reporter';
import type { ReportEvent, ReportingAdapter } from './types';

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`missing item ${index}`);
  return item;
}

function recorder() {
  const events: ReportEvent[] = [];
  const adapter: ReportingAdapter = {
    name: 'test',
    capture: (event) => void events.push(event),
  };
  return { events, adapter };
}

describe('reporter', () => {
  it('attaches the ambient context and per-call context to errors', () => {
    const { events, adapter } = recorder();
    const reporter = createReporter(adapter);
    reporter.setReportingContext({
      tenantId: 'tenant-a',
      membershipRole: 'guard',
      environment: 'local',
    });
    reporter.setReportingContext({ release: 'abc123' });

    reporter.reportError(new Error('boom'), { route: '/x' });

    expect(events).toHaveLength(1);
    expect(at(events, 0)).toMatchObject({
      level: 'error',
      message: 'boom',
      error: { name: 'Error', message: 'boom' },
      context: {
        tenantId: 'tenant-a',
        membershipRole: 'guard',
        environment: 'local',
        release: 'abc123',
        route: '/x',
      },
    });
    expect(reporter.getReportingContext()).toEqual({
      tenantId: 'tenant-a',
      membershipRole: 'guard',
      environment: 'local',
      release: 'abc123',
    });
  });

  it('lets call context override the ambient tenant', () => {
    const { events, adapter } = recorder();
    const reporter = createReporter(adapter);
    reporter.setReportingContext({ tenantId: 'tenant-a' });
    reporter.reportMessage('warning', 'slow', { tenantId: 'tenant-b' });
    expect(at(events, 0).context.tenantId).toBe('tenant-b');
    expect(at(events, 0).level).toBe('warning');
  });

  it('scrubs PII before the adapter sees the payload', () => {
    const { events, adapter } = recorder();
    const reporter = createReporter(adapter);
    reporter.reportError(
      new Error('lookup failed for juan@example.com DNI 30123456'),
      {
        email: 'juan@example.com',
        person_document_number: '30123456',
      },
    );
    const serialized = JSON.stringify(at(events, 0));
    expect(serialized).not.toContain('juan@example.com');
    expect(serialized).not.toContain('30123456');
    expect(at(events, 0).message).toBe(
      'lookup failed for [email] DNI [document]',
    );
  });

  it('serializes non-Error values and error causes', () => {
    const { events, adapter } = recorder();
    const reporter = createReporter(adapter);
    reporter.reportError('plain string');
    reporter.reportError({ code: 1 });
    reporter.reportError(new Error('outer', { cause: new Error('inner') }));
    expect(at(events, 0).error).toMatchObject({
      name: 'NonErrorThrown',
      message: 'plain string',
    });
    expect(at(events, 1).error?.message).toBe('{"code":1}');
    expect(at(events, 2).error?.cause?.message).toBe('inner');
  });

  it('never throws when an adapter fails, sync or async', async () => {
    const reporter = createReporter({
      name: 'broken',
      capture: () => {
        throw new Error('adapter down');
      },
    });
    expect(() => reporter.reportError(new Error('x'))).not.toThrow();

    reporter.setAdapter({
      name: 'async-broken',
      capture: () => Promise.reject(new Error('down')),
    });
    expect(() => reporter.reportMessage('info', 'hi')).not.toThrow();
    await Promise.resolve();
  });

  it('can swap adapters at runtime', () => {
    const first = recorder();
    const second = recorder();
    const reporter = createReporter(first.adapter);
    reporter.setAdapter(second.adapter);
    reporter.reportMessage('info', 'hello');
    expect(first.events).toHaveLength(0);
    expect(second.events).toHaveLength(1);
  });
});

describe('consoleAdapter', () => {
  it('emits one JSON line per event and routes by level', () => {
    const lines: string[] = [];
    const reporter = createReporter(
      createConsoleAdapter((line) => lines.push(line)),
    );
    reporter.setReportingContext({ tenantId: 'tenant-a' });
    reporter.reportMessage('info', 'hello');
    expect(JSON.parse(at(lines, 0))).toMatchObject({
      level: 'info',
      message: 'hello',
      context: { tenantId: 'tenant-a' },
    });
  });

  it('uses console.error / warn / log by default', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const reporter = createReporter();
    reporter.reportError(new Error('e'));
    reporter.reportMessage('fatal', 'f');
    reporter.reportMessage('warning', 'w');
    reporter.reportMessage('debug', 'd');
    expect(error).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
