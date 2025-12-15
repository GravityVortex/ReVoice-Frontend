import {respData, respErr} from '@/shared/lib/resp';
import {getVtTaskSubtitleListByTaskIdAndStepName} from '@/shared/models/vt_task_subtitle';
import {NextRequest, NextResponse} from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const stepName = searchParams.get('stepName');
    const fileName = searchParams.get('fileName') || '';

    if (!taskId || !stepName) {
      return respErr('缺少 taskId 或 stepName 参数');
    }

    const subtitleData = await getVtTaskSubtitleListByTaskIdAndStepName(taskId, [stepName]);
    console.log('subtitleData--->', subtitleData);

    if (!subtitleData || subtitleData.length === 0) {
      return respErr('未找到字幕数据');
    }

    const list = (subtitleData[0].subtitleData as unknown as any[]) || [];
    console.log('list--->', list);
    if (list.length === 0) {
      return respErr('字幕列表为空');
    }

    const filteredList = list.map(({ file_path, ...rest }: any) => rest);
    // 转换为 srt 格式
    const srtContent = convertToSrt(filteredList);
    // 生成文件名
    const srtName = `${fileName || taskId}_${stepName}`;

    return new NextResponse(srtContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${srtName}.srt"`,
      },
    });
  } catch (error) {
    console.error('[SRT Download API] 失败:', error);
    return respErr(error instanceof Error ? error.message : '下载失败');
  }
}

/**
 * 将字幕列表转换为 srt 格式
 * @param subtitleList
 * @returns
 */
function convertToSrt(subtitleList: any[]): string {
  return subtitleList
    .map((item, index) => {
      return `${item.seq || index + 1}\n${item.start} --> ${item.end}\n${item.txt}\n`;
    })
    .join('\n');
}
