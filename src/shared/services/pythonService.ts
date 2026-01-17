import { MODAL_KEY, MODAL_SECRET, PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';

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
      'Modal-Key': MODAL_KEY,
      'Modal-Secret': MODAL_SECRET,
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
 * 1.2、翻译后的字幕文字转语音tts
 * @param params
 * @returns
 */
export async function pyConvertTxtGenerateVoice(taskId: string, txt: string, subtitleName: string) {
  // 请求数据测试
  const params = {
    text: txt,
    subtitle_name: subtitleName,// 0001_00-00-00-000_00-00-04-000
    // language_target: languageTarget,
    task_id: taskId,
  };

  // console.log('解密明文--->', requestData);
  // 请求python服务器
  const url = `${PYTHON_SERVER_BASE_URL}/api/internal/subtitles/translated/tts`;
  console.log('请求python服务器--->', url);
  console.log('请求python服务器--params--->', params);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': MODAL_KEY,
      'Modal-Secret': MODAL_SECRET,
    },
    body: JSON.stringify(params),
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
export async function pyMergeVideo(taskId: string, nameArray: any) {
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
      'Modal-Key': MODAL_KEY,
      'Modal-Secret': MODAL_SECRET,
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
