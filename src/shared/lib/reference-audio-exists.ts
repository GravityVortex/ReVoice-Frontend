import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { findVtFileTaskByTaskIdAndR2Key } from '@/shared/models/vt_file_task';
import { getPreSignedUrl } from '@/shared/services/javaService';

type ProbeStorage = 'public_url' | 'presigned_url';
type MissingReason =
  | 'db_record_missing'
  | 'public_base_url_missing'
  | 'presigned_missing'
  | 'object_missing';

export type TaskFileExistsResult =
  | {
      exists: true;
      status: number;
      path: string;
      url: string;
      storage: ProbeStorage;
      r2Key: string;
      r2Bucket: string;
    }
  | {
      exists: false;
      path: string;
      reason: MissingReason;
      status?: number;
      url?: string;
      storage?: ProbeStorage;
      r2Key?: string;
      r2Bucket?: string;
    };

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function resolveRuntimeEnv() {
  return trimString(process.env.ENV) || 'dev';
}

function isPublicBucketName(bucket: string, configuredPublicBucket: string) {
  if (bucket && configuredPublicBucket) return bucket === configuredPublicBucket;
  return /(^|[-_])public($|[-_])/.test(bucket);
}

async function probeObjectUrl(url: string) {
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Range: 'bytes=0-0',
    },
    signal: AbortSignal.timeout(10_000),
  });
  try {
    await resp.body?.cancel();
  } catch {
    // ignore stream cancel failures; existence already determined by status code
  }
  return {
    status: resp.status,
    exists: resp.ok || resp.status === 206,
  };
}

export async function checkTaskFileExists(args: {
  taskId: string;
  userId: string;
  r2Key: string;
}): Promise<TaskFileExistsResult> {
  const path = `${args.userId}/${args.taskId}/${args.r2Key}`;
  const r2Key = trimString(args.r2Key);
  const fileRow = await findVtFileTaskByTaskIdAndR2Key(args.taskId, r2Key);

  if (!fileRow) {
    return {
      exists: false,
      reason: 'db_record_missing',
      path,
      r2Key,
    };
  }

  const r2Bucket = trimString((fileRow as any)?.r2Bucket);
  const publicBucket = trimString(await getSystemConfigByKey('r2.bucket.public'));
  const isPublic = isPublicBucketName(r2Bucket, publicBucket);

  if (isPublic) {
    const publicBaseUrl = trimString(await getSystemConfigByKey('r2.public.base_url'));
    if (!publicBaseUrl) {
      return {
        exists: false,
        reason: 'public_base_url_missing',
        path,
        r2Key,
        r2Bucket,
      };
    }

    const url = `${trimTrailingSlash(publicBaseUrl)}/${resolveRuntimeEnv()}/${args.userId}/${args.taskId}/${r2Key}`;
    const result = await probeObjectUrl(url);
    if (result.exists) {
      return {
        exists: true,
        status: result.status,
        path,
        url,
        storage: 'public_url',
        r2Key,
        r2Bucket,
      };
    }
    return {
      exists: false,
      reason: 'object_missing',
      status: result.status,
      path,
      url,
      storage: 'public_url',
      r2Key,
      r2Bucket,
    };
  }

  const [signed] = await getPreSignedUrl(
    [{ path, operation: 'download', expirationMinutes: 5 }],
    { forceRefresh: true }
  );
  const url = typeof signed?.url === 'string' ? signed.url : '';
  if (!url) {
    return {
      exists: false,
      reason: 'presigned_missing',
      path,
      r2Key,
      r2Bucket,
    };
  }

  const result = await probeObjectUrl(url);
  if (result.exists) {
    return {
      exists: true,
      status: result.status,
      path,
      url,
      storage: 'presigned_url',
      r2Key,
      r2Bucket,
    };
  }

  return {
    exists: false,
    reason: 'object_missing',
    status: result.status,
    path,
    url,
    storage: 'presigned_url',
    r2Key,
    r2Bucket,
  };
}

export async function checkReferenceAudioExists(args: {
  taskId: string;
  userId: string;
  referenceSubtitleName: string;
}): Promise<TaskFileExistsResult> {
  return await checkTaskFileExists({
    taskId: args.taskId,
    userId: args.userId,
    r2Key: `split_audio/audio/${args.referenceSubtitleName}.wav`,
  });
}
