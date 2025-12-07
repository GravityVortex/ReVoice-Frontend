import { respData, respErr } from '@/shared/lib/resp';
import { getVtTaskMainList, getVtTaskMainTotal } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const userId = searchParams.get('userId') || '';

    if (!userId) {
      return respErr('userId is required');
    }

    const list = await getVtTaskMainList(userId, page, limit);
    const totalCount = await getVtTaskMainTotal(userId);
    const totalPages = Math.ceil(totalCount / limit);

    return respData({
      list,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
