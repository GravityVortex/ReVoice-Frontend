/**
 * Global server-side console guard.
 *
 * Production:
 * - mute console.log/info/debug/warn
 * - keep console.error but only print a minimal message to avoid leaking payloads
 */
const NOOP = () => {};

declare global {
  // eslint-disable-next-line no-var
  var __REV_CONSOLE_GUARD_APPLIED__: boolean | undefined;
}

function toSafeErrorMessage(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (value instanceof Error && typeof value.message === 'string' && value.message.trim().length > 0) {
    return value.message;
  }
  return 'server error';
}

function applyConsoleGuard() {
  if (globalThis.__REV_CONSOLE_GUARD_APPLIED__) return;
  globalThis.__REV_CONSOLE_GUARD_APPLIED__ = true;

  const rawError = console.error.bind(console);

  console.log = NOOP;
  console.info = NOOP;
  console.debug = NOOP;
  console.warn = NOOP;
  console.error = (...args: unknown[]) => {
    rawError(toSafeErrorMessage(args[0]));
  };
}

export async function register() {
  if (process.env.NODE_ENV !== 'production') return;
  applyConsoleGuard();
}

