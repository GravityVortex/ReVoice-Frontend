import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr, respJson } from '@/shared/lib/resp';
import { consumeCredits, hasActivePromoEntitlement, refundCredits } from '@/shared/models/credit';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds, insertVtTaskMain } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NON_BLOCKING_STATUSES = new Set(['failed', 'cancelled']);

function isBlockingStatus(status: string | undefined | null) {
  if (!status) return true;
  return !NON_BLOCKING_STATUSES.has(status);
}

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const originalFileId = (body?.originalFileId as string) || '';
    const sourceLanguage = (body?.sourceLanguage as string) || '';
    const targetLanguage = (body?.targetLanguage as string) || '';
    const speakerCount = (body?.speakerCount as string) || '';

    if (!originalFileId || !sourceLanguage || !targetLanguage || !speakerCount) {
      return respErr('Missing required fields');
    }

    const file = await findVtFileOriginalById(originalFileId);
    if (!file) {
      return respErr('original file not found');
    }
    if (file.userId !== user.id) {
      return respErr('no permission');
    }

    const durationSeconds = file.videoDurationSeconds || 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return respErr('invalid videoDurationSeconds');
    }

    // Server-side dedupe: same source+target can only exist once per original video,
    // except failed/cancelled runs (those do not block re-creation).
    const existingTasks = await getVtTaskMainListByFileIds([originalFileId], user.id);
    const dup = existingTasks.find(
      (t) =>
        t.sourceLanguage === sourceLanguage &&
        t.targetLanguage === targetLanguage &&
        isBlockingStatus(t.status)
    );
    if (dup) {
      return respJson(-1, 'Duplicate language-pair run already exists', { existingTaskId: dup.id });
    }

    // Don't trust client credits; derive from duration + server config.
    const pointsPerMinuteRaw = (await getSystemConfigByKey('credit.points_per_minute')) || '3';
    const pointsPerMinute = Number.parseInt(pointsPerMinuteRaw, 10);
    const durationInMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const credits = durationInMinutes * (Number.isFinite(pointsPerMinute) && pointsPerMinute > 0 ? pointsPerMinute : 3);

    let creditRecord: any;
    try {
      creditRecord = await consumeCredits({
        userId: user.id,
        credits,
        scene: 'convert_video',
        description: '视频转换任务消耗积分',
        metadata: JSON.stringify({
          credits,
          durationInMinutes,
          originalFileId,
          sourceLanguage,
          targetLanguage,
        }),
      });
    } catch (e: any) {
      return respErr(e?.message || '积分不足');
    }

    try {
      // Keep scheduling consistent with the main create endpoint.
      let priority = 4;
      const sub = await getCurrentSubscription(user.id).catch(() => undefined);
      const hasPromo = await hasActivePromoEntitlement(user.id).catch(() => false);
      if (sub || hasPromo) {
        priority = 2;
      }

      const taskMain = await insertVtTaskMain({
        id: getUuid(),
        userId: user.id,
        originalFileId,
        status: 'pending',
        priority,
        sourceLanguage,
        targetLanguage,
        speakerCount,
        processDurationSeconds: durationSeconds,
        creditId: creditRecord.id,
        creditsConsumed: credits,
        createdBy: user.id,
        updatedBy: user.id,
      });

      return respData(taskMain);
    } catch (e) {
      // If we have already charged credits but failed to create records, refund best-effort.
      await refundCredits({ creditId: creditRecord.id }).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}

