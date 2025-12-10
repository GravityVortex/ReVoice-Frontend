import { respData, respErr } from '@/shared/lib/resp';
import { getVtFileFinalListByTaskId } from '@/shared/models/vt_file_final';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || '';

    if (!taskId) {
      return respErr('taskId is required');
    }

    const list = await getVtFileFinalListByTaskId(taskId);

    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
