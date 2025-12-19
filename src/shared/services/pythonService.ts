import { PYTHON_SECRET, PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';

/**
 * 原视频字幕文字转语音tts
 * @param param
 * @returns
 */
export async function originalTxt2Voice(param: any) {
  // 请求数据测试
  const params = {
    ...param,
    text: '很高兴大家来听我的节目',
    prev_text: 'Hi，又和大家见面了',
    theme_desc: '动画电影，疯狂动物城2',
    subtitle_name: '0001_00-00-00-000_00-00-04-000',
    language_target: '',
    taskId: 'task-uuid-123',
  };

  // console.log('解密明文--->', requestData);
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitles/original/tts`;
  console.log('请求python服务器--->', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  // {
  //   "url_download_vocal_clip": "https://r2.cloudflare.com/xxxx.dev/abc/xyz/11-22.wav",
  //   "text_translated": "Hello World",
  //   "duration": 2.34,
  // }
  if (!response.ok) {
    // console.log('python服务器返回--->', response.statusText);
    console.log('python服务器返回--->', await response.text());
    throw new Error(`Failed tts`);
  }
  const backJO = await response.json();
  console.log('python服务器返回--->', backJO);
  return backJO;
}

/**
 * 翻译后的字幕文字转语音tts
 * @param params
 * @returns
 */
export async function covertTxt2Voice(taskId: string, txt: string, subtitleName: string) {
  // 请求数据测试
  const params = {
    text: txt,
    subtitle_name: subtitleName,// 0001_00-00-00-000_00-00-04-000
    taskId: taskId,
  };

  // console.log('解密明文--->', requestData);
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitles/translated/tts`;
  console.log('请求python服务器--->', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  console.log('python服务器返回--->', backJO);
  return backJO;
}


export async function mergeVideo(taskId: string) {
  // 请求数据测试
  const params = {
    taskId: taskId,
  };
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/audios/video/merge`;
  console.log('请求python服务器--->', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  console.log('python服务器返回--->', backJO);
  return backJO;
}
