import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById, updateVtFileOriginal } from '@/shared/models/vt_file_original';
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
    const { id, ...updateData } = body;

    if (!id) {
      return respErr('id is required');
    }

    const file = await findVtFileOriginalById(id);
    if (!file) {
      return respErr('File not found');
    }
    if (file.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const result = await updateVtFileOriginal(id, {
      ...updateData,
      updatedBy: user.id,
      updatedAt: new Date(),
    });

    if (!result) {
      return respErr('File not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
