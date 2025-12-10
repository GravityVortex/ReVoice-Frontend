import {USE_JAVA_REQUEST} from '@/shared/cache/system-config';
import {respData, respErr} from '@/shared/lib/resp';
import {getVtTaskSubtitleListByTaskIdAndStepName} from '@/shared/models/vt_task_subtitle';
import fs from 'fs';
import {NextRequest, NextResponse} from 'next/server';
import path from 'path';



export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return respErr('缺少 taskId 参数')
    }
    // 翻译前后字幕列表
    // [
    //   {
    //     "end": 2.5,
    //     "text": "大家好\nHello",
    //     "start": 0
    //   }
    // ]

    // TODO 真实请求
    if (USE_JAVA_REQUEST) {
      const subtitleData = await getVtTaskSubtitleListByTaskIdAndStepName(
          taskId, ['bilingual_subtitle']);
      if (!subtitleData || subtitleData.length === 0) {
        return respErr('获取字幕对比列表未找到字幕数据')
      }
      const subtitleJson = typeof subtitleData[0].subtitleData === 'string' ?
          JSON.parse(subtitleData[0].subtitleData) :
          subtitleData[0].subtitleData;
      const list = subtitleJson.segments || [];
      if (list.length === 0) {
        return respErr('获取字幕对比列表为空')
      }
      return respData(list);
    }
    // 模拟
    else {
      // 读取同目录下 mock_srt_compare.json 并直接返回其内容
      const mockPath = path.join(
          process.cwd(),
          'src/app/api/video-task/getCompareSrtList/mock_srt_compare.json');
      const mockRaw = fs.readFileSync(mockPath, 'utf-8');
      const mockJson = JSON.parse(mockRaw);

      // 延迟1秒
      // await new Promise(resolve => setTimeout(resolve, 1500));


      return respData(mockJson);
    }



  } catch (error) {
    console.error('获取字幕对比列表失败:', error);
    return respErr('获取字幕对比列表失败')
  }
}
