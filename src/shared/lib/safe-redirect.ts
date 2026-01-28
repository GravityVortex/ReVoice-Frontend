const DEFAULT_CALLBACK_URL = '/';
const MAX_CALLBACK_URL_LENGTH = 2048;

/**
 * Prevent open-redirects by allowing only same-site, root-relative paths.
 *
 * Accepts values like:
 * - "/settings/billing?page=2"
 *
 * Rejects values like:
 * - "https://evil.com"
 * - "//evil.com"
 * - "javascript:..."
 */
export function sanitizeCallbackUrl(
  value: unknown,
  fallback: string = DEFAULT_CALLBACK_URL
): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  if (trimmed.length > MAX_CALLBACK_URL_LENGTH) return fallback;

  // Must be an absolute-path reference (RFC 3986) relative to our origin.
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;

  // Avoid header injection via CR/LF.
  if (trimmed.includes('\r') || trimmed.includes('\n')) return fallback;

  return trimmed;
}

