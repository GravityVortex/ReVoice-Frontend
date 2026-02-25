import { MULTIPART_KEY_V, validateMultipartKeyForUser } from '@/shared/lib/multipart-upload-contract';

export type GatewayOk<T> = { ok: true; data: T };
export type GatewayErr = { ok: false; error: string };
export type GatewayResult<T> = GatewayOk<T> | GatewayErr;

export type InitiateOut = {
  uploadId: string;
  fileId: string;
  bucket: string;
  keyV: string;
  key: string;
};

export async function gatewayInitiate(
  userId: string,
  body: unknown,
  deps: {
    initiate: (args: {
      userId: string;
      filename: string;
      contentType?: string;
    }) => Promise<InitiateOut>;
  }
): Promise<GatewayResult<InitiateOut>> {
  const b = (body || {}) as { filename?: string; contentType?: string };
  const filename = b.filename?.trim();
  const contentType = b.contentType?.trim();
  if (!filename) return { ok: false, error: 'filename is required' };

  const data = await deps.initiate({ userId, filename, contentType });
  return { ok: true, data };
}

export type PresignPartOut = { partNumber: number; presignedUrl: string };

function clampExpiresInSeconds(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(60, Math.min(86400, Math.trunc(n)));
}

export async function gatewayPresignPart(
  userId: string,
  body: unknown,
  deps: {
    presignPart: (args: {
      userId: string;
      uploadId: string;
      key: string;
      partNumber: number;
      expiresInSeconds?: number;
    }) => Promise<{ partNumber: number; url: string }>;
  }
): Promise<GatewayResult<PresignPartOut>> {
  const b = (body || {}) as {
    uploadId?: string;
    key?: string;
    partNumber?: number;
    expiresInSeconds?: number;
  };

  const uploadId = b.uploadId?.trim();
  const key = b.key?.trim();
  const partNumber = Number(b.partNumber);
  if (!uploadId || !key || !Number.isInteger(partNumber)) {
    return { ok: false, error: 'uploadId, key, and partNumber are required' };
  }
  if (partNumber < 1 || partNumber > 10000) {
    return { ok: false, error: 'invalid partNumber' };
  }

  const keyCheck = validateMultipartKeyForUser(key, userId);
  if (!keyCheck.ok) return { ok: false, error: keyCheck.error };

  const expiresInSeconds = clampExpiresInSeconds(b.expiresInSeconds);
  const data = await deps.presignPart({
    userId,
    uploadId,
    key,
    partNumber,
    ...(expiresInSeconds ? { expiresInSeconds } : {}),
  });

  return { ok: true, data: { partNumber: data.partNumber, presignedUrl: data.url } };
}

export type CompleteOut = {
  success: boolean;
  bucket: string;
  keyV: string;
  key: string;
  fileId: string;
  publicUrl: string;
};

type ClientPartInfo = { partNumber: number; etag: string };

function normalizeParts(parts: unknown): ClientPartInfo[] | undefined {
  if (parts === undefined || parts === null) return undefined;
  if (!Array.isArray(parts)) throw new Error('parts must be an array when provided');

  const normalized: ClientPartInfo[] = [];
  for (const p of parts) {
    const partNumber = Number((p as any)?.partNumber);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      throw new Error('invalid parts');
    }
    const etagRaw = (p as any)?.etag;
    const etag = typeof etagRaw === 'string' ? etagRaw.replace(/"/g, '').trim() : '';
    normalized.push({ partNumber, etag });
  }
  return normalized;
}

export async function gatewayComplete(
  userId: string,
  body: unknown,
  deps: {
    complete: (args: {
      userId: string;
      uploadId: string;
      key: string;
      parts?: Array<{ partNumber: number; etag: string }>;
    }) => Promise<{
      success: boolean;
      bucket: string;
      key: string;
      keyV: string;
      fileId: string;
      downloadUrl: string;
    }>;
  }
): Promise<GatewayResult<CompleteOut>> {
  try {
    const b = (body || {}) as {
      uploadId?: string;
      key?: string;
      parts?: ClientPartInfo[];
    };

    const uploadId = b.uploadId?.trim();
    const key = b.key?.trim();
    if (!uploadId || !key) {
      return { ok: false, error: 'uploadId and key are required' };
    }

    const keyCheck = validateMultipartKeyForUser(key, userId);
    if (!keyCheck.ok) return { ok: false, error: keyCheck.error };

    const parts = normalizeParts(b.parts);
    const partsForJava =
      parts && parts.length && parts.every((p) => Boolean(p.etag)) ? parts : undefined;

    const data = await deps.complete({
      userId,
      uploadId,
      key,
      ...(partsForJava ? { parts: partsForJava } : {}),
    });

    return {
      ok: true,
      data: {
        success: Boolean(data.success),
        bucket: data.bucket,
        key: data.key || key,
        keyV: data.keyV || MULTIPART_KEY_V,
        fileId: data.fileId || keyCheck.fileId,
        publicUrl: data.downloadUrl,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'failed' };
  }
}

export type AbortOut = { success: boolean };

export async function gatewayAbort(
  userId: string,
  body: unknown,
  deps: {
    abort: (args: {
      userId: string;
      uploadId: string;
      key: string;
    }) => Promise<{ success: boolean }>;
  }
): Promise<GatewayResult<AbortOut>> {
  const b = (body || {}) as { uploadId?: string; key?: string };
  const uploadId = b.uploadId?.trim();
  const key = b.key?.trim();
  if (!uploadId || !key) return { ok: false, error: 'uploadId and key are required' };

  const keyCheck = validateMultipartKeyForUser(key, userId);
  if (!keyCheck.ok) return { ok: false, error: keyCheck.error };

  const data = await deps.abort({ userId, uploadId, key });
  return { ok: true, data: { success: Boolean(data.success) } };
}

export type ListPartsOut = { parts: Array<{ partNumber: number; etag: string }> };

export async function gatewayListParts(
  userId: string,
  body: unknown,
  deps: {
    listParts: (args: {
      userId: string;
      uploadId: string;
      key: string;
    }) => Promise<{ parts: Array<{ partNumber: number; etag: string }> }>;
  }
): Promise<GatewayResult<ListPartsOut>> {
  const b = (body || {}) as { uploadId?: string; key?: string };
  const uploadId = b.uploadId?.trim();
  const key = b.key?.trim();
  if (!uploadId || !key) return { ok: false, error: 'uploadId and key are required' };

  const keyCheck = validateMultipartKeyForUser(key, userId);
  if (!keyCheck.ok) return { ok: false, error: keyCheck.error };

  const data = await deps.listParts({ userId, uploadId, key });
  const parts = (data.parts || [])
    .map((p) => ({
      partNumber: Number(p.partNumber),
      etag: typeof p.etag === 'string' ? p.etag.replace(/"/g, '').trim() : '',
    }))
    .filter((p) => Number.isInteger(p.partNumber) && p.partNumber > 0)
    .sort((a, b) => a.partNumber - b.partNumber);

  return { ok: true, data: { parts } };
}

