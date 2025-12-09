import { respData, respErr } from '@/shared/lib/resp';
import { getSystemConfigs } from '@/shared/cache/system-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 获取缓存中配置
    const list = await getSystemConfigs();
    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
