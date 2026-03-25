import EncryptionUtil from '@/shared/lib/EncryptionUtil';
import { JAVA_SERVER_BASE_URL } from '@/shared/cache/system-config';

const JAVA_FETCH_TIMEOUT_MS = 30_000; // 30s — fail fast before Cloudflare's 100s gateway limit

type JavaApiResponse<T> = {
  code: number;
  message?: string;
  data: T;
};

async function postJavaEncrypted<T>(
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const body = EncryptionUtil.encryptRequest({ ...payload });

  const res = await fetch(`${JAVA_SERVER_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body,
    signal: AbortSignal.timeout(JAVA_FETCH_TIMEOUT_MS),
  }).catch((err: Error) => {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`Java backend timeout after ${JAVA_FETCH_TIMEOUT_MS / 1000}s: ${path}`);
    }
    throw new Error(`Java backend unreachable: ${path} — ${err.message}`);
  });

  const text = await res.text();
  let json: JavaApiResponse<T> | undefined;
  try {
    json = JSON.parse(text) as JavaApiResponse<T>;
  } catch {
    // Keep error message short; the full body could be HTML or contain noise.
  }

  if (!res.ok) {
    const msg =
      json?.message || `Java request failed (${res.status} ${res.statusText})`;
    throw new Error(msg);
  }

  if (!json || typeof json.code !== 'number') {
    throw new Error('Invalid Java response');
  }

  if (json.code !== 200) {
    throw new Error(json.message || `Java request failed (${json.code})`);
  }

  return json.data;
}

export type JavaMultipartInitiateData = {
  uploadId: string;
  fileId: string;
  bucket: string;
  keyV: string;
  key: string;
};

export async function javaR2MultipartInitiate(args: {
  userId: string;
  filename: string;
  contentType?: string;
}): Promise<JavaMultipartInitiateData> {
  return postJavaEncrypted('/api/nextjs/r2/multipart/initiate', args);
}

export type JavaMultipartPresignPartData = {
  partNumber: number;
  url: string;
};

export async function javaR2MultipartPresignPart(args: {
  userId: string;
  uploadId: string;
  key: string;
  partNumber: number;
  expiresInSeconds?: number;
}): Promise<JavaMultipartPresignPartData> {
  return postJavaEncrypted('/api/nextjs/r2/multipart/presign-part', args);
}

export type JavaMultipartCompleteData = {
  success: boolean;
  bucket: string;
  key: string;
  keyV: string;
  fileId: string;
  downloadUrl: string;
};

export async function javaR2MultipartComplete(args: {
  userId: string;
  uploadId: string;
  key: string;
  parts?: Array<{ partNumber: number; etag: string }>;
}): Promise<JavaMultipartCompleteData> {
  return postJavaEncrypted('/api/nextjs/r2/multipart/complete', args);
}

export type JavaMultipartAbortData = {
  success: boolean;
};

export async function javaR2MultipartAbort(args: {
  userId: string;
  uploadId: string;
  key: string;
}): Promise<JavaMultipartAbortData> {
  return postJavaEncrypted('/api/nextjs/r2/multipart/abort', args);
}

export type JavaMultipartListPartsData = {
  parts: Array<{ partNumber: number; etag: string }>;
};

export async function javaR2MultipartListParts(args: {
  userId: string;
  uploadId: string;
  key: string;
}): Promise<JavaMultipartListPartsData> {
  return postJavaEncrypted('/api/nextjs/r2/multipart/list-parts', args);
}
