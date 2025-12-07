import { respData, respErr } from '@/shared/lib/resp';
import { findVtSystemConfigByKey } from '@/shared/models/vt_system_config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

//http://localhost:3000/api/vt-system-config/detail?configKey=credit.points_per_minute
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const configKey = searchParams.get('configKey');

    if (!configKey) {
      return respErr('configKey is required');
    }

    const result = await findVtSystemConfigByKey(configKey);

    if (!result) {
      return respErr('Config not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
