import { respData, respErr } from '@/shared/lib/resp';
import { getVtFileTaskList } from '@/shared/models/vt_file_task';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || undefined;
    const stepName = searchParams.get('stepName') || undefined;
    const userId = searchParams.get('userId') || undefined;

    const list = await getVtFileTaskList({ taskId, stepName, userId });

    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
