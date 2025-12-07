import { respData, respErr } from '@/shared/lib/resp';
import { insertVtTaskSubtitle } from '@/shared/models/vt_task_subtitle';
import { getUuid } from '@/shared/lib/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, userId, stepName, subtitleData, subtitleFormat, language } = body;

    if (!taskId || !userId || !stepName || !subtitleData) {
      return respErr('Missing required fields');
    }

    const result = await insertVtTaskSubtitle({
      id: getUuid(),
      taskId,
      userId,
      stepName,
      subtitleData,
      subtitleFormat,
      language,
      createdBy: userId,
      updatedBy: userId,
    });

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
