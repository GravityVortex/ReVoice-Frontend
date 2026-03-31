import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

import { checkReferenceAudioExists } from '@/shared/lib/reference-audio-exists';
import { repairReferenceAudio } from '@/shared/lib/reference-audio-repair';
import { resolveTranslatedTtsReference } from '@/shared/lib/subtitle-reference-audio';
import { respData, respErr, respJson } from '@/shared/lib/resp';
import { consumeCredits, findCreditByTransactionNo, refundCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskSubtitleByTaskIdAndStepName, patchSubtitleItemById } from '@/shared/models/vt_task_subtitle';
import { javaSubtitleSingleTranslate } from '@/shared/services/javaService';
import { hasPermission } from '@/shared/services/rbac';
import {
  pyConvertTxtGenerateVoice,
  pyConvertTxtGenerateVoiceJobStatus,
  pyOriginalTxtTranslateJobStatus,
  StructuredFetchError,
  StructuredErrorData,
} from '@/shared/services/pythonService';

const TERMINAL_MODAL_STATUSES = new Set(['FAILURE', 'INIT_FAILURE', 'TERMINATED', 'TIMEOUT']);

function buildStructuredPayload(error: StructuredFetchError): StructuredErrorData {
  return {
    ...error.data,
    reason: error.data?.reason ?? error.message,
  };
}

function structuredErrorResponse(error: StructuredFetchError, message?: string) {
  const payload = buildStructuredPayload(error);
  return respJson(-1, message ?? payload.reason ?? error.message, payload, 503);
}

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

function normalizeSubtitleArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapTranslateError(e: any): string {
  const msg = String(e?.message || '');
  if (msg.includes('rate limit') || msg.includes('Rate limit')) {
    return 'Translation service is busy, please try again in a moment';
  }
  if (msg.includes('access denied') || msg.includes('403')) {
    return 'Translation service temporarily unavailable';
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return 'Translation timed out, please try again';
  }
  if (msg.includes('connection') || msg.includes('Connection')) {
    return 'Translation service connection error, please try again';
  }
  return 'Translation failed, please try again';
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
        console.error('[generate-subtitle-voice] translate failed:', e?.message || e);
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr(mapTranslateError(e));
      }

      if (!translated) {
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr('Translation returned empty result, please try again');
      }

      // 保持刷新恢复能力：写入草稿文本，并清理旧 job 标记，避免前端误轮询。
      // 同时清除旧的 vap_draft_audio_path，因为新翻译后旧配音已与文本不匹配。
      try {
        await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
          vap_draft_txt: translated,
          vap_draft_audio_path: null,
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
      const translateRows = normalizeSubtitleArray((taskSubtitle as any)?.subtitleData);
      const sourceSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'gen_srt');
      const sourceRows = normalizeSubtitleArray((sourceSubtitle as any)?.subtitleData);
      const referenceSubtitle = resolveTranslatedTtsReference({
        subtitleName,
        translateRows,
        sourceRows,
      });

      if (referenceSubtitle.status !== 'resolved') {
        console.error('[generate-subtitle-voice] reference subtitle unresolved', {
          taskId,
          subtitleName,
          reason: referenceSubtitle.reason,
          diagnostics: referenceSubtitle.diagnostics,
        });
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return respErr(`切割参考音频定位失败：${referenceSubtitle.reason}`);
      }

      const referenceSubtitleName = referenceSubtitle.referenceSubtitleName;
      if (referenceSubtitle.diagnostics.lineageMismatch) {
        console.warn('[generate-subtitle-voice] reference subtitle lineage mismatch', {
          taskId,
          subtitleName,
          translateParentId: referenceSubtitle.diagnostics.translateParentId,
          sourceParentId: referenceSubtitle.diagnostics.sourceParentId,
        });
      }
      console.info('[generate-subtitle-voice] reference subtitle resolved', {
        taskId,
        subtitleName,
        referenceSubtitleName,
        strategy: referenceSubtitle.strategy,
        needsBackfill: referenceSubtitle.needsBackfill,
        diagnostics: referenceSubtitle.diagnostics,
      });

      if (referenceSubtitle.needsBackfill && referenceSubtitle.patch) {
        try {
          await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, referenceSubtitle.patch);
        } catch (e) {
          console.warn('[generate-subtitle-voice] persist tts reference backfill failed:', e);
        }
      }

      if (referenceSubtitleName && referenceSubtitleName !== subtitleName) {
        const taskOwnerId = typeof (taskSubtitle as any)?.userId === 'string' ? (taskSubtitle as any).userId.trim() : '';
        if (!taskOwnerId) {
          if (consumedCreditId) {
            await refundCredits({ creditId: consumedCreditId }).catch(() => {});
          }
          return respErr('参考音频不存在：missing_task_owner');
        }
        const existence = await checkReferenceAudioExists({
          taskId,
          userId: taskOwnerId,
          referenceSubtitleName,
        });
        if (!existence.exists) {
          console.warn('[generate-subtitle-voice] reference audio missing, attempting repair', {
            taskId,
            subtitleName,
            referenceSubtitleName,
            ...existence,
          });
          const repair = await repairReferenceAudio({
            taskId,
            userId: taskOwnerId,
            referenceSubtitleName,
          });
          if (repair.status !== 'repaired' && repair.status !== 'already_exists') {
            const failedRepair = repair as Extract<typeof repair, { bucket?: string; copyResult?: unknown }>;
            console.error('[generate-subtitle-voice] reference audio repair failed', {
              taskId,
              subtitleName,
              referenceSubtitleName,
              repairStatus: repair.status,
              target: repair.target,
              source: repair.source,
              bucket: failedRepair.bucket,
              copyResult: failedRepair.copyResult,
            });
            if (consumedCreditId) {
              await refundCredits({ creditId: consumedCreditId }).catch(() => {});
            }
            return respErr(`参考音频不存在：${repair.target.path}`);
          }
          console.info('[generate-subtitle-voice] reference audio repaired', {
            taskId,
            subtitleName,
            referenceSubtitleName,
            repairStatus: repair.status,
            target: repair.target,
            source: repair.source,
          });
        }
      }

      // A 路线（同步版，无 jobId）：直接调用 TTS 同步接口拿到 path_name/duration。
      let back: any;
      const handleStructuredError = async (err: StructuredFetchError) => {
        if (consumedCreditId) {
          await refundCredits({ creditId: consumedCreditId }).catch(() => {});
        }
        return structuredErrorResponse(err, 'TTS 平台暂不可用，请稍后重试');
      };

      try {
        back = await pyConvertTxtGenerateVoice(
          taskId,
          text,
          subtitleName,
          referenceSubtitleName ? { referenceSubtitleName } : undefined
        );
      } catch (error) {
        if (error instanceof StructuredFetchError) {
          return handleStructuredError(error);
        }
        // Retry once; Modal cold starts can drop the first request.
        try {
          back = await pyConvertTxtGenerateVoice(
            taskId,
            text,
            subtitleName,
            referenceSubtitleName ? { referenceSubtitleName } : undefined
          );
        } catch (e2) {
          if (e2 instanceof StructuredFetchError) {
            return handleStructuredError(e2);
          }
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
        console.error('[generate-subtitle-voice] tts failed:', back?.message);
        return respErr('Voice generation failed, please try again');
      }

      // Persist draft result for seamless refresh/resume (without vt_task_main).
      // Also save vap_draft_txt so the text stays consistent with the audio
      // even if the client-side auto-save hasn't flushed yet.
      const nowMs = Date.now();
      try {
        await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, {
          vap_draft_audio_path: back?.data?.path_name ?? null,
          vap_draft_duration: back?.data?.duration ?? null,
          vap_draft_txt: text,
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
    if (consumedCreditId) {
      await refundCredits({ creditId: consumedCreditId }).catch(() => {});
    }
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    return respErr(isTimeout ? '请求超时，请重试' : '生成语音失败');
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
            vap_draft_audio_path: null,
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
    if (e instanceof StructuredFetchError) {
      return structuredErrorResponse(e, 'TTS 平台暂不可用，请稍后重试');
    }
    return respErr('failed');
  }
}
