import { JAVA_EMAIL_URL, JAVA_SERVER_BASE_URL, SECRET_EMAIL } from '@/shared/cache/system-config';

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
  // console.log('加密明文--->', requestDataPre)
  const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
  console.log('加密密文--->', encryptedRequestData);
  // 解密并验证请求
  // const requestData = EncryptionUtil.decryptRequest(encryptedRequestData);
  // console.log('解密明文--->', requestData);
  // 请求java服务器
  const url = `${JAVA_SERVER_BASE_URL}/api/nextjs/presigned-urls`;
  console.log('请求java服务器--->', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    // console.log('java服务器返回--->', response.statusText);
    console.log('java服务器返回--->', await response.text());
    throw new Error(`Failed to get pre-signed URL`);
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
  console.log('java服务器返回--->', backJO);
  if (backJO.code !== 200) {
    console.log('java服务器返回--->', await response.text());
    throw new Error(`Failed to get pre-signed URL`);
  }
  const urls = backJO.data.urls;
  console.log('java服务器返回urls--->', urls);
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
  const tasks = backJO.data.tasks;
  if (tasks.length === 0) {
    throw new Error(`Failed to get tasks length is 0`);
  }
  return backJO.data.tasks[0].steps;
}

/**
 * 发送邮件
 * @param toEmail recipient@example.com
 * @param title 测试邮件
 * @param htmlContent <h1>欢迎使用邮件服务</h1><p>这是一封测试邮件。</p>
 * @returns 
 */
export async function sendEmail(toEmail: string, title: string, htmlContent: string) {
  const params = {
    to: toEmail,
    subject: title,
    html: htmlContent,
  };
  // 发送
  const response = await fetch(`${JAVA_EMAIL_URL}/api/v1/emails/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SECRET_EMAIL,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorJO = await response.text();
    console.log('java服务器返回--->', errorJO);
    return errorJO;
  }

  const backJO = await response.json();
  // if (backJO.code !== 1000) {
  //   console.log('java服务器返回--->', backJO);
    // throw new Error(`Failed to send email`);
  // }
  return backJO;
}
