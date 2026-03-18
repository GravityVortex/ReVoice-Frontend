import { pySplitAudio } from '@/shared/services/pythonService';

export type AudioSplitResult = {
  leftPath: string;
  leftDuration: number;
  rightPath: string;
  rightDuration: number;
};

export async function splitAudioFile(args: {
  taskId: string;
  userId: string;
  audioR2Key: string;
  splitAtMs: number;
  clipStartMs: number;
  clipEndMs: number;
  leftOutputKey: string;
  rightOutputKey: string;
  backupKey?: string;
}): Promise<AudioSplitResult | null> {
  try {
    const result = await pySplitAudio(
      args.taskId,
      args.userId,
      args.audioR2Key,
      args.splitAtMs,
      args.clipStartMs,
      args.clipEndMs,
      args.leftOutputKey,
      args.rightOutputKey,
      args.backupKey,
    );
    return {
      leftPath: result.left_path,
      leftDuration: result.left_duration,
      rightPath: result.right_path,
      rightDuration: result.right_duration,
    };
  } catch (e) {
    console.warn('[splitAudioFile] audio split failed, degrading gracefully:', e);
    return null;
  }
}
