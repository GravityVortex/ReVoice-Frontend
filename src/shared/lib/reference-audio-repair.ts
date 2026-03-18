import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { checkTaskFileExists, type TaskFileExistsResult } from '@/shared/lib/reference-audio-exists';
import { javaR2CoverWriteFile } from '@/shared/services/javaService';

type MissingTarget = Extract<TaskFileExistsResult, { exists: false }>;
type ExistingTarget = Extract<TaskFileExistsResult, { exists: true }>;

type RepairStatus =
  | 'already_exists'
  | 'repaired'
  | 'source_missing'
  | 'bucket_missing'
  | 'copy_failed'
  | 'target_still_missing';

export type RepairReferenceAudioResult =
  | {
      status: 'already_exists' | 'repaired';
      target: ExistingTarget;
      source?: ExistingTarget;
    }
  | {
      status: Exclude<RepairStatus, 'already_exists' | 'repaired'>;
      target: MissingTarget;
      source?: TaskFileExistsResult;
      bucket?: string;
      copyResult?: unknown;
    };

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSuccessResponse(result: unknown) {
  return typeof result === 'object' && result !== null && (result as any).code === 200;
}

export async function repairReferenceAudio(args: {
  taskId: string;
  userId: string;
  referenceSubtitleName: string;
}): Promise<RepairReferenceAudioResult> {
  const splitR2Key = `split_audio/audio/${args.referenceSubtitleName}.wav`;
  const adjustedR2Key = `adj_audio_time/${args.referenceSubtitleName}.wav`;

  const target = await checkTaskFileExists({
    taskId: args.taskId,
    userId: args.userId,
    r2Key: splitR2Key,
  });
  if (target.exists) {
    return {
      status: 'already_exists',
      target,
    };
  }

  const source = await checkTaskFileExists({
    taskId: args.taskId,
    userId: args.userId,
    r2Key: adjustedR2Key,
  });
  if (!source.exists) {
    return {
      status: 'source_missing',
      target,
      source,
    };
  }

  const bucket =
    trimString(target.r2Bucket) ||
    trimString(source.r2Bucket) ||
    trimString(await getSystemConfigByKey('r2.bucket.public'));
  if (!bucket) {
    return {
      status: 'bucket_missing',
      target,
      source,
    };
  }

  const sourcePath = `${args.userId}/${args.taskId}/${adjustedR2Key}`;
  const targetPath = `${args.userId}/${args.taskId}/${splitR2Key}`;
  const copyResult = await javaR2CoverWriteFile(sourcePath, targetPath, bucket);
  if (!isSuccessResponse(copyResult)) {
    return {
      status: 'copy_failed',
      target,
      source,
      bucket,
      copyResult,
    };
  }

  const targetAfter = await checkTaskFileExists({
    taskId: args.taskId,
    userId: args.userId,
    r2Key: splitR2Key,
  });
  if (!targetAfter.exists) {
    return {
      status: 'target_still_missing',
      target: targetAfter,
      source,
      bucket,
      copyResult,
    };
  }

  return {
    status: 'repaired',
    target: targetAfter,
    source,
  };
}
