// 前端上传file到后端，后端生成presigned url，前端直接上传到R2，绕过4.5M的限制
import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/shared/services/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const storageService = await getStorageService();
    // const provider = storageService.getDefaultProvider();
    const provider = storageService.getProvider('r2');

    if (!provider || provider.name !== 'r2') {
      return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
    }

    const r2Config = (provider as any).configs;
    const key = `uploads/${Date.now()}-${filename}`;

    const endpoint = r2Config.endpoint || `https://${r2Config.accountId}.r2.cloudflarestorage.com`;

    const s3Client = new S3Client({
      region: r2Config.region || 'auto',
      endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      ContentType: contentType || 'video/mp4',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    const publicUrl = r2Config.publicDomain
      ? `${r2Config.publicDomain}/${key}`
      : `${endpoint}/${r2Config.bucket}/${key}`;

    return NextResponse.json({ presignedUrl, key, publicUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}
