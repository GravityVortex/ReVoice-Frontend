import { respData, respErr } from '@/shared/lib/resp';
import { updateVtTaskSubtitle } from '@/shared/models/vt_task_subtitle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, userId } = body;

    if (!id || !userId) {
      return respErr('id and userId are required');
    }

    const result = await updateVtTaskSubtitle(id, {
      delStatus: 1,
      updatedBy: userId,
      updatedAt: new Date(),
    });

    if (!result) {
      return respErr('Subtitle not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
