// Logging privacy policy (applies to every console.* call in backend/src):
//   Logs carry an event code and, for failures, only the error class name. Never log member IDs, claim IDs,
//   connection IDs, email addresses, file names, document text, or a provider's exception message (those can
//   echo the request). Counts are fine. To debug, reproduce with the code; the stack trace is in the trace, not here.

/** The class name of whatever was thrown ("ThrottlingException"), never its message. */
export const errName = (err: unknown): string => (err instanceof Error ? err.name : 'Error');

/** An event code with optional counts (never identifiers), e.g. logInfo('claims.pushed', { sockets: 2 }). */
export const logInfo = (code: string, counts?: Record<string, number>) => (counts ? console.info(code, JSON.stringify(counts)) : console.info(code));
export const logWarn = (code: string, err?: unknown) => (err === undefined ? console.warn(code) : console.warn(code, errName(err)));
export const logError = (code: string, err?: unknown) => (err === undefined ? console.error(code) : console.error(code, errName(err)));
