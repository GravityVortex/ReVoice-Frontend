import { JAVA_EMAIL_URL, JAVA_SERVER_BASE_URL, SECRET_EMAIL } from '@/shared/cache/system-config';

import EncryptionUtil from '../lib/EncryptionUtil';

type JavaApiResponse<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type JavaSubtitleSingleTranslateData = {
  textTranslated?: string;
};

export interface SignUrlItem {
  path: string;
  operation: 'upload' | 'download';
  expirationMinutes: number; // 分钟
}

/**
 * Java 单句字幕翻译（Next.js 专用加密接口）
 */
export async function javaSubtitleSingleTranslate(args: {
  text: string;
  prevText?: string;
  languageTarget: string;
  themeDesc?: string;
  deadlineMs?: number;
}) {
  const payload = {
    text: args.text,
    prevText: args.prevText ?? '',
    languageTarget: args.languageTarget,
    themeDesc: args.themeDesc ?? '',
  };

  const encryptedRequestData = EncryptionUtil.encryptRequest(payload);
  const response = await fetch(`${JAVA_SERVER_BASE_URL}/api/nextjs/subtitle/single/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      ...(args.deadlineMs && Number.isFinite(args.deadlineMs)
        ? { 'X-Request-Deadline-Ms': String(Math.trunc(args.deadlineMs)) }
        : {}),
    },
    body: encryptedRequestData,
  });

  const rawText = await response.text();
  let json: JavaApiResponse<JavaSubtitleSingleTranslateData> | undefined;
  try {
    json = rawText ? (JSON.parse(rawText) as JavaApiResponse<JavaSubtitleSingleTranslateData>) : undefined;
  } catch {
    // ignore
  }

  if (!response.ok) {
    const msg =
      json?.message ||
      (rawText && rawText.trim()) ||
      `Java subtitle translate failed (${response.status} ${response.statusText})`;
    throw new Error(msg);
  }

  if (!json || typeof json !== 'object') {
    throw new Error('Java subtitle translate returned invalid response');
  }
  if (json.code !== 200) {
    throw new Error(json.message || `Java subtitle translate failed (${json.code ?? 'unknown'})`);
  }

  const translated = String(json.data?.textTranslated || '').trim();
  if (!translated) {
    throw new Error(json.message || 'Java subtitle translate returned empty text');
  }

  return { textTranslated: translated };
}

// In-memory cache for presigned URLs to reduce roundtrips to the Java control-plane.
// This is best-effort: on serverless it only helps warm instances, but it's still worth it.
const presignedUrlCache = new Map<string, { urls: any[]; expiresAtMs: number }>();
const PRESIGNED_CACHE_MAX = 200;
const PRESIGNED_CACHE_SAFETY_MS = 60_000; // don't serve URLs close to expiry

function getPresignedCacheKey(itemArr: SignUrlItem[]) {
  // Keep it deterministic and compact; order is significant.
  return JSON.stringify(
    itemArr.map((i) => ({
      p: i.path,
      o: i.operation,
      e: i.expirationMinutes,
    }))
  );
}

function parseExpiresAtMs(urls: any[], fallbackMinutes: number) {
  const now = Date.now();
  let minMs = Number.POSITIVE_INFINITY;
  for (const u of urls || []) {
    const exp = typeof u?.expiresAt === 'string' ? Date.parse(u.expiresAt) : NaN;
    if (Number.isFinite(exp) && exp > 0) minMs = Math.min(minMs, exp);
  }
  if (minMs !== Number.POSITIVE_INFINITY) return minMs;
  const mins = Number.isFinite(fallbackMinutes) && fallbackMinutes > 0 ? fallbackMinutes : 60;
  return now + mins * 60_000;
}

/**
 * 请求java服务器，获取签名Url
 * @param itemArr
 * @returns
 */
export async function getPreSignedUrl(
  itemArr: SignUrlItem[],
  options?: { forceRefresh?: boolean }
) {
  const cacheKey = getPresignedCacheKey(itemArr);
  const forceRefresh = Boolean(options?.forceRefresh);
  if (!forceRefresh) {
    const cached = presignedUrlCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAtMs - PRESIGNED_CACHE_SAFETY_MS > now) {
      return cached.urls;
    }
  } else {
    // 主动刷新：丢弃缓存，避免拿到已过期/被撤销的签名 URL。
    presignedUrlCache.delete(cacheKey);
  }

  const requestDataPre = {
    requests: itemArr,
    // time: 1702345678,// 加密中会补充time时间
  };

  const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
  const url = `${JAVA_SERVER_BASE_URL}/api/nextjs/presigned-urls`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    throw new Error(`Failed to get pre-signed URL: http ${response.status}`);
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
  if (backJO?.code !== 200 || !Array.isArray(backJO?.data?.urls)) {
    throw new Error(`Failed to get pre-signed URL: code ${backJO?.code ?? 'unknown'}`);
  }
  const urls = backJO.data.urls;

  try {
    const fallbackMinutes = Math.min(...(itemArr || []).map((i) => i.expirationMinutes || 0).filter((n) => n > 0));
    const expiresAtMs = parseExpiresAtMs(urls, fallbackMinutes);
    presignedUrlCache.set(cacheKey, { urls, expiresAtMs });
    // Simple FIFO eviction (good enough).
    if (presignedUrlCache.size > PRESIGNED_CACHE_MAX) {
      const firstKey = presignedUrlCache.keys().next().value as string | undefined;
      if (firstKey) presignedUrlCache.delete(firstKey);
    }
  } catch {
    // Never fail the request because of caching logic.
  }

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
  const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
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



/**
 * 调用java接口实现文件移动
 * @param sourcePath 
 * @param targetPath 
 * @param bucket 
 * @returns 
 */
export async function javaR2MoveFile(sourcePath: string, targetPath: string, bucket: string) {
  const params = {
    sourcePath: sourcePath,
    targetPath: targetPath,
    bucket: bucket,
  };
  const encryptedRequestData = EncryptionUtil.encryptRequest(params);
  const response = await fetch(`${JAVA_SERVER_BASE_URL}/api/nextjs/move-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    const errorJO = await response.text();
    console.log('java服务器返回--->', errorJO);
    return errorJO;
  }

  const backJO = await response.json();
// {
//     "code": 200,
//     "message": "Success",
//     "data": {
//         "sourcePath": "user-123/task-456/split_audio_video/video/video_nosound.mp4",
//         "targetPath": "user-123/archive/2025-12-19/video_nosound.mp4",
//         "success": true
//     }
// }
  return backJO;
}



/**
 * 覆盖接口
 * @param sourcePath 
 * @param targetPath 
 * @param bucket 
 * @returns 
 */
export async function javaR2CoverWriteFile(sourcePath: string, targetPath: string, bucket: string) {
  const params = {
    sourcePath: sourcePath,
    targetPath: targetPath,
    bucket: bucket,
  };
  const encryptedRequestData = EncryptionUtil.encryptRequest(params);
  const url = `${JAVA_SERVER_BASE_URL}/api/nextjs/overwrite-file`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: encryptedRequestData,
  });

  if (!response.ok) {
    const errorJO = await response.text();
    console.log('java服务器返回错误--->', errorJO);
    return errorJO;
  }

  const backJO = await response.json();

// {
//     "code": 200,
//     "message": "Success",
//     "data": {
//         "sourcePath": "user-123/task-456/split_audio_video/video/video_nosound.mp4",
//         "targetPath": "user-123/archive/2025-12-19/video_nosound.mp4",
//         "success": true
//     }
// }
  return backJO;
}
