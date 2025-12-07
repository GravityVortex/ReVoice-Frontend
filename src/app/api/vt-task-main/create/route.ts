import { respData, respErr } from '@/shared/lib/resp';
import { insertVtTaskMain } from '@/shared/models/vt_task_main';
import { getUuid } from '@/shared/lib/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      originalFileId,
      status = 'pending',
      priority = 3,
      progress = 0,
      currentStep,
      sourceLanguage,
      targetLanguage,
      speakerCount,
      processDurationSeconds,
      errorMessage,
      startedAt,
      completedAt,
      createdBy,
    } = body;

    if (!userId || !originalFileId || !sourceLanguage || !targetLanguage || !speakerCount || !createdBy) {
      return respErr('Missing required fields');
    }

    const result = await insertVtTaskMain({
      id: getUuid(),
      userId,
      originalFileId,
      status,
      priority,
      progress,
      currentStep,
      sourceLanguage,
      targetLanguage,
      speakerCount,
      processDurationSeconds,
      errorMessage,
      startedAt,
      completedAt,
      createdBy,
      updatedBy: createdBy,
    });

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
