// Generated from @domus/observability; source-sha256: 898a61b32a1a476d7d0a7b3645cfec18dd09dd03620b89df00587a2e515f29cf

// packages/observability/src/console-adapter.ts
function defaultSink(line, event) {
  if (event.level === "error" || event.level === "fatal") console.error(line);
  else if (event.level === "warning") console.warn(line);
  else console.log(line);
}
function createConsoleAdapter(sink = defaultSink) {
  return {
    name: "console",
    capture(event) {
      sink(JSON.stringify(event), event);
    }
  };
}
var consoleAdapter = createConsoleAdapter();

// packages/observability/src/scrub.ts
var REDACTED = "[REDACTED]";
var MAX_DEPTH = 8;
var SENSITIVE_KEY_PARTS = [
  "email",
  "phone",
  "password",
  "passwd",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "documentnumber",
  "dni"
];
var JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
var BEARER = /\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi;
var EMAIL = /[\w.+%-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g;
var PHONE_INTL = /\+\d[\d ().-]{7,}\d/g;
var PHONE_LOCAL = /(?<![\w.-])\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{4}(?![\w-])/g;
var PHONE_PLAIN = /(?<![\w.-])\d{10,11}(?![\w-])/g;
var DNI_DOTTED = /(?<![\w.-])\d{1,2}\.\d{3}\.\d{3}(?![\w-])/g;
var DNI_PLAIN = /(?<![\w.-])\d{7,8}(?![\w-])/g;
function isSensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[_\-\s]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}
function scrubString(value) {
  return value.replace(JWT, "[token]").replace(BEARER, "$1 [token]").replace(EMAIL, "[email]").replace(PHONE_INTL, "[phone]").replace(PHONE_LOCAL, "[phone]").replace(PHONE_PLAIN, "[phone]").replace(DNI_DOTTED, "[document]").replace(DNI_PLAIN, "[document]");
}
function scrubPii(value) {
  return scrub(value, /* @__PURE__ */ new WeakSet(), 0);
}
function scrub(value, seen, depth) {
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "function" || typeof value === "symbol")
    return void 0;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: scrubString(value.message),
        stack: value.stack ? scrubString(value.stack) : void 0
      };
    }
    if (Array.isArray(value))
      return value.map((item) => scrub(item, seen, depth + 1));
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : scrub(item, seen, depth + 1);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

// packages/observability/src/reporter.ts
function safeStringify(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
var MAX_STACK_LINES = 12;
function trimStack(stack) {
  return stack?.split("\n").slice(0, MAX_STACK_LINES).join("\n");
}
function serializeError(error, depth = 0) {
  if (error instanceof Error) {
    const serialized = {
      name: error.name,
      message: error.message,
      stack: trimStack(error.stack)
    };
    if (error.cause !== void 0 && depth < 3)
      serialized.cause = serializeError(error.cause, depth + 1);
    return serialized;
  }
  return {
    name: "NonErrorThrown",
    message: typeof error === "string" ? error : safeStringify(error)
  };
}
function createReporter(initialAdapter = consoleAdapter) {
  let adapter = initialAdapter;
  let ambient = {};
  function emit(level, message, context, error) {
    const event = scrubPii({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      ...error ? { error } : {},
      context: { ...ambient, ...context }
    });
    try {
      const result = adapter.capture(event);
      if (result) result.catch(() => void 0);
    } catch {
    }
  }
  return {
    reportError(error, context) {
      const serialized = serializeError(error);
      emit("error", serialized.message, context, serialized);
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
    }
  };
}
var defaultReporter = createReporter();
var reportError = defaultReporter.reportError;
var reportMessage = defaultReporter.reportMessage;
var setReportingContext = defaultReporter.setReportingContext;
var getReportingContext = defaultReporter.getReportingContext;
var setReportingAdapter = defaultReporter.setAdapter;
export {
  createReporter,
  getReportingContext,
  reportError,
  reportMessage,
  setReportingAdapter,
  setReportingContext
};
