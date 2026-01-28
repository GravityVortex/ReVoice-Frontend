import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return respErr('id is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const result = await findVtFileOriginalById(id);

    if (!result) {
      return respErr('File not found');
    }
    if (result.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
