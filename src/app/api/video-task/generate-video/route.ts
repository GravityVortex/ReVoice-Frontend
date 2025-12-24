import { NextRequest, NextResponse } from 'next/server';

import { respData, respErr } from '@/shared/lib/resp';
import { getVtTaskSubtitleListByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';
import { pyMergeVideo } from '@/shared/services/pythonService';

/**
 * 合成最终final视频
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return respErr('缺少参数taskId');
    }

    const stepNameArr2 = ['translate_srt'];
    const allSubtitleList = await getVtTaskSubtitleListByTaskIdAndStepName(taskId, stepNameArr2);
    const translatedSubtitleItem = allSubtitleList.find((item) => item.stepName === 'translate_srt');
    const subtitleArray: any = translatedSubtitleItem?.subtitleData || [];
    if(!subtitleArray || subtitleArray.length === 0) {
      return respErr('没有合成的字幕数据');
    }
    const nameArray = subtitleArray.map((item: any) => item.id);
    console.log('nameArray--->', nameArray);

    // 调用python生成视频
    const backJO = await pyMergeVideo(taskId, nameArray);
    if (backJO.code === 200) {
      return respData('视频合成任务已生成，较耗时请耐心等候。');
    } else {
      return respErr('视频合成任务失败！');
    }
  } catch (error) {
    console.error('合成视频失败:', error);
    return respErr('合成失败');
  }
}
