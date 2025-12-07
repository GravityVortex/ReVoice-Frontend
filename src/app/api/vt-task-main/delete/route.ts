import { respData, respErr } from '@/shared/lib/resp';
import { updateVtTaskMain } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, updatedBy } = body;

    if (!id || !updatedBy) {
      return respErr('id and updatedBy are required');
    }

    const result = await updateVtTaskMain(id, {
      delStatus: 1,
      updatedBy,
      updatedAt: new Date(),
    });

    if (!result) {
      return respErr('Task not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
