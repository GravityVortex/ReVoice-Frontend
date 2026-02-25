// Multipart Upload API - ListParts (Gateway)
// Browser -> Next.js (wrapper JSON) -> Java (encrypted text/plain)

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { javaR2MultipartListParts } from '@/shared/services/javaR2Multipart';
import { gatewayListParts } from '@/app/api/storage/multipart/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const result = await gatewayListParts(user.id, body, {
      listParts: javaR2MultipartListParts,
    });
    if (!result.ok) return respErr(result.error);
    return respData(result.data);
  } catch (e: any) {
    console.error('multipart list-parts failed:', e);
    return respErr(e?.message || 'failed');
  }
}
