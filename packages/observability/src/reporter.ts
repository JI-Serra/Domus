import { consoleAdapter } from './console-adapter';
import { scrubPii } from './scrub';
import type {
  CallContext,
  ReportEvent,
  ReportLevel,
  ReportingAdapter,
  ReportingContext,
  SerializedError,
} from './types';

export interface Reporter {
  reportError(error: unknown, context?: CallContext): void;
  reportMessage(
    level: ReportLevel,
    message: string,
    context?: CallContext,
  ): void;
  setReportingContext(context: ReportingContext): void;
  getReportingContext(): ReportingContext;
  setAdapter(adapter: ReportingAdapter): void;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

const MAX_STACK_LINES = 12;

function trimStack(stack: string | undefined): string | undefined {
  return stack?.split('\n').slice(0, MAX_STACK_LINES).join('\n');
}

function serializeError(error: unknown, depth = 0): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
      stack: trimStack(error.stack),
    };
    if (error.cause !== undefined && depth < 3)
      serialized.cause = serializeError(error.cause, depth + 1);
    return serialized;
  }
  return {
    name: 'NonErrorThrown',
    message: typeof error === 'string' ? error : safeStringify(error),
  };
}

export function createReporter(
  initialAdapter: ReportingAdapter = consoleAdapter,
): Reporter {
  let adapter = initialAdapter;
  let ambient: ReportingContext = {};

  function emit(
    level: ReportLevel,
    message: string,
    context?: CallContext,
    error?: SerializedError,
  ): void {
    // Everything is scrubbed here, before any adapter sees it.
    const event = scrubPii<ReportEvent>({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(error ? { error } : {}),
      context: { ...ambient, ...context },
    });
    try {
      const result = adapter.capture(event);
      if (result) result.catch(() => undefined);
    } catch {
      // Reporting must never break the request that is being reported.
    }
  }

  return {
    reportError(error, context) {
      const serialized = serializeError(error);
      emit('error', serialized.message, context, serialized);
    },
    reportMessage(level, message, context) {
      emit(level, message, context);
    },
    setReportingContext(context) {
      ambient = { ...ambient, ...context };
    },
    getReportingContext() {
      return { ...ambient };
    },
    setAdapter(next) {
      adapter = next;
    },
  };
}

const defaultReporter = createReporter();

export const reportError = defaultReporter.reportError;
export const reportMessage = defaultReporter.reportMessage;
export const setReportingContext = defaultReporter.setReportingContext;
export const getReportingContext = defaultReporter.getReportingContext;
export const setReportingAdapter = defaultReporter.setAdapter;
