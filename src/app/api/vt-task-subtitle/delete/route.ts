import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskSubtitleById, updateVtTaskSubtitle } from '@/shared/models/vt_task_subtitle';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return respErr('id is required');
    }

    const subtitle = await findVtTaskSubtitleById(id);
    if (!subtitle) {
      return respErr('Subtitle not found');
    }
    if (subtitle.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const result = await updateVtTaskSubtitle(id, {
      delStatus: 1,
      updatedBy: user.id,
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
