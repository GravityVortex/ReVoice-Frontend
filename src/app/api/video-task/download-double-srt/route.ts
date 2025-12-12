import {respData, respErr} from '@/shared/lib/resp';
import {getVtTaskSubtitleListByTaskIdAndStepName} from '@/shared/models/vt_task_subtitle';
import {NextRequest, NextResponse} from 'next/server';



export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const stepName = searchParams.get('stepName');
    const fileName = searchParams.get('fileName') || '';

    if (!taskId) {
      return respErr('缺少 taskId 参数')
    }

    const subtitleData = await getVtTaskSubtitleListByTaskIdAndStepName(
        taskId, ['gen_srt', 'translate_srt']);
    if (!subtitleData || subtitleData.length === 0) {
      return respErr('获取字幕对比列表未找到字幕数据')
    }

    // 找到原字幕和翻译字幕
    const genSrtItem = subtitleData.find(item => item.stepName === 'gen_srt');
    const translateSrtItem =
        subtitleData.find(item => item.stepName === 'translate_srt');

    if (!genSrtItem) {
      return respErr('未找到原字幕数据')
    }

    const genSrtList = genSrtItem.subtitleData as unknown as any[];
    const translateSrtList = (translateSrtItem?.subtitleData as unknown as any[]) || [];

    // 合并双语字幕
    const list = genSrtList.map((genItem: any, index: number) => {
      // const translateItem = translateSrtList.find((t: any) => t.seq ===
      // genItem.seq);
      const translateItem =
          translateSrtList.length > index ? translateSrtList[index] : null;
      return {
        id: genItem.id,
        end: genItem.end,
        seq: genItem.seq,
        gen_txt: genItem.txt,
        tra_txt: translateItem?.txt || '',
        start: genItem.start
      };
    });

    const filteredList = list.map(({file_path, ...rest}: any) => rest);
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
        {
          code: -1,
          message: error instanceof Error ? error.message : '下载失败'
        },
        {status: 500});
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
        const text = item.gen_txt && item.tra_txt
          ? `${item.gen_txt}\n${item.tra_txt}`
          : item.gen_txt || item.tra_txt || item.txt || '';
        return `${item.seq || index + 1}\n${item.start} --> ${item.end}\n${text}\n`;
      })
      .join('\n');
}
