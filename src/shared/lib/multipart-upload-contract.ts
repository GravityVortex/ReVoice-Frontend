export const MULTIPART_KEY_V = 'original/video/video_original.mp4';

export type MultipartKeyValidationResult =
  | { ok: true; fileId: string }
  | { ok: false; error: string };

/**
 * Validate that a client-provided key is exactly:
 *   {userId}/{fileId}/{MULTIPART_KEY_V}
 *
 * This is intentionally strict to reduce "key confusion" bugs and prevents
 * trivial path traversal attempts.
 */
export function validateMultipartKeyForUser(
  key: string,
  userId: string
): MultipartKeyValidationResult {
  if (!key) return { ok: false, error: 'key is required' };
  if (!userId) return { ok: false, error: 'userId is required' };

  if (key.startsWith('/')) return { ok: false, error: 'invalid key' };
  if (key.includes('..')) return { ok: false, error: 'invalid key' };

  const prefix = `${userId}/`;
  if (!key.startsWith(prefix)) return { ok: false, error: 'key must start with userId/' };

  const remainder = key.slice(prefix.length);
  const parts = remainder.split('/');
  // Expected: "{fileId}/original/video/video_original.mp4"
  if (parts.length !== 1 + 3) return { ok: false, error: 'invalid key' };

  const fileId = parts[0];
  if (!fileId) return { ok: false, error: 'invalid key' };

  const keyV = parts.slice(1).join('/');
  if (keyV !== MULTIPART_KEY_V) {
    return { ok: false, error: `keyV must be ${MULTIPART_KEY_V}` };
  }

  return { ok: true, fileId };
}
