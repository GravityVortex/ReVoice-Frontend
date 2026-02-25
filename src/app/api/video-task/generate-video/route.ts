import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskSubtitleByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';
import { hasPermission } from '@/shared/services/rbac';
import { pyMergeVideoJobStart, pyMergeVideoJobStatus } from '@/shared/services/pythonService';

const TERMINAL_MODAL_STATUSES = new Set(['FAILURE', 'INIT_FAILURE', 'TERMINATED', 'TIMEOUT']);

function makeRequestKey(parts: string[]) {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
}

/**
 * 合成最终final视频
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || '';
    const jobIdParam = searchParams.get('jobId') || '';

    if (!taskId) {
      return respErr('缺少参数taskId');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const taskSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'translate_srt');
    if (!taskSubtitle) {
      return respErr('任务不存在');
    }
    if (taskSubtitle.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    let jobId = jobIdParam;
    if (!jobId) {
      const subtitleArray: any = taskSubtitle?.subtitleData || [];
      if (!subtitleArray || subtitleArray.length === 0) {
        return respErr('没有合成的字幕数据');
      }
      const nameArray = subtitleArray
        .map((item: any) => item?.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
      const requestKey = makeRequestKey(['merge', taskId, ...nameArray]);
      let submitBack: any;
      try {
        submitBack = await pyMergeVideoJobStart(taskId, nameArray, { idempotencyKey: requestKey });
      } catch (e) {
        // Retry once; Modal cold starts can drop the first request.
        submitBack = await pyMergeVideoJobStart(taskId, nameArray, { idempotencyKey: requestKey });
      }
      if (submitBack?.code !== 200 || !submitBack?.job_id) {
        return respErr(submitBack?.message || 'job not found');
      }
      jobId = submitBack.job_id;
    }

    const back = await pyMergeVideoJobStatus(jobId);
    const modalStatus = back?.modal_status as string | undefined;

    if (back?.code === 200 && modalStatus === 'SUCCESS') {
      // Keep the same "data-only" contract on success.
      return respData(back.data);
    }

    if (modalStatus && TERMINAL_MODAL_STATUSES.has(modalStatus)) {
      return respErr(back?.message || 'job failed');
    }

    return respData({
      status: 'pending',
      jobId,
      modalStatus: modalStatus || 'PENDING',
    });
  } catch (e) {
    console.error('[generate-video] status query failed:', e);
    return respErr('failed');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const taskId = body?.taskId as string | undefined;

    if (!taskId) {
      return respErr('缺少参数taskId');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const taskSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'translate_srt');
    if (!taskSubtitle) {
      return respErr('任务不存在');
    }
    if (taskSubtitle.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const subtitleArray: any = taskSubtitle?.subtitleData || [];
    if (!subtitleArray || subtitleArray.length === 0) {
      return respErr('没有合成的字幕数据');
    }

    // ["0001_00-00-00-000_00-00-04-000","0002_00-00-04-020_00-00-05-010"]
    const nameArray = subtitleArray
      .map((item: any) => item?.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    console.log('nameArray--->', nameArray);

    const requestKey = makeRequestKey(['merge', taskId, ...nameArray]);

    let submitBack: any;
    try {
      submitBack = await pyMergeVideoJobStart(taskId, nameArray, { idempotencyKey: requestKey });
    } catch (e) {
      // Retry once; Modal cold starts can drop the first request.
      submitBack = await pyMergeVideoJobStart(taskId, nameArray, { idempotencyKey: requestKey });
    }
    if (submitBack?.code !== 200 || !submitBack?.job_id) {
      return respErr('视频合成任务提交失败！' + (submitBack?.message || ''));
    }

    return respData({
      status: 'pending',
      jobId: submitBack.job_id,
      requestKey,
      message: '视频合成任务已提交，较耗时请耐心等候。',
    });
  } catch (error) {
    console.error('合成视频失败:', error);
    return respErr('合成失败');
  }
}
