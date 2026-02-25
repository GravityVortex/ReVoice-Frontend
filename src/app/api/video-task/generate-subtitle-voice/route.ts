import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

import { respData, respErr } from '@/shared/lib/resp';
import { consumeCredits, findCreditByTransactionNo, refundCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskSubtitleByTaskIdAndStepName, patchSubtitleItemById } from '@/shared/models/vt_task_subtitle';
import { javaSubtitleSingleTranslate } from '@/shared/services/javaService';
import { hasPermission } from '@/shared/services/rbac';
import {
  pyConvertTxtGenerateVoice,
  pyConvertTxtGenerateVoiceJobStatus,
  pyOriginalTxtTranslateJobStatus,
} from '@/shared/services/pythonService';

const TERMINAL_MODAL_STATUSES = new Set(['FAILURE', 'INIT_FAILURE', 'TERMINATED', 'TIMEOUT']);

function makeRequestKey(parts: string[]) {
  // Short stable key so we can dedupe retries without blocking legit re-runs with new input.
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
}

function pickStoredRequestKey(subtitleData: any, subtitleName: string, type: string): string {
  const arr = Array.isArray(subtitleData) ? subtitleData : [];
  const item = arr.find((x: any) => x?.id === subtitleName);
  if (!item || typeof item !== 'object') return '';
  const key =
    type === 'gen_srt'
      ? (item as any)?.vap_tr_request_key
      : type === 'translate_srt'
        ? (item as any)?.vap_tts_request_key
        : '';
  return typeof key === 'string' ? key : '';
}

/**
 * 生成字幕语音
 */
export async function POST(request: NextRequest) {
  let consumedCreditId: string | undefined;
  try {
    const body = await request.json();
    // subtitleName: 0001_00-00-00-000_00-00-04-000
    const { type, text, preText, subtitleName, taskId, languageTarget } = body;
    const user = await getUserInfo();

    if (!type || !text || !taskId || !subtitleName || !languageTarget) {
      return respErr('缺少参数');
    }
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const taskSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, type);
    if (!taskSubtitle) {
      return respErr('任务不存在');
    }
    if (taskSubtitle.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    // Billing (server-side): charge for GPU/AI work only.
    // - gen_srt: subtitle segment re-translate => 1 credit
    // - translate_srt: audio segment re-generate (tts) => 2 credits
    const costCredits = type === 'gen_srt' ? 1 : type === 'translate_srt' ? 2 : 0;
    if (costCredits <= 0) {
      return respErr('unsupported type');
    }

    const requestKey =
      type === 'gen_srt'
        ? makeRequestKey(['gen_srt', taskId, subtitleName, String(languageTarget), String(text), String(preText || '')])
        : makeRequestKey(['translate_srt', taskId, subtitleName, String(text)]);
    const scene = type === 'gen_srt' ? 'subtitle_retranslate' : 'audio_regen';
    try {
      const consumed = await consumeCredits({
        userId: user.id,
        credits: costCredits,
        scene,
        description: type === 'gen_srt' ? '字幕段重翻译消耗积分' : '音频段重生成消耗积分',
        metadata: JSON.stringify({
          taskId,
          subtitleName,
          languageTarget,
          type,
        }),
        // Idempotent billing: same requestKey won't consume credits twice.
        idempotencyKey: requestKey,
      });
      consumedCreditId = consumed.id;
    } catch (e: any) {
      return respErr(e?.message || '积分不足');
    }

    // 1.1、原视频字幕文字翻译
    if (type === 'gen_srt') {
      let translated = '';
      try {
        const back = await javaSubtitleSingleTranslate({
          text,
          prevText: preText,
          languageTarget,
          themeDesc: '',
          // 给 Java 一个软超时，避免长时间占住连接。
          deadlineMs: Date.now() + 45_000,
        });
        translated = String(back?.textTranslated || '').trim();
      } catch (e: any) {
        console.error('[generate-subtitle-voice] java subtitle translate failed:', e);
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr(`java报错：${e?.message || 'translate failed'}`);
      }

      if (!translated) {
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr('java报错：empty translation');
      }

      // 保持刷新恢复能力：写入草稿文本，并清理旧 job 标记，避免前端误轮询。
      try {
        await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
          vap_draft_txt: translated,
          vap_tr_job_id: null,
          vap_tr_request_key: null,
          vap_tr_updated_at_ms: Date.now(),
        });
      } catch (e) {
        console.warn('[generate-subtitle-voice] persist translated draft failed:', e);
      }

      // 兼容前端既有字段契约：text_translated。
      return respData({ text_translated: translated });
    }

    // 1.2、翻译后的字幕文字转语音tts
    if (type === 'translate_srt') {
      // A 路线（同步版，无 jobId）：直接调用 TTS 同步接口拿到 path_name/duration。
      let back: any;
      try {
        back = await pyConvertTxtGenerateVoice(taskId, text, subtitleName);
      } catch {
        // Retry once; Modal cold starts can drop the first request.
        try {
          back = await pyConvertTxtGenerateVoice(taskId, text, subtitleName);
        } catch (e2) {
          console.error('[generate-subtitle-voice] tts sync failed:', e2);
          if (consumedCreditId) {
            await refundCredits({ creditId: consumedCreditId }).catch(() => {});
          }
          return respErr('任务失败，请重试');
        }
      }

      if (back?.code !== 200 || !back?.data?.path_name) {
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr('python报错：' + (back?.message || 'tts failed'));
      }

      // Persist draft result for seamless refresh/resume (without vt_task_main).
      const nowMs = Date.now();
      try {
        await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
          vap_draft_audio_path: back?.data?.path_name ?? null,
          vap_draft_duration: back?.data?.duration ?? null,
          vap_tts_job_id: null,
          vap_tts_request_key: requestKey,
          vap_tts_updated_at_ms: nowMs,
        });
      } catch (e) {
        console.warn('[generate-subtitle-voice] persist draft audio failed:', e);
      }

      return respData(back.data);
    }
    return respErr('unsupported type');
  } catch (error) {
    console.error('生成语音失败:', error);
    return respErr('生成语音失败');
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || '';
    const subtitleName = searchParams.get('subtitleName') || '';
    const type = searchParams.get('type') || 'translate_srt';
    const jobId = searchParams.get('jobId') || '';
    const requestKey = searchParams.get('requestKey') || '';

    if (!taskId || !subtitleName || !jobId) {
      return respErr('缺少参数');
    }

    if (!['gen_srt', 'translate_srt'].includes(type)) {
      return respErr('unsupported type');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const taskSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, type);
    if (!taskSubtitle) {
      return respErr('任务不存在');
    }
    if (taskSubtitle.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const back =
      type === 'gen_srt'
        ? await pyOriginalTxtTranslateJobStatus(jobId)
        : await pyConvertTxtGenerateVoiceJobStatus(jobId);
    const modalStatus = back?.modal_status as string | undefined;

    if (back?.code === 200 && modalStatus === 'SUCCESS') {
      // Persist draft result for seamless refresh/resume (without vt_task_main).
      const nowMs = Date.now();
      try {
        if (type === 'gen_srt') {
          await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
            vap_draft_txt: back?.data?.text_translated ?? null,
            vap_tr_job_id: null,
            vap_tr_request_key: null,
            vap_tr_updated_at_ms: nowMs,
          });
        } else {
          await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
            vap_draft_audio_path: back?.data?.path_name ?? null,
            vap_draft_duration: back?.data?.duration ?? null,
            vap_tts_job_id: null,
            vap_tts_request_key: null,
            vap_tts_updated_at_ms: nowMs,
          });
        }
      } catch (e) {
        console.warn('[generate-subtitle-voice] persist draft result failed:', e);
      }
      // Keep the client contract: return the same data shape as sync success.
      return respData(back.data);
    }

    if (modalStatus && TERMINAL_MODAL_STATUSES.has(modalStatus)) {
      // Best-effort refund (once).
      let refundKey = requestKey;
      if (!refundKey) {
        // If the client lost requestKey (refresh), read it from subtitle_data.
        try {
          const translatedSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'translate_srt');
          refundKey = pickStoredRequestKey(translatedSubtitle?.subtitleData, subtitleName, type);
        } catch {
          refundKey = '';
        }
      }
      if (refundKey) {
        try {
          const scene = type === 'gen_srt' ? 'subtitle_retranslate' : 'audio_regen';
          const transactionNo = `consume:${scene}:${user.id}:${refundKey}`;
          const creditRecord = await findCreditByTransactionNo(transactionNo);
          if (creditRecord && creditRecord.status === 'active') {
            await refundCredits({ creditId: creditRecord.id });
          }
        } catch (e) {
          console.warn('[generate-subtitle-voice] refund failed:', e);
        }
      }

      // Clear job markers so UI doesn't keep "stuck pending" after refresh.
      const nowMs = Date.now();
      try {
        if (type === 'gen_srt') {
          await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
            vap_tr_job_id: null,
            vap_tr_request_key: null,
            vap_tr_updated_at_ms: nowMs,
          });
        } else {
          await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
            vap_tts_job_id: null,
            vap_tts_request_key: null,
            vap_tts_updated_at_ms: nowMs,
          });
        }
      } catch (e) {
        console.warn('[generate-subtitle-voice] clear job markers failed:', e);
      }
      return respErr(back?.message || 'job failed');
    }

    return respData({
      status: 'pending',
      jobId,
      modalStatus: modalStatus || back?.modal_status || 'PENDING',
    });
  } catch (e) {
    console.error('[generate-subtitle-voice] status query failed:', e);
    return respErr('failed');
  }
}
