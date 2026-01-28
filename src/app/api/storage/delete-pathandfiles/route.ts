import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { deletePathAndFiles } from '@/extensions/storage/privateR2Util';
import { respData, respErr } from '@/shared/lib/resp';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return respErr('Unauthorized');
    }
    const isAdmin = await hasPermission(session.user.id, 'admin.access');
    if (!isAdmin) {
      return respErr('Forbidden');
    }

    const { searchParams } = new URL(request.url);
    // temp_test/test3.mp4
    const r2Path = searchParams.get('r2Path');
    if (!r2Path) {
      return respErr('r2Path is required');
    }

    // 删除R2指定路径及其下所有文件
    await deletePathAndFiles(r2Path);

    return respData({ r2Path });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
