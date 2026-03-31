import { PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';

import { buildPythonAuthHeaders } from '@/shared/services/pythonAuth';

type ModalRequestOptions = {
  idempotencyKey?: string;
};

type SubtitleTtsRequestOptions = {
  referenceSubtitleName?: string;
};

export type StructuredErrorData = {
  errorCode?: string;
  traceId?: string;
  retryAfterS?: number;
  upstreamStatus?: string;
  platform?: string;
  reason?: string;
  [key: string]: unknown;
};

export class StructuredFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly data?: StructuredErrorData
  ) {
    super(message);
    this.name = 'StructuredFetchError';
  }
}

export function normalizeStructuredErrorData(raw?: unknown): StructuredErrorData | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const base = raw as Record<string, unknown>;
  return {
    ...base,
    errorCode:
      (base.errorCode as string | undefined) ??
      (base.error_code as string | undefined) ??
      (typeof base.code === 'string' ? base.code : undefined),
    traceId: (base.traceId as string | undefined) ?? (base.trace_id as string | undefined),
    retryAfterS:
      (typeof base.retryAfterS === 'number' ? base.retryAfterS : undefined) ??
      (typeof base.retry_after_s === 'number' ? base.retry_after_s : undefined),
    upstreamStatus:
      (base.upstreamStatus as string | undefined) ??
      (base.modal_status as string | undefined) ??
      (base.modalStatus as string | undefined),
    platform: (base.platform as string | undefined) ?? (base.service as string | undefined),
    reason:
      (base.reason as string | undefined) ??
      (typeof base.message === 'string' ? base.message : undefined),
  };
}

async function createStructuredFetchError(response: Response): Promise<StructuredFetchError> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let payload: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = null;
    }
  }
  const data = normalizeStructuredErrorData(
    typeof payload === 'object' && payload ? payload : undefined
  );
  const message =
    typeof payload === 'object' && payload
      ? String(
          (payload as Record<string, unknown>).message ||
            (payload as Record<string, unknown>).error ||
            response.statusText ||
            `HTTP ${response.status}`
        )
      : String(payload ?? response.statusText ?? `HTTP ${response.status}`);
  return new StructuredFetchError(message, response.status, response.statusText, data);
}

export async function fetchJsonWithStructuredError<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await createStructuredFetchError(response.clone());
  }
  return response.json();
}

function resolveTtsBaseUrl(): string {
  // 单条字幕音频重生成已迁移到 TTS 服务：
  // - 优先使用 TTS_SERVER_BASE_URL（避免影响其它仍走 VAP 的接口）
  // - 未配置时回退 PYTHON_SERVER_BASE_URL（兼容旧环境/快速回滚）
  const ttsBaseUrl = String(process.env.TTS_SERVER_BASE_URL || '').trim();
  const baseUrl = ttsBaseUrl || String(PYTHON_SERVER_BASE_URL || '').trim();
  return baseUrl;
}

function resolveLegacyPythonBaseUrl(): string {
  return String(PYTHON_SERVER_BASE_URL || '').trim();
}

/**
 * 1.1、原视频字幕文字翻译
 * @param param
 * @returns
 */
export async function pyOriginalTxtTranslate(param: any) {
  // 请求数据测试
  const params = {
    text: param.text,
    prev_text: param.prev_text, // 上一个原语种字幕段的文本，除了第一个字幕段，其他字幕段都要传此参数
    theme_desc: '',
    language_target: param.languageTarget,// zh，en
  };

  // console.log('解密明文--->', requestData);
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitle/single/translate`;
  console.log('请求python服务器--->', url);
  const backJO = await fetchJsonWithStructuredError(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
  });
  console.log('python服务器返回--->', backJO);
  return backJO;
}

/**
 * Job: 原视频字幕文字翻译（避免 Modal Web Endpoint 超时）
 */
export async function pyOriginalTxtTranslateJobStart(param: any, opts: ModalRequestOptions = {}) {
  const params = {
    text: param.text,
    prev_text: param.prev_text,
    theme_desc: param.theme_desc || '',
    language_target: param.languageTarget,
  };

  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitle/single/translate/jobs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`原字幕翻译任务提交失败${msg}`);
  }
  return await response.json();
}

export async function pyOriginalTxtTranslateJobStatus(jobId: string) {
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitle/single/translate/jobs/${jobId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`原字幕翻译任务查询失败${msg}`);
  }
  return await response.json();
}

/**
 * 1.2、翻译后的字幕文字转语音tts
 * @param params
 * @returns
 */
export async function pyConvertTxtGenerateVoice(
  taskId: string,
  txt: string,
  subtitleName: string,
  opts: SubtitleTtsRequestOptions = {}
) {
  const referenceSubtitleName = String(opts.referenceSubtitleName || '').trim();
  // 请求数据测试
  const params: Record<string, string> = {
    text: txt,
    subtitle_name: subtitleName,// 0001_00-00-00-000_00-00-04-000
    // language_target: languageTarget,
    task_id: taskId,
  };
  if (referenceSubtitleName) {
    params.reference_subtitle_name = referenceSubtitleName;
  }

  // console.log('解密明文--->', requestData);
  const baseUrl = resolveTtsBaseUrl();
  const url = `${baseUrl}/api/internal/subtitles/translated/tts`;
  console.log('请求tts服务器--->', url);
  console.log('请求tts服务器--params--->', params);
  const backJO = await fetchJsonWithStructuredError(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(120_000),
  });
  console.log('python服务器返回--->', backJO);
  return backJO;
}


/**
 * 1.3、合成视频
 * @param taskId 
 * @returns 
 */
export async function pyMergeVideo(taskId: string, nameArray: string[]) {
  // 请求数据测试
  const params = {
    task_id: taskId,
    audio_clips: nameArray,
  };
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/audios/video/merge`;
  console.log('请求python服务器--->', url);
  console.log('请求python服务器--params--->', params);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
  });
  // {
  //   "url_download_vocal_clip": "https://r2.cloudflare.com/xxxx.dev/abc/xyz/11-22.wav",
  //   "duration": 2.34,
  // }
  if (!response.ok) {
    // console.log('python服务器返回--->', response.statusText);
    console.log('python服务器返回--->', await response.text());
    throw new Error(`Failed tts`);
  }
  const backJO = await response.json();
  // { code: 200, message: '任务已触发，正在分析处理中' }
  console.log('python服务器返回--->', backJO);
  return backJO;
}

/**
 * Job: 翻译后的字幕文字转语音（避免 Next API route / 平台超时）
 */
export async function pyConvertTxtGenerateVoiceJobStart(
  taskId: string,
  txt: string,
  subtitleName: string,
  reqOpts: SubtitleTtsRequestOptions = {},
  opts: ModalRequestOptions = {}
) {
  const referenceSubtitleName = String(reqOpts.referenceSubtitleName || '').trim();
  const params: Record<string, string> = {
    text: txt,
    subtitle_name: subtitleName,
    task_id: taskId,
  };
  if (referenceSubtitleName) {
    params.reference_subtitle_name = referenceSubtitleName;
  }
  const baseUrl = resolveTtsBaseUrl();
  const legacyBaseUrl = resolveLegacyPythonBaseUrl();
  const url = `${baseUrl}/api/internal/subtitles/translated/tts/jobs`;
  const fallbackUrl = legacyBaseUrl ? `${legacyBaseUrl}/api/internal/subtitles/translated/tts/jobs` : '';

  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(params),
  };

  try {
    return await fetchJsonWithStructuredError(url, init);
  } catch (error) {
    if (
      error instanceof StructuredFetchError &&
      fallbackUrl &&
      (error.status === 404 || error.status === 405)
    ) {
      return await fetchJsonWithStructuredError(fallbackUrl, init);
    }
    throw error;
  }
}

export async function pyConvertTxtGenerateVoiceJobStatus(jobId: string) {
  const baseUrl = resolveTtsBaseUrl();
  const legacyBaseUrl = resolveLegacyPythonBaseUrl();
  const url = `${baseUrl}/api/internal/subtitles/translated/tts/jobs/${jobId}`;
  const fallbackUrl = legacyBaseUrl ? `${legacyBaseUrl}/api/internal/subtitles/translated/tts/jobs/${jobId}` : '';

  const init: RequestInit = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
  };

  try {
    return await fetchJsonWithStructuredError(url, init);
  } catch (error) {
    if (
      error instanceof StructuredFetchError &&
      fallbackUrl &&
      (error.status === 404 || error.status === 405)
    ) {
      return await fetchJsonWithStructuredError(fallbackUrl, init);
    }
    throw error;
  }
}

/**
 * Job: 合成视频（避免 Next API route / 平台超时）
 */
export async function pyMergeVideoJobStart(
  taskId: string,
  nameArray: string[],
  opts: ModalRequestOptions = {}
) {
  const params = {
    task_id: taskId,
    audio_clips: nameArray,
  };
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/audios/video/merge/jobs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`视频合成任务提交失败${msg}`);
  }
  return await response.json();
}

export async function pyMergeVideoJobStatus(jobId: string) {
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/audios/video/merge/jobs/${jobId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`视频合成任务查询失败${msg}`);
  }
  return await response.json();
}

/**
 * 音频切割（同步接口，不走 job 轮询）
 * 调用 Python 侧 POST /api/internal/audio/split
 */
export async function pySplitAudio(
  taskId: string,
  userId: string,
  audioR2Key: string,
  splitAtMs: number,
  clipStartMs: number,
  clipEndMs: number,
  leftOutputKey: string,
  rightOutputKey: string,
  backupKey?: string,
): Promise<{
  left_path: string;
  left_duration: number;
  right_path: string;
  right_duration: number;
}> {
  const params = {
    task_id: taskId,
    user_id: userId,
    audio_r2_key: audioR2Key,
    split_at_ms: splitAtMs,
    clip_start_ms: clipStartMs,
    clip_end_ms: clipEndMs,
    left_output_key: leftOutputKey,
    right_output_key: rightOutputKey,
    ...(backupKey ? { backup_key: backupKey } : {}),
  };

  const baseUrl = resolveLegacyPythonBaseUrl();
  const url = `${baseUrl}/api/internal/audio/split`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`音频切割失败: ${msg}`);
  }
  const backJO = await response.json();
  return backJO.data ?? backJO;
}
