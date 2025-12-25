import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { R2Provider } from '@/extensions/storage';
import { getPrivateR2DownLoadSignUrl } from '@/extensions/storage/privateR2Util';
import { USE_JAVA_REQUEST } from '@/shared/cache/system-config';
import { getUserInfo } from '@/shared/models/user';
import { getPreSignedUrl, SignUrlItem } from '@/shared/services/javaService';
import { getStorageService } from '@/shared/services/storage';

/**
 * 下载音频
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    const expiresInParam = searchParams.get('expiresIn');
    const taskId = searchParams.get('taskId');

    const user = await getUserInfo();

    if (!key) {
      return NextResponse.json({ code: -1, message: '缺少 key 或 bucket 参数' }, { status: 400 });
    }

    // 解析过期时间（默认 1 小时）
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;
    // 计算实际过期时间
    let downloadUrl;

    // DOEND: 调用java获取视频下载签名地址
    if (USE_JAVA_REQUEST) {
      // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
      // let env = process.env.ENV || 'dev';
      // 合成的原视频
      // const keyTemp = `${user?.id}/${taskId}/merge_audio_video/video/video_new.mp4`;
      const params: SignUrlItem[] = [
        { path: key, operation: 'download', expirationMinutes: expiresIn / 60 }, // 无声视频
      ];
      const resUrlArr = await getPreSignedUrl(params);
      downloadUrl = resUrlArr[0].url;
    } else {
      let env = process.env.ENV || 'dev';
      const keyTemp = `${env}/${key}`;
      // 从zhesheng私有桶获取下载地址
      downloadUrl = await getPrivateR2DownLoadSignUrl(keyTemp, expiresIn);
    }

    return NextResponse.json({
      code: 0,
      message: '成功',
      data: {
        url: downloadUrl,
        expiresIn: expiresIn,
        // expiresAt: expiresAt?.toISOString(),
        key,
      },
    });
  } catch (error) {
    console.error('[Download API] 生成下载链接失败:', error);
    return NextResponse.json(
      {
        code: -1,
        message: error instanceof Error ? error.message : '生成下载链接失败',
      },
      { status: 500 }
    );
  }
}
