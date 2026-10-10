import type { ReportEvent, ReportingAdapter } from './types';

export type ConsoleSink = (line: string, event: ReportEvent) => void;

function defaultSink(line: string, event: ReportEvent): void {
  if (event.level === 'error' || event.level === 'fatal') console.error(line);
  else if (event.level === 'warning') console.warn(line);
  else console.log(line);
}

/** Default adapter: one structured JSON line per event. Works in Node and edge runtimes. */
export function createConsoleAdapter(
  sink: ConsoleSink = defaultSink,
): ReportingAdapter {
  return {
    name: 'console',
    capture(event) {
      sink(JSON.stringify(event), event);
    },
  };
}

export const consoleAdapter: ReportingAdapter = createConsoleAdapter();
