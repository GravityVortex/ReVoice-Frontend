import {getSystemConfigByKey} from '@/shared/cache/system-config';
import {respData, respErr} from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import {getVtTaskSubtitleListByTaskIdAndStepName} from '@/shared/models/vt_task_subtitle';
import { hasPermission } from '@/shared/services/rbac';
import {NextRequest} from 'next/server';



export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return respErr('缺少 taskId 参数')
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) {
      return respErr('任务不存在');
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }
    // 翻译前后字幕列表
    // [
    //   {
    //     "end": 2.5,
    //     "text": "大家好\nHello",
    //     "start": 0
    //   }
    // ]

    // DOEND 真实请求
    // if (USE_JAVA_REQUEST) {
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

    const genSrtList = (genSrtItem.subtitleData as unknown as any[]) || [];
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

    if (list.length === 0) {
      return respErr('获取字幕对比列表为空')
    }
    // 5. 获取R2前缀URL
    const preUrl = await getSystemConfigByKey('r2.public.base_url');
    return respData({
      list,
      preUrl,
      env: process.env.ENV || 'dev'
    });
    // }
    // 模拟
    // else {
    //   // 读取同目录下 mock_srt_compare.json 并直接返回其内容
    //   const mockPath = path.join(
    //       process.cwd(),
    //       'src/app/api/video-task/getCompareSrtList/mock_srt_compare.json');
    //   const mockRaw = fs.readFileSync(mockPath, 'utf-8');
    //   const mockJson = JSON.parse(mockRaw);

    //   // 延迟1秒
    //   // await new Promise(resolve => setTimeout(resolve, 1500));
    //   return respData(mockJson);
    // }



  } catch (error) {
    console.error('获取字幕对比列表失败:', error);
    return respErr('获取字幕对比列表失败')
  }
}
