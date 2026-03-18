import { randomUUID } from 'crypto';

import { respData, respErr } from '@/shared/lib/resp';
import { findVtTaskSubtitleByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { splitSubtitlePayload, buildSplitChildIds } from '@/shared/lib/timeline/split';
import { splitAudioFile } from '@/shared/lib/timeline/split-audio';
import { replaceSubtitleDataAndLogTx } from '@/shared/models/vt_edit_operation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MIN_SPLIT_GAP_MS = 200;

function normalizeSubtitleArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function srtTimeToMs(srt: string) {
  const [hms, msStr] = String(srt || '00:00:00,000').split(',');
  const [h, m, s] = hms.split(':').map((part) => Number(part || 0));
  return (((h * 60 + m) * 60 + s) * 1000) + Number(msStr || 0);
}

function resolveSourceParentAudioUrl(clip: any): string {
  if (!clip) return '';
  const audioUrl = typeof clip.audio_url === 'string' ? clip.audio_url.trim() : '';
  if (audioUrl) return audioUrl;
  const id = typeof clip.id === 'string' ? clip.id : '';
  return id ? `split_audio/audio/${id}.wav` : '';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const clipId = typeof body?.clipId === 'string' ? body.clipId : '';
    const splitAtMsRaw = body?.splitAtMs;
    const effectiveConvertText = typeof body?.effectiveConvertText === 'string' ? body.effectiveConvertText : '';

    const user = await getUserInfo();
    if (!user) return respErr('no auth, please sign in');

    if (!taskId || !clipId || !Number.isFinite(splitAtMsRaw) || typeof body?.effectiveConvertText !== 'string') {
      return respErr('missing required parameters');
    }

    const splitAtMs = Math.max(0, Math.round(Number(splitAtMsRaw)));
    const task = await findVtTaskMainById(taskId);
    if (!task) return respErr('task not found');
    if (task.userId !== user.id) return respErr('no permission');

    const translateRow = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'translate_srt');
    const sourceRow = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'gen_srt');
    if (!translateRow || !sourceRow) return respErr('subtitle not found');

    const translate = normalizeSubtitleArray((translateRow as any).subtitleData);
    const source = normalizeSubtitleArray((sourceRow as any).subtitleData);
    const clip = translate.find((row) => row?.id === clipId);
    if (!clip) return respErr('clip not found');

    const splitIndex = translate.indexOf(clip);
    const sourceClip = source[splitIndex];
    if (!sourceClip) return respErr('source clip not found');

    const clipStartMs = srtTimeToMs(String(clip?.start || '00:00:00,000'));
    const clipEndMs = srtTimeToMs(String(clip?.end || '00:00:00,000'));
    if (splitAtMs - clipStartMs < MIN_SPLIT_GAP_MS || clipEndMs - splitAtMs < MIN_SPLIT_GAP_MS) {
      return respErr('split point too close to boundary');
    }

    // Step 1: Snapshot pre-split data
    const snapshotTranslate = JSON.parse(JSON.stringify(translate));
    const snapshotSource = JSON.parse(JSON.stringify(source));

    // Step 2: Resolve parent source audio path (only source/original audio is split)
    const parentSourceAudioUrl = resolveSourceParentAudioUrl(sourceClip);
    const splitOperationId = randomUUID();

    // Step 3: Pre-compute child IDs
    const sourceChildIds = buildSplitChildIds({
      id: sourceClip.id,
      leftStartMs: clipStartMs,
      leftEndMs: splitAtMs,
      rightStartMs: splitAtMs,
      rightEndMs: clipEndMs,
    });

    // Step 4: Guard — check source audio status before attempting split
    const canSplitSourceAudio = parentSourceAudioUrl
      && sourceClip.vap_source_segment_missing !== true;

    // Step 5: Attempt source audio splitting (graceful degradation)
    let sourceAudioSplit: Awaited<ReturnType<typeof splitAudioFile>> = null;

    if (canSplitSourceAudio) {
      try {
        sourceAudioSplit = await splitAudioFile({
          taskId,
          userId: user.id,
          audioR2Key: parentSourceAudioUrl,
          splitAtMs,
          clipStartMs,
          clipEndMs,
          leftOutputKey: `split_audio/audio/${sourceChildIds.left}.wav`,
          rightOutputKey: `split_audio/audio/${sourceChildIds.right}.wav`,
        });
      } catch (e) {
        console.warn('[split-subtitle] source audio split failed:', e);
      }
    }

    // Step 6: Call pure function (translate children always need re-TTS)
    const nowMs = Date.now();
    const result = splitSubtitlePayload({
      clipId,
      splitAtMs,
      effectiveConvertText,
      splitOperationId,
      nowMs,
      translate,
      source,
      sourceAudioSplit,
    });

    // Step 7: Atomic write — subtitle data + operation log in one transaction
    await replaceSubtitleDataAndLogTx(taskId, {
      translate: result.translate,
      source: result.source,
    }, {
      id: randomUUID(),
      taskId,
      userId: user.id,
      operationType: 'split',
      operationId: splitOperationId,
      snapshotTranslate,
      snapshotSource,
      operationDetail: {
        clipId,
        splitAtMs,
        effectiveConvertText,
        parentSourceAudioUrl,
        audioSplitSuccess: !!sourceAudioSplit,
      },
      audioSnapshot: {
        source_audio: parentSourceAudioUrl ? {
          parentId: sourceClip.id,
          r2Key: parentSourceAudioUrl,
          backupR2Key: `edit_backup/op_${splitOperationId}/source_${sourceClip.id}.wav`,
        } : null,
      },
      resultDetail: {
        newIds: result.newIds,
        splitIndex: result.splitIndex,
        pendingVoiceIds: result.pendingVoiceIds,
      },
      createdBy: user.id,
    });

    // Step 8: Return result
    return respData({
      translate: result.translate,
      source: result.source,
      newIds: result.newIds,
      splitIndex: result.splitIndex,
      splitOperationId,
      pendingVoiceIds: result.pendingVoiceIds,
      audioSplitSuccess: !!sourceAudioSplit,
    });
  } catch (error) {
    console.error('split subtitle failed:', error);
    return respErr('split subtitle failed');
  }
}
