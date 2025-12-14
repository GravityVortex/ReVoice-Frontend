// 前端轮询请求接口
import { getSystemConfigByKey, JAVA_SERVER_BASE_URL, USE_JAVA_REQUEST } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { getTaskProgress } from '@/shared/services/javaService';

import { doPost } from '../../request-proxy/route';

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
      if (USE_JAVA_REQUEST) {
        const taskArr = await getTaskProgress(taskId);
        console.log('服务器之间POST请求响应--->', taskArr);
        mockProgress = taskArr;
      } else {
        // 模拟返回的进度数据 - 符合 TaskStep 接口
        const baseTime = Date.now() - 300000; // 5分钟前
        mockProgress = [
          {
            stepName: 'split_audio_video',
            status: 'completed',
            progress: 10,
            startedAt: '2025-12-12T10:00:00',
            completedAt: '2025-12-12T10:05:00',
          },
          {
            stepName: 'split_vocal_bkground',
            status: 'completed',
            progress: 25,
            startedAt: '2025-12-12T10:05:00',
            completedAt: '2025-12-12T10:15:00',
          },
          {
            stepName: 'tts',
            status: 'processing',
            progress: 45,
            startedAt: '2025-12-12T10:15:00',
            completedAt: null,
          },
          // {
          //   id: 10,
          //   startedAt: 0,
          //   completedAt: 0,
          //   stepName: '合并音视频',
          //   stepStatus: 'pending',
          //   errorMessage: '',
          // },
        ];
      }
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
      },
    });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
