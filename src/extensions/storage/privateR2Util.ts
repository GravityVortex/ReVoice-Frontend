import { NextResponse } from 'next/server';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getUuid } from '@/shared/lib/hash';

const endpoint = process.env.R2_ENDPOINT!;
const bucketName = process.env.R2_BUCKET_NAME!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

/**
 * 获取私桶配置
 * @returns 
 */
export async function getConfig(){
  return {bucketName, endpoint}
}
/**
 * 获取私桶名字
 * @returns 
 */
export async function getBucketName(){
  return bucketName;
}

/**
 * 获得上传R2的签名地址
 * @param key
 * @param contentType
 * @param filename
 * @returns
 */
export async function getPrivateR2UploadSignUrl(
  contentType: string,
  filename: string,
  userId: string
) {
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
  // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
  let env = process.env.ENV || 'dev';
  const keyV = 'original/video/video_original.mp4';
  const pathName = `${env}/${userId}/${fileId}/${keyV}`;
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
    let env = process.env.ENV || 'dev';
    const urlList: string[] = [];
    for (const r2Key of r2KeyArr) {
      if (!r2Key) {
        continue;
      }
      const command = new GetObjectCommand({
        Bucket: bucketName, // 存储桶名称
        Key: `${env}/${r2Key}`,
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

/**
 * 获取指定路径下的文件列表
 * @param r2Path R2路径
 */
export async function getFileList(r2Path: string) {
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false,
  });

  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: r2Path,
    Delimiter: '/',
  });

  const { Contents, CommonPrefixes } = await client.send(listCommand);

  const folders = (CommonPrefixes || []).map((prefix) => ({
    name: prefix.Prefix?.replace(r2Path, '').replace('/', '') || '',
    path: prefix.Prefix || '',
    type: 'folder',
  }));

  const files = (Contents || [])
    .filter((obj) => obj.Key !== r2Path)
    .map((obj) => ({
      name: obj.Key?.split('/').pop() || '',
      path: obj.Key || '',
      type: 'file',
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    }));

  return [...folders, ...files];
}

/**
 * 删除指定路径及其下所有文件
 * @param path R2路径
 */
export async function deletePathAndFiles(path: string) {
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false,
  });

  // 查询所有文件列表命令
  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: path,
  });
  // 查询所有文件列表
  const { Contents } = await client.send(listCommand);

  // 所有文件，批量删除
  if (Contents && Contents.length > 0) {
    await Promise.all(
      Contents.map((obj) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: obj.Key,
          })
        )
      )
    );
  }

  const res = await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: path,
    })
  );

  return res;
}

/**
 * 移动文件到另一个目录，如果重名则覆盖
 * @param sourcePath 源文件路径
 * @param targetPath 目标文件路径
 */
export async function r2MoveFile(sourcePath: string, targetPath: string) {
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });
    // 环境变量
    const env = process.env.ENV || 'dev';
    // 复制
    await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${env}/${sourcePath}`,
        Key: `${env}/${targetPath}`,
      })
    );
    // 删除
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: sourcePath,
      })
    );

    return {
      code: 200,
      message: 'Success',
      data: {
        sourcePath,
        targetPath,
      },
    };
  } catch (error) {
    console.error('[r2MoveFile] 移动文件失败:', error);
    return {
      code: 500,
      message: error instanceof Error ? error.message : '移动文件失败',
      data: null,
    };
  }
}
