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
      // 2. DOEND 转发java轮询获取进度列表
      if (USE_JAVA_REQUEST) {
        const taskArr = await getTaskProgress(taskId);
        console.log('服务器之间POST请求响应--->', taskArr);
        mockProgress = taskArr;
      } else {
        // 模拟返回的进度数据 - 符合 TaskStep 接口
        const baseTime = Date.now() - 300000; // 5分钟前
        mockProgress = [
          {
            stepName: 'run_translate_video_job',
            stepStatus: 'failed',
            startedAt: '2025-12-11T15:23:48.33207',
            completedAt: '2025-12-11T15:23:48.33207',
          },
          {
            stepName: 'download_video',
            stepStatus: 'failed',
            startedAt: '2025-12-11T17:26:52.438093',
            completedAt: '2025-12-11T17:26:52.438093',
          },
          {
            stepName: 'original',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:39:51.838731',
            completedAt: '2025-12-11T17:39:51.838731',
          },
          {
            stepName: 'cut_original_video_head',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:39:52.24076',
            completedAt: '2025-12-11T17:39:52.24076',
          },
          {
            stepName: 'split_audio_video',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:39:59.878619',
            completedAt: '2025-12-11T17:39:59.878619',
          },
          {
            stepName: 'split_vocal_bkground',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:40:22.702259',
            completedAt: '2025-12-11T17:40:22.702259',
          },
          {
            stepName: 'gen_srt',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:40:34.331433',
            completedAt: '2025-12-11T17:40:34.331433',
          },
          {
            stepName: 'translate_srt',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:40:37.264007',
            completedAt: '2025-12-11T17:40:37.264007',
          },
          {
            stepName: 'split_audio',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:40:43.233684',
            completedAt: '2025-12-11T17:40:43.233684',
          },
          {
            stepName: 'tts',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:04.668699',
            completedAt: '2025-12-11T17:41:04.668699',
          },
          {
            stepName: 'adj_audio_time',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:09.641889',
            completedAt: '2025-12-11T17:41:09.641889',
          },
          {
            stepName: 'merge_audios',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:12.648618',
            completedAt: '2025-12-11T17:41:12.648618',
          },
          {
            stepName: 'merge_audio_video',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:15.928137',
            completedAt: '2025-12-11T17:41:15.928137',
          },
          {
            stepName: 'preview',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:19.871582',
            completedAt: '2025-12-11T17:41:19.871582',
          },
          {
            stepName: 'translate_video_pipeline_done',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:25.938517',
            completedAt: '2025-12-11T17:41:25.938517',
          },
          {
            stepName: 'frame_img',
            stepStatus: 'completed',
            startedAt: '2025-12-11T17:41:26.335233',
            completedAt: '2025-12-11T17:41:26.335233',
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
