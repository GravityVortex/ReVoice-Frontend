
// 前端轮询请求接口
import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { findVtTaskMainById, getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || '';
    const progress = searchParams.get('progress') || 'false';

    if (!taskId) {
      return respErr('taskId is required');
    }

    // 1. 查询Item
    const taskItem = await findVtTaskMainById(taskId);


    let mockProgress: any = [];
    // 如果progress为true，查询进度列表
    if (progress === 'true') {
      // 2. TODO 转发java轮询获取进度列表
      // 模拟返回的进度数据 - 符合 TaskStep 接口
      const baseTime = Date.now() - 300000; // 5分钟前
      mockProgress = [
        {
          id: 1,
          startedAt: baseTime,
          completedAt: baseTime + 15000,
          stepName: '任务创建',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 2,
          startedAt: baseTime + 15000,
          completedAt: baseTime + 45000,
          stepName: '音视频分离',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 3,
          startedAt: baseTime + 45000,
          completedAt: baseTime + 80000,
          stepName: '人声背景分离',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 4,
          startedAt: baseTime + 80000,
          completedAt: baseTime + 130000,
          stepName: '生成原始字幕',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 5,
          startedAt: baseTime + 130000,
          completedAt: baseTime + 170000,
          stepName: '翻译字幕',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 6,
          startedAt: baseTime + 170000,
          completedAt: baseTime + 195000,
          stepName: '音频切片',
          stepStatus: 'completed',
          errorMessage: '',
        },
        {
          id: 7,
          startedAt: baseTime + 195000,
          completedAt: 0,
          stepName: '语音合成',
          stepStatus: 'processing',
          errorMessage: '',
        },
        {
          id: 8,
          startedAt: 0,
          completedAt: 0,
          stepName: '音频时间对齐',
          stepStatus: 'pending',
          errorMessage: '',
        },
        {
          id: 9,
          startedAt: 0,
          completedAt: 0,
          stepName: '合并音频',
          stepStatus: 'pending',
          errorMessage: '',
        },
        {
          id: 10,
          startedAt: 0,
          completedAt: 0,
          stepName: '合并音视频',
          stepStatus: 'pending',
          errorMessage: '',
        },
      ];
    }

    // 4. 获取R2前缀URL
    // const preUrl = await getSystemConfigByKey('r2.public.base_url');

    // 返回符合新接口格式的数据
    return Response.json({
      code: 0,
      message: 'ok',
      data: {
        taskItem: taskItem,
        progressList: mockProgress,
      }
    });

  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
