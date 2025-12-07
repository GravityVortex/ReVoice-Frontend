import { respData, respErr } from '@/shared/lib/resp';
import { getAllVtSystemConfigs, getSystemLimitByConfigKeyArr} from '@/shared/models/vt_system_config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // const list = await getAllVtSystemConfigs();

    const idArr = [
    'limit.guest.file_size_mb',
    'limit.registered.file_size_mb',
    'limit.monthly.file_size_mb',
    'limit.yearly.file_size_mb',
    'credit.points_per_minute'
  ]
    const list = await getSystemLimitByConfigKeyArr();
    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
