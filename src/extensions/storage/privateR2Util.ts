import { NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getUuid } from '@/shared/lib/hash';
import { getUserInfo } from '@/shared/models/user';

const endpoint = process.env.R2_ENDPOINT!;
const bucketName = process.env.R2_BUCKET_NAME!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

/**
 * 获得上传R2的签名地址
 * @param key
 * @param contentType
 * @param filename
 * @returns
 */
export async function getPrivateR2UploadSignUrl(contentType: string, filename: string) {
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId, // 每个存储桶单独id
      secretAccessKey, // 每个存储桶单独secret
    },
    forcePathStyle: false,
  });
  const fileId = getUuid();
  const user = await getUserInfo();
  // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
  let env = process.env.ENV || 'dev';
  const keyV = 'original/video/video_original.mp4';
  const pathName = `${env}/${user?.id}/${fileId}/`;
  // const keyV = `uploads/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: pathName,
    ContentType: contentType || 'video/mp4',
  });
  // 签名上传mp4地址，供前端直接上传
  const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

  // 获取mp4预览地址
  const command2 = new GetObjectCommand({
    Bucket: bucketName,
    Key: pathName,
    ResponseContentDisposition: 'attachment',
  });
  // 私桶临时访问点
  const publicUrl = await getSignedUrl(client, command2, {
    expiresIn: 3600,
    signableHeaders: new Set(['host']),
  });

  // 私桶临时访问点
  // const publicUrl = `${endpoint}/${bucketName}/${keyV}`;

  //   return NextResponse.json({ presignedUrl, keyV, publicUrl, bucketName });
  return { presignedUrl, keyV, publicUrl, bucketName, fileId };
}

/**
 * 获取私有 R2 存储桶的签名 预览URL
 * @param key
 * @returns
 */
export async function getPrivateR2DownLoadSignUrl(key: string, timeOut = 3600) {
  // 多个存储桶公用一个
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId, // 每个存储桶单独id
      secretAccessKey, // 每个存储桶单独secret
    },
    forcePathStyle: false,
  });
  // Create GetObject command
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: 'attachment',
  });

  // Generate presigned URL with explicit expiration
  // Note: timeOut must be between 1 and 604800 (7 days)
  const validExpiresIn = Math.max(1, Math.min(timeOut, 604800));

  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: validExpiresIn,
    // Ensure the signature includes the expiration
    signableHeaders: new Set(['host']),
  });
  return signedUrl;
}

/**
 * 获取私有 R2 存储桶的签名 预览URL
 * @param key
 * @returns
 */
export async function getPrivateR2SignUrl(key: string, timeOut = 3600) {
  const urlList = await generatePrivateR2SignUrl([key], timeOut);
  return urlList.length > 0 ? urlList[0] : '';
}

/**
 * 获取私有 R2 存储桶的签名 预览URL
 * @param r2KeyArr ["key1", "key2", ...]
 * @param expiresIn
 * @returns
 */
export async function generatePrivateR2SignUrl(r2KeyArr: any[] = [], expiresIn: number = 3600): Promise<string[]> {
  try {
    // 多个存储桶公用一个
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId, // 每个存储桶单独id
        secretAccessKey, // 每个存储桶单独secret
      },
      forcePathStyle: false,
    });

    const urlList: string[] = [];
    for (const r2Key of r2KeyArr) {
      if (!r2Key) {
        continue;
      }
      const command = new GetObjectCommand({
        Bucket: bucketName, // 存储桶名称
        Key: r2Key,
      });
      // 获取访问预览url
      const url = await getSignedUrl(client, command, { expiresIn: expiresIn });
      // console.log('Generated presigned URL--->', url);
      urlList.push(url);
    }
    return urlList;
  } catch (error) {
    console.error('[generatePrivateR2SignUrl] 生成签名URL失败:', error);
    return [];
  }
}
