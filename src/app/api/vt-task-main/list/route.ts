import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { getVtTaskMainList, getVtTaskMainTotal } from '@/shared/models/vt_task_main';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const requestedUserId = searchParams.get('userId') || '';

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    let userId = user.id;
    if (requestedUserId && requestedUserId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
      userId = requestedUserId;
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
