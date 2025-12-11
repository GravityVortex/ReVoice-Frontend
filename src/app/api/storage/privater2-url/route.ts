import {respData, respErr} from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';
import {GetObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { getAuth } from '@/core/auth';
import { headers } from 'next/headers';
import { getPrivateR2SignUrl } from '@/extensions/storage/privateR2Util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return respErr('Unauthorized');
    }

    const {searchParams} = new URL(request.url);
    // temp_test/test3.mp4
    const key = searchParams.get('key');

    if (!key) {
      return respErr('key is required');
    }
    // TODO: 调用java接口获取私桶中文件访问url
    // ...

    // const storageService = await getStorageService();
    // const provider = storageService.getProvider('r2');
    // if (!provider || provider.name !== 'r2') {
    //   return NextResponse.json({error: 'R2 not configured'}, {status: 500});
    // }
    // 获得r2的配置信息
    // const r2Config = (provider as any).configs;
    // 多个存储桶公用一个
    const url = await getPrivateR2SignUrl(key, 3600);
    // console.log('Generated presigned URL--->', url);

    return respData({url});
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
