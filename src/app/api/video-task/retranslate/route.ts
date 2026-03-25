import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr, respJson } from '@/shared/lib/resp';
import { consumeCredits, hasActivePromoEntitlement, refundCredits } from '@/shared/models/credit';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import {
  findVtTaskMainById,
  getVtTaskMainListByFileIds,
  insertVtTaskMain,
} from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETRANSLATABLE_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);

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

    const existingTaskId = (body?.existingTaskId as string) || '';
    if (!existingTaskId) {
      return respErr('Missing existingTaskId');
    }

    const oldTask = await findVtTaskMainById(existingTaskId);
    if (!oldTask) {
      return respErr('task not found');
    }
    if (oldTask.userId !== user.id) {
      return respErr('no permission');
    }

    if (!RETRANSLATABLE_STATUSES.has(oldTask.status)) {
      return respErr('task is still in progress, please wait for it to finish');
    }

    const { originalFileId, sourceLanguage, targetLanguage, speakerCount } = oldTask;
    if (!originalFileId || !sourceLanguage || !targetLanguage || !speakerCount) {
      return respErr('old task is missing required fields');
    }

    const file = await findVtFileOriginalById(originalFileId);
    if (!file) {
      return respErr('original file not found');
    }

    const durationSeconds = file.videoDurationSeconds || 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return respErr('invalid videoDurationSeconds');
    }

    // Block if there is already a pending/processing task for the same language pair.
    const existingTasks = await getVtTaskMainListByFileIds([originalFileId], user.id);
    const inProgress = existingTasks.find(
      (t) =>
        t.sourceLanguage === sourceLanguage &&
        t.targetLanguage === targetLanguage &&
        IN_PROGRESS_STATUSES.has(t.status),
    );
    if (inProgress) {
      return respJson(-1, 'A translation task is already in progress', { existingTaskId: inProgress.id });
    }

    const pointsPerMinuteRaw = (await getSystemConfigByKey('credit.points_per_minute')) || '3';
    const pointsPerMinute = Number.parseInt(pointsPerMinuteRaw, 10);
    const durationInMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const credits = durationInMinutes * (Number.isFinite(pointsPerMinute) && pointsPerMinute > 0 ? pointsPerMinute : 3);

    let creditRecord: any;
    try {
      creditRecord = await consumeCredits({
        userId: user.id,
        credits,
        scene: 'retranslate_video',
        description: '重新翻译任务消耗积分',
        metadata: JSON.stringify({
          credits,
          durationInMinutes,
          originalFileId,
          sourceLanguage,
          targetLanguage,
          previousTaskId: existingTaskId,
        }),
      });
    } catch (e: any) {
      return respErr(e?.message || '积分不足');
    }

    try {
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
      await refundCredits({ creditId: creditRecord.id }).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('[retranslate] failed:', e);
    return respErr('failed');
  }
}
