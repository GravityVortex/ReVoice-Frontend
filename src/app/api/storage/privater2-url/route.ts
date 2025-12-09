import {respData, respErr} from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';
import {GetObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { getAuth } from '@/core/auth';
import { headers } from 'next/headers';

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
    // const storageService = await getStorageService();
    // const provider = storageService.getProvider('r2');
    // if (!provider || provider.name !== 'r2') {
    //   return NextResponse.json({error: 'R2 not configured'}, {status: 500});
    // }
    // 获得r2的配置信息
    // const r2Config = (provider as any).configs;
    // 多个存储桶公用一个
    const endpoint = 'https://a611f60c1436512acfe03a1efe79a50a.r2.cloudflarestorage.com';
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: '8c8b2be18e4795250df389d2e7cbaa2b',// 每个存储桶单独id
        secretAccessKey: '114e0ccba3a492c6e8f76c0b057f554b8b5808d34f22bf35bfa86af0765b6d15',// 每个存储桶单独secret
      },
      forcePathStyle: false,
    });

    const command = new GetObjectCommand({
      Bucket: 'zhesheng',// 存储桶名称
      Key: key,
    });
    // 获取访问预览url
    const url = await getSignedUrl(client, command, {expiresIn: 3600});
    // console.log('Generated presigned URL--->', url);

    return respData({url});
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
