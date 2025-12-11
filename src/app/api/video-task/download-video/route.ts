import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/shared/services/storage';
import { R2Provider } from '@/extensions/storage';

/**
 * 生成 Cloudflare R2 签名下载 URL
 * GET /api/video-task/download?key=xxx&expiresIn=3600
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    const expiresInParam = searchParams.get('expiresIn');

    if (!key) {
      return NextResponse.json(
        { code: -1, message: '缺少文件 key 参数' },
        { status: 400 }
      );
    }

    // 获取存储服务
    const storageService = await getStorageService();
    const provider = storageService.getProvider('r2');

    if (!provider || !(provider instanceof R2Provider)) {
      return NextResponse.json(
        { code: -1, message: 'R2 存储未配置或不可用' },
        { status: 500 }
      );
    }

    // 解析过期时间（默认 1 小时）
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;

    // 生成预签名下载 URL
    const downloadUrl = await provider.getPresignedDownloadUrl(key, expiresIn);

    // 解析 URL 检查过期参数
    const urlObj = new URL(downloadUrl);
    const amzExpires = urlObj.searchParams.get('X-Amz-Expires');
    const amzDate = urlObj.searchParams.get('X-Amz-Date');
    const amzSignature = urlObj.searchParams.get('X-Amz-Signature');
    
    // 计算实际过期时间
    let expiresAt = null;
    if (amzDate && amzExpires) {
      try {
        // X-Amz-Date 格式: 20231128T123456Z
        const year = parseInt(amzDate.substring(0, 4));
        const month = parseInt(amzDate.substring(4, 6)) - 1;
        const day = parseInt(amzDate.substring(6, 8));
        const hour = parseInt(amzDate.substring(9, 11));
        const minute = parseInt(amzDate.substring(11, 13));
        const second = parseInt(amzDate.substring(13, 15));
        
        const signedTime = new Date(Date.UTC(year, month, day, hour, minute, second));
        expiresAt = new Date(signedTime.getTime() + parseInt(amzExpires) * 1000);
      } catch (e) {
        console.error('[Download API] 解析过期时间失败:', e);
      }
    }
    
    console.log('[Download API] 生成下载链接成功:', {
      key,
      requestedExpiresIn: expiresIn,
      amzExpires,
      amzDate,
      expiresAt: expiresAt?.toISOString(),
      hasSignature: !!amzSignature,
      url: downloadUrl.substring(0, 150) + '...',
    });

    return NextResponse.json({
      code: 0,
      message: '成功',
      data: {
        url: downloadUrl,
        expiresIn: provider.configs.publicDomain ? 0 : expiresIn,
        expiresAt: expiresAt?.toISOString(),
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
