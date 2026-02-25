import { headers } from 'next/headers';

import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/shared/lib/resp';
import { getPreSignedUrl, SignUrlItem } from '@/shared/services/javaService';
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

    const { searchParams } = new URL(request.url);
    // temp_test/test3.mp4
    const key = searchParams.get('key');
    const timeoutRaw = Number.parseInt(searchParams.get('timeOut') || '', 10);
    const timeOutSeconds = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 3600;

    if (!key) {
      return respErr('key is required');
    }
    if (key.includes('..') || key.startsWith('/')) {
      return respErr('invalid key');
    }
    const ownerUserId = key.split('/')[0] || '';
    if (!ownerUserId) {
      return respErr('invalid key');
    }
    // Allow admins to inspect/sign another user's private media.
    if (ownerUserId !== session.user.id) {
      const isAdmin = await hasPermission(session.user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('Forbidden');
      }
    }
    // Always sign via Java (centralized control-plane).
    const expirationMinutes = Math.max(1, Math.min(24 * 60, Math.ceil(timeOutSeconds / 60)));
    const params: SignUrlItem[] = [{ path: key, operation: 'download', expirationMinutes }];
    const resUrlArr = await getPreSignedUrl(params);
    const url = resUrlArr[0].url;

    return respData({ url });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
