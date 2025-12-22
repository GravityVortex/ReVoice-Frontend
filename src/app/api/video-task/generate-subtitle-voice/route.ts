import { NextRequest, NextResponse } from 'next/server';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { pyConvertTxtGenerateVoice, pyOriginalTxtTranslate } from '@/shared/services/pythonService';
import { USE_PYTHON_REQUEST } from '@/shared/cache/system-config';

/**
 * 生成字幕语音
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // subtitleName: 0001_00-00-00-000_00-00-04-000
    const { type, text, preText, subtitleName, taskId, languageTarget } = body;
    const user = await getUserInfo();

    if (!type || !text || !taskId || !subtitleName || !languageTarget) {
      return respErr('缺少参数');
    }

    // DOEND: 调用java获取视频下载签名地址
    let backJO: any = {};
    if (USE_PYTHON_REQUEST) {
      if (type === 'gen_srt') {
        const params = {
          text: text,
          prev_text: preText, // 上一个原语种字幕段的文本，除了第一个字幕段，其他字幕段都要传此参数
          theme_desc: '',
          // subtitleName: subtitleName, // '0001_00-00-00-000_00-00-04-000',
          languageTarget: languageTarget, // zh，en
          // taskId: taskId,
        };
        backJO = await pyOriginalTxtTranslate(params);
      } else if (type === 'translate_srt') {
        backJO = await pyConvertTxtGenerateVoice(taskId, text, subtitleName, languageTarget);
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (type === 'gen_srt') {
        backJO = {
          code: 200,
          message: 'xxxxx',
          text_translated: '模拟翻译内容xxxx',
        };
      } else if (type === 'translate_srt') {
        backJO = {
          code: 200,
          message: 'xxxxx',
          path_name: 'adj_audio_time_temp/0001_00-00-00-000_00-00-04-000.wav',
          // text_translated: '模拟翻译内容：' + text,
          duration: 2.34,
        };
      }
    }

    return respData(backJO);
  } catch (error) {
    console.error('生成语音失败:', error);
    return respErr('生成语音失败');
  }
}
