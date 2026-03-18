import { PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';

import { buildPythonAuthHeaders } from '@/shared/services/pythonAuth';

type ModalRequestOptions = {
  idempotencyKey?: string;
};

type SubtitleTtsRequestOptions = {
  referenceSubtitleName?: string;
};

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

async function fetchWithOptionalFallback(
  primaryUrl: string,
  init: RequestInit,
  fallbackUrl: string
): Promise<Response> {
  const primary = await fetch(primaryUrl, init);
  // 兼容：新 TTS 服务可能还未实现 jobs 接口；遇到 404/405 时回退到旧 PYTHON_SERVER_BASE_URL。
  if (primary.status !== 404 && primary.status !== 405) return primary;
  if (!fallbackUrl || fallbackUrl === primaryUrl) return primary;
  return await fetch(fallbackUrl, init);
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
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
  });
  // {
  //   "code": 200,
  //   "message": "xxxxx",
  //   "text_translated": "Hello World",
  // }
  if (!response.ok) {
    // console.log('python服务器返回--->', response.statusText);
    const msg = await response.text();
    console.log('python服务器返回--->', msg);
    throw new Error(`原字幕文本翻译失败${msg}`);
  }
  const backJO = await response.json();
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(120_000),
  });
  // {
  //   "code": 200,
  //   "message": "xxxxx",
  //   "path_name": "adj_audio_time_temp/0001_00-00-00-000_00-00-04-000.wav",
  //   "duration": 2.34
  // }
  if (!response.ok) {
    // console.log('python服务器返回--->', response.statusText);
    const msg = await response.text();
    console.log('python服务器返回--->', msg);
    throw new Error(`翻译字幕转语音失败${msg}`);
  }
  const backJO = await response.json();
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

  const response = await fetchWithOptionalFallback(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(params),
  }, fallbackUrl);

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`字幕TTS任务提交失败${msg}`);
  }
  return await response.json();
}

export async function pyConvertTxtGenerateVoiceJobStatus(jobId: string) {
  const baseUrl = resolveTtsBaseUrl();
  const legacyBaseUrl = resolveLegacyPythonBaseUrl();
  const url = `${baseUrl}/api/internal/subtitles/translated/tts/jobs/${jobId}`;
  const fallbackUrl = legacyBaseUrl ? `${legacyBaseUrl}/api/internal/subtitles/translated/tts/jobs/${jobId}` : '';

  const response = await fetchWithOptionalFallback(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...buildPythonAuthHeaders(),
    },
  }, fallbackUrl);

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`字幕TTS任务查询失败${msg}`);
  }
  return await response.json();
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
