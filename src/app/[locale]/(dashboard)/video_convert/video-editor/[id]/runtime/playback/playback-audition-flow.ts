import { toast } from 'sonner';

import { primeAuditionAudio, settleAuditionPreparation, waitForAuditionReady } from '../../audio-audition-engine';
import { resolveSourceAuditionAudio } from '../../audio-source-resolver';
import {
  auditionEndedNaturally,
  auditionReady as markAuditionReady,
  startConvertAudition,
  startSourceAudition,
  stopAudition as stopTransportAudition,
  type EditorTransportState,
  type TransportBlockingReason,
  type TransportBlockingState,
  getActiveClipIndex,
} from '../../editor-transport';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

type SubtitleTrackItemLike = {
  id: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
  previewAudioUrl?: string;
};

type SourceRowLike = {
  id?: string;
  start?: string;
  end?: string;
};

type ConvertObjLike = {
  srt_source_arr?: SourceRowLike[];
};

type CreatePlaybackAuditionFlowArgs = {
  locale: string;
  t: TranslateFn;
  convertObj: ConvertObjLike | null;
  getSubtitleTrack: () => SubtitleTrackItemLike[];
  getTransportState: () => EditorTransportState;
  getVideoElement: () => HTMLVideoElement | null | undefined;
  getSourceAuditionAudio: () => HTMLAudioElement | null;
  setSourceAuditionAudio: (audio: HTMLAudioElement | null) => void;
  getAuditionRestoreState: () => { subtitleMuted: boolean; bgmMuted: boolean; videoMuted: boolean } | null;
  setAuditionRestoreState: (next: { subtitleMuted: boolean; bgmMuted: boolean; videoMuted: boolean } | null) => void;
  getSubtitleMuted: () => boolean;
  setSubtitleMuted: (value: boolean) => void;
  getBgmMuted: () => boolean;
  setBgmMuted: (value: boolean) => void;
  getVolume: () => number;
  getActiveAuditionType: () => 'source' | 'convert' | null;
  setActiveAuditionType: (next: 'source' | 'convert' | null) => void;
  getAuditionStopAtMs: () => number | null;
  setAuditionStopAtMs: (next: number | null) => void;
  getPlayingSubtitleIndex: () => number;
  setPlayingSubtitleIndex: (value: number) => void;
  nextAuditionToken: () => number;
  getAuditionToken: () => number;
  getAuditionAbortController: () => AbortController | null;
  setAuditionAbortController: (controller: AbortController | null) => void;
  getAbortReason: () => unknown;
  abortActiveAuditionPreparation: () => void;
  clearAuditionNaturalStopTimer: () => void;
  setTransportStalled: (value: boolean) => void;
  nextVideoStartGateToken: () => number;
  nextVideoPlayToken: () => number;
  setIsVideoBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  dispatchTransport: (
    action:
      | ReturnType<typeof startSourceAudition>
      | ReturnType<typeof startConvertAudition>
      | ReturnType<typeof stopTransportAudition>
      | ReturnType<typeof auditionEndedNaturally>
      | ReturnType<typeof markAuditionReady>
  ) => void;
  logEditorTransport: (level: 'debug' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => void;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  evaluateConvertAuditionGateForClipIndex: (clipIndex: number) => { kind: 'ready' } | { kind: 'voice_unavailable'; clipIndex: number; subtitleId: string; reason: TransportBlockingReason };
  createVoiceUnavailableBlockingState: (gate: {
    kind: 'voice_unavailable';
    clipIndex: number;
    subtitleId: string;
    reason: TransportBlockingReason;
  }) => TransportBlockingState;
  pausePlaybackForBlockingState: (nextState: TransportBlockingState, pauseAtSec?: number) => Promise<void>;
  handleSeek: (time: number, isDragging?: boolean, isAuditionSeek?: boolean) => void;
  ensureVoiceBuffer: (url: string, signal: AbortSignal) => Promise<unknown>;
  cacheGetVoice: (key: string) => AudioBuffer | null;
  handleAuditionStopFallback: (naturalEnd?: boolean) => void;
};

export function createPlaybackAuditionFlow(args: CreatePlaybackAuditionFlowArgs) {
  const handleAuditionStop = (naturalEnd = false) => {
    args.clearAuditionNaturalStopTimer();
    args.nextVideoStartGateToken();
    args.nextVideoPlayToken();
    args.abortActiveAuditionPreparation();
    args.setTransportStalled(false);
    args.setIsVideoBuffering(false);

    const transportState = args.getTransportState();
    const endedIndex = getActiveClipIndex(transportState) ?? args.getPlayingSubtitleIndex() ?? -1;
    const endedClipId = endedIndex >= 0 && endedIndex < args.getSubtitleTrack().length ? (args.getSubtitleTrack()[endedIndex]?.id ?? null) : null;
    args.logEditorTransport('debug', naturalEnd ? 'audition-natural-stop' : 'audition-stop', {
      clipId: endedClipId,
      mode: args.getVideoSyncMode(),
      endedIndex,
    });

    void args.applyVideoTransportSnapshot(
      {
        mode: args.getVideoSyncMode(),
        status: 'paused',
        transportTimeSec: args.getVideoTransportTimeSec(),
      },
      {
        seekToleranceSec: 0,
      }
    );
    try {
      const audio = args.getSourceAuditionAudio();
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.pause();
      }
    } catch {
      // ignore
    }

    args.setIsPlaying(false);
    args.setPlayingSubtitleIndex(-1);
    args.setActiveAuditionType(null);
    args.setAuditionStopAtMs(null);
    args.dispatchTransport(naturalEnd ? auditionEndedNaturally() : stopTransportAudition());

    const restore = args.getAuditionRestoreState();
    if (restore) {
      args.setSubtitleMuted(restore.subtitleMuted);
      args.setBgmMuted(restore.bgmMuted);
      const videoEl = args.getVideoElement();
      if (videoEl) videoEl.muted = restore.videoMuted;
      args.setAuditionRestoreState(null);
    }
  };

  const handleAuditionRequestPlay = async (index: number, mode: 'source' | 'convert') => {
    if (index < 0 || index >= args.getSubtitleTrack().length) return;
    const item = args.getSubtitleTrack()[index];
    args.logEditorTransport('debug', 'audition-request', {
      clipId: item.id,
      mode,
      index,
    });
    const token = args.nextAuditionToken();
    args.clearAuditionNaturalStopTimer();
    args.abortActiveAuditionPreparation();
    const controller = new AbortController();
    args.setAuditionAbortController(controller);

    const releaseAuditionController = () => {
      if (args.getAuditionAbortController() === controller) {
        args.setAuditionAbortController(null);
      }
    };

    try {
      args.getSourceAuditionAudio()?.pause();
    } catch {
      // ignore
    }

    const videoEl = args.getVideoElement();
    if (mode === 'source' && !args.convertObj) {
      releaseAuditionController();
      args.logEditorTransport('warn', 'source-audition-missing-context', {
        clipId: item.id,
        mode,
        index,
      });
      toast.error(args.t('videoEditor.toast.audioLoadFailed') || 'Audio load failed');
      return;
    }

    if (mode === 'convert') {
      const gate = args.evaluateConvertAuditionGateForClipIndex(index);
      if (gate.kind === 'voice_unavailable') {
        releaseAuditionController();
        args.setPlayingSubtitleIndex(index);
        await args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), item.startTime);
        return;
      }
      if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {
        releaseAuditionController();
        args.setPlayingSubtitleIndex(index);
        toast.error(args.t('videoEditor.toast.addVideoFirst'));
        return;
      }
    }

    if (!args.getAuditionRestoreState()) {
      args.setAuditionRestoreState({
        subtitleMuted: args.getSubtitleMuted(),
        bgmMuted: args.getBgmMuted(),
        videoMuted: videoEl?.muted ?? false,
      });
    }

    args.setPlayingSubtitleIndex(index);
    args.setActiveAuditionType(mode);
    args.setAuditionStopAtMs(item.startTime * 1000 + item.duration * 1000);
    args.dispatchTransport(
      mode === 'source'
        ? startSourceAudition({
            index,
            timeSec: item.startTime,
            stopAtSec: item.startTime + item.duration,
          })
        : startConvertAudition({
            index,
            timeSec: item.startTime,
            stopAtSec: item.startTime + item.duration,
          })
    );

    if (mode === 'convert') {
      args.setSubtitleMuted(false);
      if (videoEl) videoEl.muted = true;
    } else {
      args.setSubtitleMuted(true);
      if (videoEl) videoEl.muted = true;
    }

    args.setBgmMuted(true);
    args.handleSeek(item.startTime, false, true);

    if (mode === 'source' && args.convertObj) {
      const sourceEntry = args.convertObj.srt_source_arr?.[index];
      const resolvedSourceAudio = resolveSourceAuditionAudio({
        convertObj: args.convertObj as never,
        sourceEntry: sourceEntry as never,
      });
      const sourceClipId = sourceEntry?.id || String(index + 1);
      args.logEditorTransport('debug', 'source-audition-resolved', {
        clipId: sourceClipId,
        mode,
        primary: resolvedSourceAudio.primary?.source ?? null,
        fallback: resolvedSourceAudio.fallback?.source ?? null,
      });

      if (!args.getSourceAuditionAudio()) {
        args.setSourceAuditionAudio(new Audio());
      }
      const audioEl = args.getSourceAuditionAudio();
      if (!audioEl) return;
      audioEl.volume = args.getVolume() / 100;
      audioEl.ontimeupdate = null;
      audioEl.onerror = null;
      audioEl.onended = null;

      const parseSrtTime = (raw: string) => {
        const [hms, ms] = raw.split(',');
        const [h, m, sec] = hms.split(':').map(Number);
        return h * 3600 + m * 60 + sec + (Number(ms) || 0) / 1000;
      };

      const applySourceCandidate = async (candidate: { url: string; source: 'source_segment' | 'vocal_fallback' } | null) => {
        if (!candidate?.url || controller.signal.aborted) {
          return {
            gesturePlayPromise: null as Promise<void> | null,
            readyResult: { status: 'aborted' as const, latencyMs: 0 },
          };
        }
        audioEl.preload = 'auto';
        audioEl.src = candidate.url;
        if (candidate.source === 'vocal_fallback') {
          if (!sourceEntry?.start) {
            return {
              gesturePlayPromise: null as Promise<void> | null,
              readyResult: { status: 'error' as const, latencyMs: 0, code: 'missing_source_timing' },
            };
          }
          const startSec = parseSrtTime(sourceEntry.start);
          const endSec = resolvedSourceAudio.stopAtSec ?? (sourceEntry.end ? parseSrtTime(sourceEntry.end) : startSec + 10);
          audioEl.currentTime = startSec;
          audioEl.ontimeupdate = () => {
            if (audioEl.currentTime >= endSec) {
              audioEl.ontimeupdate = null;
              audioEl.onended = null;
              audioEl.pause();
              args.handleAuditionStopFallback(true);
            }
          };
        } else {
          audioEl.currentTime = 0;
        }
        const gesturePlayPromise = primeAuditionAudio(audioEl);
        const readyResult = await waitForAuditionReady(audioEl, {
          timeoutMs: candidate.source === 'vocal_fallback' ? 2500 : 4000,
          signal: controller.signal,
          debugContext: {
            clipId: sourceClipId,
            mode,
          },
        });
        return { gesturePlayPromise, readyResult };
      };

      let audioOk = false;
      let gesturePlayPromise: Promise<void> | null = null;
      let finalReadyStatus: 'ready' | 'timeout' | 'error' | 'aborted' = 'timeout';
      const primaryAttempt = await applySourceCandidate(resolvedSourceAudio.primary);
      audioOk = primaryAttempt.readyResult.status === 'ready';
      finalReadyStatus = primaryAttempt.readyResult.status;
      gesturePlayPromise = primaryAttempt.gesturePlayPromise;
      if (controller.signal.aborted || token !== args.getAuditionToken()) return;

      if (!audioOk && resolvedSourceAudio.fallback?.url && resolvedSourceAudio.fallback.url !== resolvedSourceAudio.primary?.url) {
        args.logEditorTransport('warn', 'source-audition-fallback', {
          clipId: sourceClipId,
          mode,
          primaryStatus: primaryAttempt.readyResult?.status,
        });
        const fallbackAttempt = await applySourceCandidate(resolvedSourceAudio.fallback);
        audioOk = fallbackAttempt.readyResult.status === 'ready';
        finalReadyStatus = fallbackAttempt.readyResult.status;
        if (!gesturePlayPromise) gesturePlayPromise = fallbackAttempt.gesturePlayPromise;
        if (controller.signal.aborted || token !== args.getAuditionToken()) return;
      }

      if (gesturePlayPromise) await gesturePlayPromise;
      if (controller.signal.aborted || token !== args.getAuditionToken() || finalReadyStatus === 'aborted') return;

      if (!audioOk) {
        releaseAuditionController();
        args.handleAuditionStopFallback(false);
        if (finalReadyStatus === 'error') {
          args.logEditorTransport('error', 'source-audition-load-failed', {
            clipId: sourceClipId,
            mode,
          });
          toast.error(args.t('videoEditor.toast.audioLoadFailed') || 'Audio load failed');
        } else {
          args.logEditorTransport('warn', 'source-audition-timeout', {
            clipId: sourceClipId,
            mode,
          });
        }
        return;
      }

      if (token !== args.getAuditionToken()) return;
      releaseAuditionController();
      args.dispatchTransport(markAuditionReady());
      audioEl.onended = () => {
        args.handleAuditionStopFallback(true);
      };
      audioEl.play().catch((error) => {
        args.logEditorTransport('error', 'source-audition-play-failed', {
          clipId: sourceClipId,
          mode,
          error,
        });
      });
      void args.applyVideoTransportSnapshot(
        {
          mode: 'audition_source',
          status: 'playing',
          transportTimeSec: item.startTime,
        },
        {
          playReason: 'audition',
          seekToleranceSec: 0,
        }
      );
    } else if (mode === 'convert') {
      const seg = args.getSubtitleTrack()[index];
      const voiceUrl = (seg?.previewAudioUrl || seg?.audioUrl || '').trim();

      if (voiceUrl && !args.cacheGetVoice(voiceUrl)) {
        try {
          const prepResult = await settleAuditionPreparation(args.ensureVoiceBuffer(voiceUrl, controller.signal), {
            timeoutMs: 4000,
            signal: controller.signal,
            debugContext: {
              clipId: item.id,
              mode,
            },
          });
          if (prepResult.status === 'timeout') {
            args.logEditorTransport('warn', 'convert-audition-prepare-timeout', {
              clipId: item.id,
              mode,
            });
            controller.abort(args.getAbortReason());
            releaseAuditionController();
            args.handleAuditionStopFallback(false);
            toast.info?.(args.locale === 'zh' ? '音频准备超时，请重试' : 'Audio timed out, please retry');
            return;
          }
          if (prepResult.status === 'aborted') return;
          if (prepResult.status === 'error') {
            args.logEditorTransport('warn', 'convert-audition-prepare-failed', {
              clipId: item.id,
              mode,
              code: prepResult.code,
            });
            releaseAuditionController();
            args.handleAuditionStopFallback(false);
            toast.error(args.t('videoEditor.toast.audioLoadFailed') || 'Audio load failed');
            return;
          }
        } catch {
          // syncVoicePlaybackWebAudio will handle runtime fallback.
        }
        if (controller.signal.aborted || token !== args.getAuditionToken()) return;
      }

      releaseAuditionController();
      args.dispatchTransport(markAuditionReady());
      const syncStarted = await args.applyVideoTransportSnapshot(
        {
          mode: 'audition_convert',
          status: 'playing',
          transportTimeSec: item.startTime,
        },
        {
          playReason: 'audition',
          seekToleranceSec: 0,
        }
      );
      if (controller.signal.aborted || token !== args.getAuditionToken()) return;
      if (!syncStarted) {
        args.handleAuditionStopFallback(false);
      }
    }

    releaseAuditionController();
  };

  return {
    handleAuditionStop,
    handleAuditionRequestPlay,
  };
}
