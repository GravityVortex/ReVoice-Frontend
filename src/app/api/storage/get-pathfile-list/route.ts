import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { getConfig, getFileList } from '@/extensions/storage/privateR2Util';
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
    const r2Path = searchParams.get('r2Path') || '';

    const fileList = await getFileList(r2Path);
    const bucketName = await getConfig().then((res) => res.bucketName);

    return respData({ fileList, r2Path, bucketName });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
