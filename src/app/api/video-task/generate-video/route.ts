import { NextRequest, NextResponse } from 'next/server';

import { respData, respErr } from '@/shared/lib/resp';
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

    // 调用python生成视频
    const backJO = await pyMergeVideo(taskId);
    if (backJO.code === 200) {
      return respData('合成成功');
    } else {
      return respErr('合成失败');
    }
  } catch (error) {
    console.error('合成视频失败:', error);
    return respErr('合成失败');
  }
}
