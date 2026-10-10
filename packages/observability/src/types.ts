export type ReportLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/** Where the code runs. Matches the environments in M00-F07. */
export type ReportingEnvironment = 'local' | 'staging' | (string & {});

/** Ambient context attached to every report. Never put personal data here. */
export interface ReportingContext {
  tenantId?: string;
  membershipRole?: string;
  environment?: ReportingEnvironment;
  release?: string;
}

/** Per-call context: the ambient fields plus free-form extras (scrubbed). */
export type CallContext = Partial<ReportingContext> & Record<string, unknown>;

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

/** The payload adapters receive. It is already scrubbed of PII. */
export interface ReportEvent {
  timestamp: string;
  level: ReportLevel;
  message: string;
  error?: SerializedError;
  context: Record<string, unknown>;
}

/** A destination for reports (console, Sentry, ...). Receives scrubbed events only. */
export interface ReportingAdapter {
  readonly name: string;
  capture(event: ReportEvent): void | Promise<void>;
}
