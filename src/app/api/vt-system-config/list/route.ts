import { respData, respErr } from '@/shared/lib/resp';
import { getSystemLimitByConfigKeyArr } from '@/shared/models/vt_system_config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await getSystemLimitByConfigKeyArr();
    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
