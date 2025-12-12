import { NextRequest, NextResponse } from 'next/server';
import { getVtTaskSubtitleListByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';



export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const stepName = searchParams.get('stepName');
    const fileName = searchParams.get('fileName') || '';

    if (!taskId || !stepName) {
      return NextResponse.json(
        { code: -1, message: '缺少 taskId 或 stepName 参数' },
        { status: 400 }
      );
    }

    const subtitleData = await getVtTaskSubtitleListByTaskIdAndStepName(taskId, [stepName]);

    if (!subtitleData || subtitleData.length === 0) {
      return NextResponse.json(
        { code: -1, message: '未找到字幕数据' },
        { status: 404 }
      );
    }

    const list = (subtitleData[0].subtitleData as unknown as any[]) || [];

    if (list.length === 0) {
      return NextResponse.json(
        { code: -1, message: '字幕列表为空' },
        { status: 404 }
      );
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
    return NextResponse.json(
      { code: -1, message: error instanceof Error ? error.message : '下载失败' },
      { status: 500 }
    );
  }
}

/**
 * 将字幕列表转换为 srt 格式
 * @param subtitleList
 * @returns
 */
function convertToSrt(subtitleList: any[]): string {
  return subtitleList.map((item, index) => {
    return `${item.seq || index + 1}\n${item.start} --> ${item.end}\n${item.txt}\n`;
  }).join('\n');
}


