import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById, updateVtTaskMain } from '@/shared/models/vt_task_main';
import { findVtTaskSubtitleByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';
import { hasPermission } from '@/shared/services/rbac';
import { pyMergeVideoJobStart, pyMergeVideoJobStatus } from '@/shared/services/pythonService';

const TERMINAL_MODAL_STATUSES = new Set(['FAILURE', 'INIT_FAILURE', 'TERMINATED', 'TIMEOUT']);

function makeRequestKey(parts: string[]) {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
}

function safeJsonParseObject(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string') return {};
  const txt = raw.trim();
  if (!txt) return {};
  try {
    const obj = JSON.parse(txt);
    return obj && typeof obj === 'object' ? (obj as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function normalizeSubtitleArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeRevMs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  const n = Number.parseInt(String(v || ''), 10);
  if (Number.isFinite(n)) return Math.max(0, n);
  return 0;
}

function computeMergeInput(subtitleArray: any[]) {
  const ids: string[] = [];
  const h = createHash('sha256');
  for (const row of subtitleArray) {
    const id = typeof row?.id === 'string' ? String(row.id) : '';
    if (!id) continue;
    const audioRev = normalizeRevMs((row as any)?.audio_rev_ms);
    const timingRev = normalizeRevMs((row as any)?.timing_rev_ms);
    ids.push(id);
    h.update(id);
    h.update('\u0000');
    h.update(String(audioRev));
    h.update('\u0000');
    h.update(String(timingRev));
    h.update('\n');
  }
  if (ids.length === 0) {
    return { ids, inputDigest: '' };
  }
  return { ids, inputDigest: h.digest('hex').slice(0, 24) };
}

async function persistVideoMergeMeta(taskId: string, userId: string, patch: (meta: any) => void) {
  try {
    const task = await findVtTaskMainById(taskId);
    if (!task) return;
    const root = safeJsonParseObject(task.metadata);
    if (!root.videoMerge || typeof root.videoMerge !== 'object') root.videoMerge = {};
    patch(root);
    await updateVtTaskMain(taskId, {
      metadata: JSON.stringify(root),
      updatedAt: new Date(),
      updatedBy: userId,
    });
  } catch (e) {
    console.warn('[generate-video] persist metadata failed:', e);
  }
}

/**
 * 合成最终final视频
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || '';
    const jobIdParam = searchParams.get('jobId') || '';
    const mode = searchParams.get('mode') || '';

    if (!taskId) {
      return respErr('缺少参数taskId');
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

    const subtitleArray = normalizeSubtitleArray((taskSubtitle as any)?.subtitleData);
    const mergeInput = computeMergeInput(subtitleArray);
    const currentRequestKey = mergeInput.inputDigest ? makeRequestKey(['merge', taskId, mergeInput.inputDigest]) : '';

    const taskMeta = safeJsonParseObject(task.metadata);
    const videoMerge = (taskMeta.videoMerge && typeof taskMeta.videoMerge === 'object') ? taskMeta.videoMerge : {};
    const storedActive = (videoMerge as any)?.active && typeof (videoMerge as any).active === 'object' ? (videoMerge as any).active : null;
    const storedJobId = typeof storedActive?.jobId === 'string' ? String(storedActive.jobId) : '';

    // mode=status: only query status; never auto-start a new job.
    if (mode === 'status') {
      const jobId = jobIdParam || storedJobId;
      if (!jobId) {
        return respData({
          status: 'idle',
          jobId: '',
          modalStatus: 'IDLE',
          requestKey: currentRequestKey,
          inputDigest: mergeInput.inputDigest,
          active: storedActive,
          lastSuccess: (videoMerge as any)?.lastSuccess ?? null,
        });
      }

      const back = await pyMergeVideoJobStatus(jobId);
      const modalStatus = back?.modal_status as string | undefined;
      const matchActive = !!storedActive && storedJobId === jobId;
      const nowMs = Date.now();
      const mergedAtMs = matchActive
        ? (normalizeRevMs((storedActive as any)?.createdAtMs) || nowMs)
        : nowMs;

      if (back?.code === 200 && modalStatus === 'SUCCESS') {
        if (matchActive) {
          await persistVideoMergeMeta(taskId, user.id, (root) => {
            const vm = root.videoMerge as any;
            vm.lastSuccess = {
              mergedAtMs,
              requestKey: String(storedActive.requestKey || currentRequestKey || ''),
              inputDigest: String(storedActive.inputDigest || mergeInput.inputDigest || ''),
              result: back.data,
            };
            vm.active = null;
          });
        }
        return respData({
          status: 'success',
          jobId,
          modalStatus: 'SUCCESS',
          mergedAtMs,
          result: back.data,
        });
      }

      if (modalStatus && TERMINAL_MODAL_STATUSES.has(modalStatus)) {
        if (matchActive) {
          await persistVideoMergeMeta(taskId, user.id, (root) => {
            const vm = root.videoMerge as any;
            vm.active = {
              ...storedActive,
              state: 'failed',
              modalStatus,
              errorMessage: String(back?.message || 'job failed'),
              endedAtMs: nowMs,
            };
          });
        }
        return respData({
          status: 'failed',
          jobId,
          modalStatus,
          errorMessage: back?.message || 'job failed',
        });
      }

      return respData({
        status: 'pending',
        jobId,
        modalStatus: modalStatus || 'PENDING',
      });
    }

    let jobId = jobIdParam;
    if (!jobId) {
      // Prefer the persisted active job (same requestKey) if present.
      const storedRequestKey = typeof storedActive?.requestKey === 'string' ? String(storedActive.requestKey) : '';
      if (storedRequestKey && storedRequestKey === currentRequestKey && storedJobId) {
        jobId = storedJobId;
      } else {
        if (!subtitleArray || mergeInput.ids.length === 0) {
          return respErr('没有合成的字幕数据');
        }

        let submitBack: any;
        try {
          submitBack = await pyMergeVideoJobStart(taskId, mergeInput.ids, { idempotencyKey: currentRequestKey });
        } catch (e) {
          // Retry once; Modal cold starts can drop the first request.
          submitBack = await pyMergeVideoJobStart(taskId, mergeInput.ids, { idempotencyKey: currentRequestKey });
        }
        if (submitBack?.code !== 200 || !submitBack?.job_id) {
          return respErr(submitBack?.message || 'job not found');
        }
        jobId = submitBack.job_id;

        // Persist active job for refresh/resume.
        const nowMs = Date.now();
        await persistVideoMergeMeta(taskId, user.id, (root) => {
          const vm = root.videoMerge as any;
          vm.active = {
            requestKey: currentRequestKey,
            inputDigest: mergeInput.inputDigest,
            jobId,
            state: 'pending',
            modalStatus: 'PENDING',
            createdAtMs: nowMs,
          };
        });
      }
    }

    const back = await pyMergeVideoJobStatus(jobId);
    const modalStatus = back?.modal_status as string | undefined;

    if (back?.code === 200 && modalStatus === 'SUCCESS') {
      // Only mark success if this job is still the persisted active job.
      const nowMs = Date.now();
      if (storedActive && storedJobId === jobId) {
        await persistVideoMergeMeta(taskId, user.id, (root) => {
          const vm = root.videoMerge as any;
          vm.lastSuccess = {
            // NOTE: use the *trigger time* as the baseline for pending detection.
            // If users apply changes while merge is running, those changes should remain pending.
            mergedAtMs: normalizeRevMs((storedActive as any)?.createdAtMs) || nowMs,
            requestKey: String((storedActive as any)?.requestKey || currentRequestKey || ''),
            inputDigest: String((storedActive as any)?.inputDigest || mergeInput.inputDigest || ''),
            result: back.data,
          };
          vm.active = null;
        });
      }
      // Keep the same "data-only" contract on success.
      return respData(back.data);
    }

    if (modalStatus && TERMINAL_MODAL_STATUSES.has(modalStatus)) {
      // Persist failure if this job is still the persisted active job.
      const nowMs = Date.now();
      if (storedActive && storedJobId === jobId) {
        await persistVideoMergeMeta(taskId, user.id, (root) => {
          const vm = root.videoMerge as any;
          vm.active = {
            ...(storedActive as any),
            state: 'failed',
            modalStatus,
            errorMessage: String(back?.message || 'job failed'),
            endedAtMs: nowMs,
          };
        });
      }
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

    const subtitleArray = normalizeSubtitleArray((taskSubtitle as any)?.subtitleData);
    const mergeInput = computeMergeInput(subtitleArray);
    if (!subtitleArray || mergeInput.ids.length === 0 || !mergeInput.inputDigest) {
      return respErr('没有合成的字幕数据');
    }

    const requestKey = makeRequestKey(['merge', taskId, mergeInput.inputDigest]);

    const taskMeta = safeJsonParseObject(task.metadata);
    const videoMerge = (taskMeta.videoMerge && typeof taskMeta.videoMerge === 'object') ? taskMeta.videoMerge : {};
    const storedActive = (videoMerge as any)?.active && typeof (videoMerge as any).active === 'object' ? (videoMerge as any).active : null;
    const storedJobId = typeof storedActive?.jobId === 'string' ? String(storedActive.jobId) : '';
    const storedRequestKey = typeof storedActive?.requestKey === 'string' ? String(storedActive.requestKey) : '';

    // If the same input is already being merged, reuse the persisted jobId.
    if (storedJobId && storedRequestKey && storedRequestKey === requestKey) {
      return respData({
        status: 'pending',
        jobId: storedJobId,
        requestKey,
        message: '视频合成任务已提交，较耗时请耐心等候。',
      });
    }

    let submitBack: any;
    try {
      submitBack = await pyMergeVideoJobStart(taskId, mergeInput.ids, { idempotencyKey: requestKey });
    } catch (e) {
      // Retry once; Modal cold starts can drop the first request.
      submitBack = await pyMergeVideoJobStart(taskId, mergeInput.ids, { idempotencyKey: requestKey });
    }
    if (submitBack?.code !== 200 || !submitBack?.job_id) {
      return respErr('视频合成任务提交失败！' + (submitBack?.message || ''));
    }

    // Persist active job for refresh/resume.
    const nowMs = Date.now();
    await persistVideoMergeMeta(taskId, user.id, (root) => {
      const vm = root.videoMerge as any;
      vm.active = {
        requestKey,
        inputDigest: mergeInput.inputDigest,
        jobId: submitBack.job_id,
        state: 'pending',
        modalStatus: 'PENDING',
        createdAtMs: nowMs,
      };
    });

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
