import { respData, respErr } from '@/shared/lib/resp';
import { getSystemConfigs } from '@/shared/cache/system-config';
import { getUserInfo } from '@/shared/models/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // 获取缓存中配置
    const list = await getSystemConfigs();
    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
