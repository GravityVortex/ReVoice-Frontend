// Multipart Upload API - Presign Part (Gateway)
// Browser -> Next.js (wrapper JSON) -> Java (encrypted text/plain)

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { javaR2MultipartPresignPart } from '@/shared/services/javaR2Multipart';
import { gatewayPresignPart } from '@/app/api/storage/multipart/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const result = await gatewayPresignPart(user.id, body, {
      presignPart: javaR2MultipartPresignPart,
    });
    if (!result.ok) return respErr(result.error);
    return respData(result.data);
  } catch (e: any) {
    console.error('multipart presign-part failed:', e);
    return respErr(e?.message || 'failed');
  }
}
