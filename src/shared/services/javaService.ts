import { JAVA_SERVER_BASE_URL } from '@/shared/cache/system-config';

import EncryptionUtil from '../lib/EncryptionUtil';

export interface SignUrlItem {
  path: string;
  operation: 'upload' | 'download';
  expirationMinutes: number; // 分钟
}

/**
 * 请求java服务器，获取签名Url
 * @param itemArr
 * @returns
 */
export async function getPreSignedUrl(itemArr: SignUrlItem[]) {
  // 请求数据测试
  const requestDataPre = {
    requests: itemArr,
    // time: 1702345678,// 加密中会补充time时间
  };

  // 加密响应
  const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
  console.log('加密密文--->', encryptedRequestData);
  // 解密并验证请求
  // const requestData = EncryptionUtil.decryptRequest(encryptedRequestData);
  // console.log('解密明文--->', requestData);
  // 请求java服务器
  const response = await fetch(`${JAVA_SERVER_BASE_URL}/api/getPreSignedUrl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    throw new Error(`Failed to get pre-signed URL: ${response.status}`);
  }
  // {
  //   "code": 200,
  //   "message": "Success",
  //   "data": {
  //       "urls": [
  //           {
  //               "path": "user-123/file-uuid-123/original/video/video.mp4",
  //               "operation": "upload",
  //               "url": "https://r2.cloudflare.com/xxx?X-Amz-Signature=xxx",
  //               "expiresAt": "2025-12-12T15:30:00"
  //           },
  //           {
  //               "path": "user-456/task-uuid-789/merge_audio_video/output.mp4",
  //               "operation": "download",
  //               "url": "https://r2.cloudflare.com/xxx?X-Amz-Signature=xxx",
  //               "expiresAt": "2025-12-12T15:30:00"
  //           }
  //       ]
  //   }
  // }
  const backJO = await response.json();
  if (backJO.code !== 200) {
    throw new Error(`Failed to get pre-signed URL: ${backJO.message}`);
  }
  const urls = backJO.data.urls;
  return urls;
}

/**
 * 请求java服务器获取进度
 * @param params
 * @returns
 */
export async function getTaskProgress(taskId: string) {
  const requestDataPre = {
    taskIds: [taskId],
  };
  // 加密响应
  const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
  console.log('加密密文--->', encryptedRequestData);
  const response = await fetch(`${JAVA_SERVER_BASE_URL}/api/nextjs/tasks/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    throw new Error(`Failed to get task progress: ${response.status}`);
  }

  const backJO = await response.json();
  if (backJO.code !== 200) {
    throw new Error(`Failed to get pre-signed URL: ${backJO.message}`);
  }
  return backJO.data;
}
