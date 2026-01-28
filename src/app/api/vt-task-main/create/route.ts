import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { insertVtTaskMain } from '@/shared/models/vt_task_main';
import { getUuid } from '@/shared/lib/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const {
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
    } = body;

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

    const result = await insertVtTaskMain({
      id: getUuid(),
      userId: user.id,
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
      createdBy: user.id,
      updatedBy: user.id,
    });

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
