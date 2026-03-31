'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ConvertObj, SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';
import { createLimitedTaskQueue } from '@/shared/lib/waveform/loader';

import {
  clearBlockingState,
  clearPendingNextClip,
  createInitialTransportState,
  getActiveClipIndex,
  getAuditionStopAtSec,
  auditionReady as markAuditionReady,
  pauseTimeline,
  playTimeline,
  setActiveClipIndex,
  setAutoPlayNext as setTransportAutoPlayNext,
  setBlockingState,
  stopAudition as stopTransportAudition,
  transportReducer,
  type EditorTransportSnapshot,
  type TransportBlockingState,
} from '../../editor-transport';
import { evaluateClipConvertAuditionAvailability, evaluateClipVoiceAvailability, evaluateSubtitlePlaybackGate } from '../../playback-gate';
import type { TimelineHandle } from '../../timeline-panel';
import type { VideoPreviewRef } from '../../video-preview-panel';
import type { VideoSyncSnapshot } from '../../video-sync-controller';
import { createPlaybackAuditionFlow } from './playback-audition-flow';
import { usePlaybackAuditionRuntime } from './playback-audition-runtime';
import { createPlaybackBlockingRetryController } from './playback-blocking-retry-controller';
import { createPlaybackControlOwner } from './playback-control-owner';
import { createPlaybackSeekOwner } from './playback-seek-owner';
import { usePlaybackSessionOwner } from './playback-session-owner';
import { createPlaybackTimeLoop } from './playback-time-loop';
import { createPlaybackTransportOwner } from './playback-transport-owner';
import { createPlaybackVideoSync } from './playback-video-sync';
import { usePlaybackRuntimeEffects } from './playback-runtime-effects';
import { createPlaybackVoiceCache } from './playback-voice-cache';
import { createSubtitleAudioEngine } from './subtitle-audio-engine';

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

type UseVideoEditorPlaybackArgs = {
  convertId: string;
  convertObj: ConvertObj | null;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  documentDuration: number;
  zoom: number;
  localPendingVoiceIdSet: Set<string>;
  playbackBlockedVoiceIdSet: Set<string>;
  explicitMissingVoiceIdSet: Set<string>;
  locale: string;
  t: TranslateFn;
  scrollToItem: (id: string) => void;
};

type UseVideoEditorPlaybackResult = {
  transportSnapshot: EditorTransportSnapshot;
  timelineHandleRef: React.RefObject<TimelineHandle | null>;
  videoPreviewRef: React.RefObject<VideoPreviewRef | null>;
  currentTime: number;
  totalDuration: number;
  volume: number;
  isBgmMuted: boolean;
  isSubtitleMuted: boolean;
  isPlaying: boolean;
  handlePreviewPlayStateChange: (isPlaying: boolean) => void;
  handlePlayPause: () => void;
  handleSeek: (time: number, isDragging?: boolean, isAuditionSeek?: boolean) => void;
  handleSeekToSubtitle: (time: number) => void;
  handleGlobalVolume: (vol: number) => void;
  handleToggleBgmMute: () => void;
  handleToggleSubtitleMute: () => void;
  handleAutoPlayNextChange: (value: boolean) => void;
  handleAuditionRequestPlay: (index: number, mode: 'source' | 'convert') => Promise<void>;
  handleAuditionToggle: () => void;
  handleAuditionStop: (naturalEnd?: boolean) => void;
  handleRetryBlockedPlayback: () => void;
  handleCancelBlockedPlayback: () => void;
  handleLocateBlockedClip: () => void;
  clearVoiceCache: () => void;
  clearActiveTimelineClip: () => void;
};

function isAbortError(err: unknown) {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  if (e.name === 'AbortError' || e.code === 20) return true;
  if (typeof e.message === 'string' && /abort/i.test(e.message)) return true;
  return false;
}

const ABORT_REASON =
  typeof DOMException !== 'undefined'
    ? new DOMException('Aborted', 'AbortError')
    : Object.assign(new Error('Aborted'), { name: 'AbortError' });

function isRecoverableVoiceLoadError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  return code === 'VOICE_FETCH_TIMEOUT' || code === 'VOICE_FETCH_FAILED';
}

export function useVideoEditorPlayback(args: UseVideoEditorPlaybackArgs): UseVideoEditorPlaybackResult {
  const {
    convertId,
    convertObj,
    videoTrack,
    bgmTrack,
    subtitleTrack,
    subtitleTrackOriginal,
    documentDuration,
    zoom,
    localPendingVoiceIdSet,
    playbackBlockedVoiceIdSet,
    explicitMissingVoiceIdSet,
    locale,
    t,
    scrollToItem,
  } = args;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubtitleBuffering, setIsSubtitleBuffering] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60);
  const [volume, setVolume] = useState(80);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
  const [transportState, dispatchTransport] = useReducer(transportReducer, undefined, () => createInitialTransportState());
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSubtitleMuted, setIsSubtitleMuted] = useState(false);

  const timelineHandleRef = useRef<TimelineHandle>(null);
  const autoFollowPrevTimeRef = useRef<number>(-1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const videoPreviewRef = useRef<VideoPreviewRef>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastBgmUrlRef = useRef('');

  const subtitleAudioRef = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio2Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio3Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio4Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio5Ref = useRef<HTMLAudioElement | null>(null);
  const audioRefArr = useMemo(
    () => [subtitleAudioRef, subtitleAudio2Ref, subtitleAudio3Ref, subtitleAudio4Ref, subtitleAudio5Ref],
    []
  );

  const subtitleBackendRef = useRef<'webaudio' | 'media'>('webaudio');

  const voiceAudioCtxRef = useRef<AudioContext | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const voiceCacheRef = useRef(new Map<string, { buffer: AudioBuffer; bytes: number }>());
  const voiceCacheBytesRef = useRef(0);
  const voiceInflightRef = useRef(new Map<string, { controller: AbortController; promise: Promise<AudioBuffer> }>());
  const voiceDecodeQueue = useMemo(() => createLimitedTaskQueue(1), []);
  const voiceEpochRef = useRef(0);
  const voiceCurrentRef = useRef<{
    index: number;
    url: string;
    source: AudioBufferSourceNode;
    stopAt: number;
    epoch: number;
  } | null>(null);
  const videoFrameCbIdRef = useRef<number | null>(null);
  const voiceNextRef = useRef<{
    index: number;
    url: string;
    source: AudioBufferSourceNode;
    startAt: number;
    stopAt: number;
    epoch: number;
  } | null>(null);
  const subtitleTrackRef = useRef<SubtitleTrackItem[]>([]);
  const subtitleTrackOriginalRef = useRef<SubtitleTrackItem[]>([]);
  const volumeRef = useRef(volume);
  const isSubtitleMutedRef = useRef(isSubtitleMuted);
  const isPlayingRef = useRef(isPlaying);
  const isSubtitleBufferingRef = useRef(isSubtitleBuffering);
  const isBgmMutedRef = useRef(isBgmMuted);
  const bufferingAbortRef = useRef<AbortController | null>(null);
  const pausePrefetchAbortRef = useRef<AbortController | null>(null);
  const lastVoiceSubtitleIndexRef = useRef<number>(-1);
  const lastVoiceSyncMsRef = useRef(0);

  const rafIdRef = useRef<number | null>(null);
  const lastUiTimeRef = useRef<number>(-1);
  const lastPlayedSubtitleIndexRef = useRef<number>(-1);
  const subtitlePlayTokenRef = useRef(0);
  const subtitleRetryRef = useRef<{ index: number; untilMs: number } | null>(null);
  const subtitleWatchdogMsRef = useRef(0);
  const subtitleGraceUntilMsRef = useRef(0);
  const subtitleKickRef = useRef<{ index: number; atMs: number } | null>(null);
  const isAudioRefArrPause = useRef(false);
  const handleSeekRef = useRef<(time: number, isDragging?: boolean, isAuditionSeek?: boolean) => void>(() => {});
  const videoPlayTokenRef = useRef(0);

  const auditionStopAtMsRef = useRef<number | null>(null);
  const auditionActiveTypeRef = useRef<'source' | 'convert' | null>(null);
  const auditionTokenRef = useRef(0);
  const auditionAbortRef = useRef<AbortController | null>(null);
  const isAutoPlayNextRef = useRef(false);
  const playingSubtitleIndexRef = useRef<number>(-1);
  const sourceAuditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const handleAuditionStopRef = useRef<(naturalEnd?: boolean) => void>(() => {});
  const auditionNaturalStopTimerRef = useRef<number | null>(null);
  const activeConvertIdRef = useRef(convertId);
  const transportAuditionType =
    transportState.mode === 'audition_source' ? 'source' : transportState.mode === 'audition_convert' ? 'convert' : null;
  const transportActiveClipIndex = getActiveClipIndex(transportState);
  const transportAuditionStopAtMs = (() => {
    const stopAtSec = getAuditionStopAtSec(transportState);
    return stopAtSec == null ? null : Math.round(stopAtSec * 1000);
  })();
  const transportSnapshot = useMemo<EditorTransportSnapshot>(
    () => ({
      currentTimeSec: transportState.transportTimeSec,
      playbackStatus:
        isSubtitleBuffering || isVideoBuffering || transportState.status === 'buffering' ? 'buffering' : isPlaying ? 'playing' : 'paused',
      activeTimelineClipIndex: transportActiveClipIndex ?? playingSubtitleIndex,
      activeAuditionClipIndex: transportActiveClipIndex,
      auditionMode: transportAuditionType,
      autoPlayNext: transportState.autoPlayNext,
      blockingState: transportState.blockingState,
    }),
    [
      isPlaying,
      isSubtitleBuffering,
      isVideoBuffering,
      playingSubtitleIndex,
      transportActiveClipIndex,
      transportAuditionType,
      transportState.autoPlayNext,
      transportState.blockingState,
      transportState.status,
      transportState.transportTimeSec,
    ]
  );
  const logEditorTransport = useCallback((level: 'debug' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'test') return;
    console[level]('[EditorTransport]', event, meta);
  }, []);
  const transportStateRef = useRef(transportState);
  const localPendingVoiceIdSetRef = useRef<Set<string>>(new Set());
  const playbackBlockedVoiceIdSetRef = useRef<Set<string>>(new Set());
  const explicitMissingVoiceIdSetRef = useRef<Set<string>>(new Set());

  const setPlaybackBlockingState = useCallback((next: TransportBlockingState | null) => {
    dispatchTransport(next ? setBlockingState(next) : clearBlockingState());
  }, []);

  const getConvertSubtitleRow = useCallback(
    (subtitleId: string) => {
      const rows = (convertObj?.srt_convert_arr || []) as any[];
      return rows.find((row) => row?.id === subtitleId) ?? null;
    },
    [convertObj?.srt_convert_arr]
  );

  const evaluatePlaybackGateForClipIndex = useCallback(
    (clipIndex: number) => {
      const clip = subtitleTrackRef.current[clipIndex];
      if (!clip) return { kind: 'ready' } as const;
      const row = getConvertSubtitleRow(clip.id);
      const gate = evaluateClipVoiceAvailability({
        clipId: clip.id,
        row,
        audioUrl: String(clip.audioUrl || ''),
        pendingVoiceIdSet: localPendingVoiceIdSetRef.current,
        blockingVoiceIdSet: playbackBlockedVoiceIdSetRef.current,
        explicitMissingVoiceIdSet: explicitMissingVoiceIdSetRef.current,
      });
      return gate.kind === 'ready'
        ? gate
        : {
            ...gate,
            clipIndex,
          };
    },
    [getConvertSubtitleRow]
  );

  const evaluateConvertAuditionGateForClipIndex = useCallback(
    (clipIndex: number) => {
      const clip = subtitleTrackRef.current[clipIndex];
      if (!clip) return { kind: 'ready' } as const;
      const row = getConvertSubtitleRow(clip.id);
      const previewAudioUrl = String(clip.previewAudioUrl || clip.audioUrl || '');
      const gate = evaluateClipConvertAuditionAvailability({
        clipId: clip.id,
        row,
        audioUrl: previewAudioUrl,
        pendingVoiceIdSet: localPendingVoiceIdSetRef.current,
        blockingVoiceIdSet: playbackBlockedVoiceIdSetRef.current,
        explicitMissingVoiceIdSet: explicitMissingVoiceIdSetRef.current,
      });
      return gate.kind === 'ready'
        ? gate
        : {
            ...gate,
            clipIndex,
          };
    },
    [getConvertSubtitleRow]
  );

  const createVoiceUnavailableBlockingState = useCallback(
    (gate: Extract<ReturnType<typeof evaluateSubtitlePlaybackGate>, { kind: 'voice_unavailable' }>) => ({
      kind: 'voice_unavailable' as const,
      clipIndex: gate.clipIndex,
      subtitleId: gate.subtitleId,
      reason: gate.reason,
    }),
    []
  );

  useEffect(() => {
    dispatchTransport(setTransportAutoPlayNext(isAutoPlayNext));
  }, [isAutoPlayNext]);

  useEffect(() => {
    if (transportState.mode !== 'timeline') return;
    dispatchTransport(setActiveClipIndex(playingSubtitleIndex >= 0 ? playingSubtitleIndex : null));
  }, [playingSubtitleIndex, transportState.mode]);

  useEffect(() => {
    auditionActiveTypeRef.current = transportAuditionType;
    auditionStopAtMsRef.current = transportAuditionStopAtMs;
  }, [transportAuditionStopAtMs, transportAuditionType]);

  const auditionRestoreRef = useRef<{
    subtitleMuted: boolean;
    bgmMuted: boolean;
    videoMuted: boolean;
  } | null>(null);

  const abortActiveAuditionPreparation = useCallback(() => {
    const controller = auditionAbortRef.current;
    if (!controller) return;
    auditionAbortRef.current = null;
    try {
      controller.abort(ABORT_REASON);
    } catch {
      // ignore
    }
  }, []);

  const clearAuditionNaturalStopTimer = useCallback(() => {
    if (auditionNaturalStopTimerRef.current != null) {
      window.clearTimeout(auditionNaturalStopTimerRef.current);
      auditionNaturalStopTimerRef.current = null;
    }
  }, []);

  const transportIsStalledRef = useRef(false);
  const transportStallTimerRef = useRef<number | null>(null);
  const bgmKickMsRef = useRef(0);
  const videoStartGateTokenRef = useRef(0);

  const seekDragActiveRef = useRef(false);
  const seekDragRafRef = useRef<number | null>(null);
  const seekDragLatestTimeRef = useRef(0);
  const seekDragLastMediaApplyMsRef = useRef(0);

  const cancelUpdateLoop = useCallback(() => {
    const videoEl = videoPreviewRef.current?.videoElement as any;
    const vfcId = videoFrameCbIdRef.current;
    if (videoEl && vfcId != null && typeof videoEl.cancelVideoFrameCallback === 'function') {
      try {
        videoEl.cancelVideoFrameCallback(vfcId);
      } catch {
        // ignore
      }
    }
    videoFrameCbIdRef.current = null;

    const rafId = rafIdRef.current;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
    }
    rafIdRef.current = null;
  }, []);

  const playbackVoiceCache = useMemo(
    () =>
      createPlaybackVoiceCache({
        refs: {
          voiceAudioCtxRef,
          voiceGainRef,
          voiceCacheRef,
          voiceCacheBytesRef,
          voiceInflightRef,
          voiceEpochRef,
          voiceCurrentRef,
          voiceNextRef,
          bufferingAbortRef,
          pausePrefetchAbortRef,
          subtitleTrackRef,
          subtitleBackendRef,
          isSubtitleMutedRef,
          volumeRef,
        },
        decodeQueue: voiceDecodeQueue,
        abortReason: ABORT_REASON,
        isAbortError,
      }),
    [voiceDecodeQueue]
  );

  const stopWebAudioVoice = useCallback(() => playbackVoiceCache.stopWebAudioVoice(), [playbackVoiceCache]);

  const stopWebAudioVoiceCurrent = useCallback(() => playbackVoiceCache.stopWebAudioVoiceCurrent(), [playbackVoiceCache]);

  const abortAllVoiceInflight = useCallback(() => playbackVoiceCache.abortAllVoiceInflight(), [playbackVoiceCache]);

  const clearVoiceCache = useCallback(() => playbackVoiceCache.clearVoiceCache(), [playbackVoiceCache]);

  const clearActiveTimelineClip = useCallback(() => {
    playingSubtitleIndexRef.current = -1;
    lastPlayedSubtitleIndexRef.current = -1;
    lastVoiceSubtitleIndexRef.current = -1;
    setPlayingSubtitleIndex(-1);
    dispatchTransport(setActiveClipIndex(null));
  }, []);

  const getOrCreateVoiceAudioCtx = useCallback(() => playbackVoiceCache.getOrCreateVoiceAudioCtx(), [playbackVoiceCache]);

  const cacheGetVoice = useCallback((key: string) => playbackVoiceCache.cacheGetVoice(key), [playbackVoiceCache]);

  const ensureVoiceBuffer = useCallback(
    async (url: string, signal: AbortSignal) => await playbackVoiceCache.ensureVoiceBuffer(url, signal),
    [playbackVoiceCache]
  );

  const getAdaptiveBufferPolicy = useCallback(() => playbackVoiceCache.getAdaptiveBufferPolicy(), [playbackVoiceCache]);

  const getPrefetchSubtitleUrls = useCallback(
    (time: number, count = 6) => playbackVoiceCache.getPrefetchSubtitleUrls(time, count),
    [playbackVoiceCache]
  );

  const getAdaptivePrefetchCount = useCallback(
    (mode: 'play' | 'pause' | 'lookahead') => playbackVoiceCache.getAdaptivePrefetchCount(mode),
    [playbackVoiceCache]
  );

  const getAdaptiveWebAudioDecodeLookaheadCount = useCallback(
    () => playbackVoiceCache.getAdaptiveWebAudioDecodeLookaheadCount(),
    [playbackVoiceCache]
  );

  const prefetchVoiceAroundTime = useCallback(
    (time: number, opts?: { count?: number; signal?: AbortSignal }) => playbackVoiceCache.prefetchVoiceAroundTime(time, opts),
    [playbackVoiceCache]
  );

  const stopAllSubtitleAudio = useCallback(() => {
    audioRefArr.forEach((ref) => {
      const audio = ref.current;
      if (!audio) return;
      try {
        audio.pause();
      } catch {
        // ignore
      }
      try {
        if (audio.readyState >= 1) audio.currentTime = 0;
      } catch {
        // ignore
      }
    });
  }, [audioRefArr]);

  usePlaybackSessionOwner({
    refs: {
      transportStateRef,
      isAutoPlayNextRef,
      activeConvertIdRef,
      explicitMissingVoiceIdSetRef,
      localPendingVoiceIdSetRef,
      playbackBlockedVoiceIdSetRef,
      subtitleTrackRef,
      subtitleTrackOriginalRef,
      volumeRef,
      isSubtitleMutedRef,
      isPlayingRef,
      isSubtitleBufferingRef,
      isBgmMutedRef,
      voiceGainRef,
      bgmAudioRef,
      lastBgmUrlRef,
      voiceAudioCtxRef,
      seekDragRafRef,
      sourceAuditionAudioRef,
      auditionRestoreRef,
      auditionActiveTypeRef,
      auditionStopAtMsRef,
      auditionTokenRef,
      videoStartGateTokenRef,
      videoPlayTokenRef,
      transportIsStalledRef,
      subtitleBackendRef,
      playingSubtitleIndexRef,
      lastPlayedSubtitleIndexRef,
      lastVoiceSubtitleIndexRef,
      lastUiTimeRef,
      autoFollowPrevTimeRef,
      subtitleRetryRef,
      subtitleKickRef,
      subtitleWatchdogMsRef,
      subtitleGraceUntilMsRef,
      seekDragActiveRef,
      videoPreviewRef,
    },
    audioRefArr,
    convertId,
    transportState,
    videoTrack,
    bgmTrack,
    convertPreUrl: convertObj?.r2preUrl,
    subtitleTrack,
    subtitleTrackOriginal,
    documentDuration,
    localPendingVoiceIdSet,
    playbackBlockedVoiceIdSet,
    explicitMissingVoiceIdSet,
    volume,
    isSubtitleMuted,
    isPlaying,
    isSubtitleBuffering,
    isBgmMuted,
    abortActiveAuditionPreparation,
    clearAuditionNaturalStopTimer,
    abortAllVoiceInflight,
    cancelUpdateLoop,
    stopWebAudioVoice,
    stopAllSubtitleAudio,
    clearVoiceCache,
    setTotalDuration,
    setIsPlaying,
    setIsSubtitleBuffering,
    setIsVideoBuffering,
    setCurrentTime,
    setPlayingSubtitleIndex,
    setIsSubtitleMuted,
    setIsBgmMuted,
    dispatchTransport,
  });

  const getMinStartBufferSeconds = useCallback(() => getAdaptiveBufferPolicy().startBufferSeconds, [getAdaptiveBufferPolicy]);

  const playbackVideoSync = useMemo(
    () =>
      createPlaybackVideoSync({
        currentTime,
        t,
        getVideoElement: () => videoPreviewRef.current?.videoElement,
        getActiveAuditionType: () => auditionActiveTypeRef.current,
        getTransportMode: () => transportState.mode,
        getTransportTimeSec: () => transportStateRef.current.transportTimeSec,
        getVideoStartGateToken: () => videoStartGateTokenRef.current,
        nextVideoStartGateToken: () => ++videoStartGateTokenRef.current,
        getVideoPlayToken: () => videoPlayTokenRef.current,
        nextVideoPlayToken: () => ++videoPlayTokenRef.current,
        getMinStartBufferSeconds,
        setTransportStalled: (value) => {
          transportIsStalledRef.current = value;
        },
        setIsVideoBuffering,
        setIsPlaying,
        isAbortError,
      }),
    [currentTime, getMinStartBufferSeconds, t, transportState.mode]
  );

  const waitForVideoWarmup = useCallback(playbackVideoSync.waitForVideoWarmup, [playbackVideoSync]);

  const playVideoWithGate = useCallback(
    async (videoEl: HTMLVideoElement, opts: { reason: string }) =>
      playbackVideoSync.playVideoWithGate({
        videoEl,
        reason: opts.reason,
      }),
    [playbackVideoSync]
  );

  const getVideoSyncMode = useCallback(
    (fallback: VideoSyncSnapshot['mode'] = transportState.mode) => playbackVideoSync.getVideoSyncMode(fallback),
    [playbackVideoSync, transportState.mode]
  );

  const getVideoTransportTimeSec = useCallback(
    (fallbackTimeSec = currentTime) => playbackVideoSync.getVideoTransportTimeSec(fallbackTimeSec),
    [currentTime, playbackVideoSync]
  );

  const applyVideoTransportSnapshot = useCallback(
    async (snapshot: VideoSyncSnapshot, opts?: { playReason?: string; seekToleranceSec?: number }) =>
      playbackVideoSync.applyVideoTransportSnapshot(snapshot, opts),
    [playbackVideoSync]
  );

  const waitForVoiceRetryDelay = useCallback(async (signal: AbortSignal, delayMs: number) => {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      const onAbort = () => {
        window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }, []);

  const playbackBlockingRetryController = useMemo(
    () =>
      createPlaybackBlockingRetryController({
        getSubtitleTrack: () => subtitleTrackRef.current,
        getBlockingState: () => transportStateRef.current.blockingState,
        getSubtitleBackend: () => subtitleBackendRef.current,
        getVideoSyncMode,
        getVideoTransportTimeSec,
        applyVideoTransportSnapshot,
        dispatchTransport,
        setPlaybackBlockingState,
        setIsVideoBuffering,
        setIsSubtitleBuffering,
        setIsPlaying,
        setPlayingSubtitleIndex,
        setTransportStalled: (value) => {
          transportIsStalledRef.current = value;
        },
        nextVideoPlayToken: () => ++videoPlayTokenRef.current,
        stopWebAudioVoice,
        stopAllSubtitleAudio,
        pauseBgm: () => {
          try {
            bgmAudioRef.current?.pause();
          } catch {
            // ignore
          }
        },
        scrollToItem,
        seekToTime: (time) => handleSeekRef.current(time, false),
        evaluatePlaybackGateForClipIndex,
        createVoiceUnavailableBlockingState,
      }),
    [
      applyVideoTransportSnapshot,
      createVoiceUnavailableBlockingState,
      evaluatePlaybackGateForClipIndex,
      getVideoSyncMode,
      getVideoTransportTimeSec,
      scrollToItem,
      setPlaybackBlockingState,
      stopAllSubtitleAudio,
      stopWebAudioVoice,
    ]
  );

  const createNetworkFailedBlockingState = useCallback(
    (clipIndex: number, subtitleId?: string, retryCount = 1) =>
      playbackBlockingRetryController.createNetworkFailedBlockingState(clipIndex, subtitleId, retryCount),
    [playbackBlockingRetryController]
  );

  const resolveBlockingClipContext = useCallback(
    (blockingState?: TransportBlockingState | null) => playbackBlockingRetryController.resolveBlockingClipContext(blockingState),
    [playbackBlockingRetryController]
  );

  const resolveRetryablePlaybackContext = useCallback(
    (timeSec: number, preferredClipIndex?: number | null, subtitleId?: string) =>
      playbackBlockingRetryController.resolveRetryablePlaybackContext(timeSec, preferredClipIndex, subtitleId),
    [playbackBlockingRetryController]
  );

  const handlePlaybackStartFailure = useCallback(
    (args: {
      mode: VideoSyncSnapshot['mode'];
      timeSec: number;
      preferredClipIndex?: number | null;
      subtitleId?: string;
      retryCount?: number;
    }) => playbackBlockingRetryController.handlePlaybackStartFailure(args),
    [playbackBlockingRetryController]
  );

  const pausePlaybackForBlockingState = useCallback(
    async (nextState: TransportBlockingState, pauseAtSec?: number) =>
      playbackBlockingRetryController.pausePlaybackForBlockingState(nextState, pauseAtSec),
    [playbackBlockingRetryController]
  );

  const pausePlaybackForMediaFailure = useCallback(
    (clipIndex: number, clip?: { id?: string; startTime?: number } | null) =>
      playbackBlockingRetryController.pausePlaybackForMediaFailure(clipIndex, clip),
    [playbackBlockingRetryController]
  );

  const subtitleAudioEngine = useMemo(
    () =>
      createSubtitleAudioEngine({
        locale,
        getIsSubtitleBuffering: () => isSubtitleBufferingRef.current,
        getSubtitleTrack: () => subtitleTrackRef.current,
        getVideoElement: () => videoPreviewRef.current?.videoElement,
        getVideoSyncMode,
        getVideoTransportTimeSec,
        applyVideoTransportSnapshot,
        ensureVoiceBuffer,
        waitForVoiceRetryDelay,
        isRecoverableVoiceLoadError,
        logEditorTransport,
        handlePlaybackStartFailure,
        pausePlaybackForBlockingState,
        setPlaybackBlockingState,
        setIsSubtitleBuffering,
        setIsPlaying,
        setTransportStalled: (value) => {
          transportIsStalledRef.current = value;
        },
        nextVideoPlayToken: () => ++videoPlayTokenRef.current,
        stopWebAudioVoice,
        stopAllSubtitleAudio,
        pauseBgm: () => {
          try {
            bgmAudioRef.current?.pause();
          } catch {
            // ignore
          }
        },
        getVoiceAudioContext: () => voiceAudioCtxRef.current,
        getAbortReason: () => ABORT_REASON,
        getBufferingAbortController: () => bufferingAbortRef.current,
        setBufferingAbortController: (controller) => {
          bufferingAbortRef.current = controller;
        },
        createNetworkFailedBlockingState,
        dispatchTransport,
      }),
    [
      applyVideoTransportSnapshot,
      createNetworkFailedBlockingState,
      ensureVoiceBuffer,
      getVideoSyncMode,
      getVideoTransportTimeSec,
      handlePlaybackStartFailure,
      locale,
      logEditorTransport,
      pausePlaybackForBlockingState,
      setPlaybackBlockingState,
      stopAllSubtitleAudio,
      stopWebAudioVoice,
      waitForVoiceRetryDelay,
    ]
  );

  const beginSubtitleBuffering = useCallback(
    async (reasonIndex: number, url: string) => subtitleAudioEngine.beginSubtitleBuffering(reasonIndex, url),
    [subtitleAudioEngine]
  );

  const playbackTimeLoop = useMemo(
    () =>
      createPlaybackTimeLoop({
        refs: {
          rafIdRef,
          videoFrameCbIdRef,
          videoPreviewRef,
          timelineHandleRef,
          autoFollowPrevTimeRef,
          zoomRef,
          lastUiTimeRef,
          isPlayingRef,
          isSubtitleBufferingRef,
          transportIsStalledRef,
          subtitleBackendRef,
          auditionStopAtMsRef,
          auditionActiveTypeRef,
          sourceAuditionAudioRef,
          videoStartGateTokenRef,
          videoPlayTokenRef,
          activeConvertIdRef,
          auditionNaturalStopTimerRef,
          handleAuditionStopRef,
          lastPlayedSubtitleIndexRef,
          subtitleGraceUntilMsRef,
          subtitleKickRef,
          subtitleWatchdogMsRef,
          subtitleRetryRef,
          subtitlePlayTokenRef,
          isAudioRefArrPauseRef: isAudioRefArrPause,
          transportStateRef,
          lastVoiceSyncMsRef,
          isSubtitleMutedRef,
          lastVoiceSubtitleIndexRef,
          subtitleTrackRef,
          voiceInflightRef,
          voiceGainRef,
          voiceCurrentRef,
          voiceNextRef,
          voiceEpochRef,
        },
        subtitleTrack,
        getAudioElements: () => audioRefArr.map((ref) => ref.current),
        isSubtitleMuted,
        isSubtitleBuffering,
        volume,
        dispatchTransport,
        setCurrentTime,
        setIsVideoBuffering,
        setIsPlaying,
        setPlayingSubtitleIndex,
        cancelUpdateLoop,
        clearAuditionNaturalStopTimer,
        applyVideoTransportSnapshot,
        getVideoSyncMode,
        evaluatePlaybackGateForClipIndex,
        createVoiceUnavailableBlockingState: (gate) =>
          createVoiceUnavailableBlockingState(gate as Extract<ReturnType<typeof evaluateSubtitlePlaybackGate>, { kind: 'voice_unavailable' }>),
        pausePlaybackForBlockingState,
        pausePlaybackForMediaFailure,
        stopAllSubtitleAudio,
        stopWebAudioVoice,
        stopWebAudioVoiceCurrent,
        cacheGetVoice,
        ensureVoiceBuffer,
        beginSubtitleBuffering,
        getOrCreateVoiceAudioCtx,
        getAdaptivePrefetchCount,
        getAdaptiveWebAudioDecodeLookaheadCount,
        isAbortError,
      }),
    [
      applyVideoTransportSnapshot,
      audioRefArr,
      beginSubtitleBuffering,
      cacheGetVoice,
      cancelUpdateLoop,
      clearAuditionNaturalStopTimer,
      createVoiceUnavailableBlockingState,
      ensureVoiceBuffer,
      evaluatePlaybackGateForClipIndex,
      getAdaptivePrefetchCount,
      getAdaptiveWebAudioDecodeLookaheadCount,
      getOrCreateVoiceAudioCtx,
      getVideoSyncMode,
      isSubtitleBuffering,
      isSubtitleMuted,
      pausePlaybackForBlockingState,
      pausePlaybackForMediaFailure,
      stopAllSubtitleAudio,
      stopWebAudioVoice,
      stopWebAudioVoiceCurrent,
      subtitleTrack,
      volume,
    ]
  );

  const findSubtitleIndexAtTime = useCallback(
    (track: SubtitleTrackItem[], time: number) => playbackTimeLoop.findSubtitleIndexAtTime(track, time),
    [playbackTimeLoop]
  );

  const syncAudioPlayback = useCallback((time: number) => playbackTimeLoop.syncAudioPlayback(time), [playbackTimeLoop]);

  const syncVoicePlaybackWebAudio = useCallback(
    (time: number) => playbackTimeLoop.syncVoicePlaybackWebAudio(time),
    [playbackTimeLoop]
  );

  const updateTimeLoop = useCallback(() => playbackTimeLoop.updateTimeLoop(), [playbackTimeLoop]);

  const startUpdateLoop = useCallback(() => playbackTimeLoop.startUpdateLoop(), [playbackTimeLoop]);

  usePlaybackRuntimeEffects({
    refs: {
      videoPreviewRef,
      transportStallTimerRef,
      subtitleBackendRef,
      voiceAudioCtxRef,
      isSubtitleBufferingRef,
      transportIsStalledRef,
      bgmAudioRef,
      bgmKickMsRef,
      lastPlayedSubtitleIndexRef,
      isAudioRefArrPauseRef: isAudioRefArrPause,
      seekDragActiveRef,
      lastVoiceSubtitleIndexRef,
    },
    audioRefArr,
    bgmTrack,
    pausePrefetchAbortRef,
    isPlaying,
    isSubtitleBuffering,
    isVideoBuffering,
    isBgmMuted,
    isSubtitleMuted,
    currentTime,
    volume,
    abortReason: ABORT_REASON,
    isAbortError,
    cancelUpdateLoop,
    startUpdateLoop,
    stopWebAudioVoice,
    prefetchVoiceAroundTime,
    getAdaptivePrefetchCount,
    getPrefetchSubtitleUrls,
    setIsVideoBuffering,
  });

  const playbackTransportOwner = useMemo(
    () =>
      createPlaybackTransportOwner({
        refs: {
          transportStateRef,
          subtitleBackendRef,
          auditionTokenRef,
          auditionActiveTypeRef,
          sourceAuditionAudioRef,
          auditionStopAtMsRef,
          auditionRestoreRef,
          videoPreviewRef,
          isSubtitleMutedRef,
          isBgmMutedRef,
          handleAuditionStopRef,
          lastPlayedSubtitleIndexRef,
          lastVoiceSubtitleIndexRef,
          isAudioRefArrPauseRef: isAudioRefArrPause,
          subtitleTrackRef,
          videoStartGateTokenRef,
          videoPlayTokenRef,
          transportIsStalledRef,
          subtitleRetryRef,
          subtitleKickRef,
          subtitleWatchdogMsRef,
        },
        transportMode: transportState.mode,
        isPlaying,
        isSubtitleBuffering,
        isVideoBuffering,
        t,
        scrollToItem,
        handleSeek: (time, isDragging, isAuditionSeek) => handleSeekRef.current(time, isDragging, isAuditionSeek),
        abortActiveAuditionPreparation,
        abortAllVoiceInflight,
        applyVideoTransportSnapshot,
        getVideoSyncMode,
        getVideoTransportTimeSec,
        setPlaybackBlockingState,
        stopAllSubtitleAudio,
        stopWebAudioVoice,
        setIsVideoBuffering,
        setIsSubtitleBuffering,
        setIsPlaying,
        setIsSubtitleMuted,
        setIsBgmMuted,
        setPlayingSubtitleIndex,
        dispatchTransport,
        resolveBlockingClipContext,
        resolveRetryablePlaybackContext,
        evaluatePlaybackGateForClipIndex,
        createVoiceUnavailableBlockingState,
        pausePlaybackForBlockingState,
        handlePlaybackStartFailure,
        beginSubtitleBuffering,
        getOrCreateVoiceAudioCtx,
        cacheGetVoice,
        prefetchVoiceAroundTime,
        getAdaptivePrefetchCount,
        findSubtitleIndexAtTime,
      }),
    [
      abortActiveAuditionPreparation,
      abortAllVoiceInflight,
      applyVideoTransportSnapshot,
      beginSubtitleBuffering,
      cacheGetVoice,
      createVoiceUnavailableBlockingState,
      evaluatePlaybackGateForClipIndex,
      findSubtitleIndexAtTime,
      getAdaptivePrefetchCount,
      getOrCreateVoiceAudioCtx,
      getVideoSyncMode,
      getVideoTransportTimeSec,
      handlePlaybackStartFailure,
      isPlaying,
      isSubtitleBuffering,
      isVideoBuffering,
      pausePlaybackForBlockingState,
      prefetchVoiceAroundTime,
      resolveBlockingClipContext,
      resolveRetryablePlaybackContext,
      scrollToItem,
      setPlaybackBlockingState,
      stopAllSubtitleAudio,
      stopWebAudioVoice,
      t,
      transportState.mode,
    ]
  );

  const handleCancelBlockedPlayback = useCallback(() => {
    playbackTransportOwner.handleCancelBlockedPlayback();
  }, [playbackTransportOwner]);

  const handleLocateBlockedClip = useCallback(() => {
    playbackTransportOwner.handleLocateBlockedClip();
  }, [playbackTransportOwner]);

  const handleRetryBlockedPlayback = useCallback(() => {
    playbackTransportOwner.handleRetryBlockedPlayback();
  }, [playbackTransportOwner]);

  const handlePlayPause = useCallback(() => {
    playbackTransportOwner.handlePlayPause();
  }, [playbackTransportOwner]);

  const playbackSeekOwner = useMemo(
    () =>
      createPlaybackSeekOwner({
        refs: {
          videoPreviewRef,
          seekDragActiveRef,
          seekDragRafRef,
          seekDragLatestTimeRef,
          seekDragLastMediaApplyMsRef,
          videoStartGateTokenRef,
          videoPlayTokenRef,
          transportIsStalledRef,
          subtitleGraceUntilMsRef,
          subtitleKickRef,
          subtitleRetryRef,
          subtitleWatchdogMsRef,
          subtitlePlayTokenRef,
          lastPlayedSubtitleIndexRef,
          lastVoiceSubtitleIndexRef,
          bufferingAbortRef,
          isAudioRefArrPauseRef: isAudioRefArrPause,
          auditionTokenRef,
          auditionActiveTypeRef,
          auditionStopAtMsRef,
          auditionRestoreRef,
          sourceAuditionAudioRef,
          isSubtitleMutedRef,
          isBgmMutedRef,
          handleAuditionStopRef,
          lastUiTimeRef,
          subtitleTrackRef,
          bgmAudioRef,
        },
        totalDuration,
        transportMode: transportState.mode,
        isPlaying,
        abortReason: ABORT_REASON,
        setIsVideoBuffering,
        setIsSubtitleBuffering,
        setIsPlaying,
        setIsSubtitleMuted,
        setIsBgmMuted,
        setCurrentTime,
        setPlayingSubtitleIndex,
        dispatchTransport,
        cancelUpdateLoop,
        setPlaybackBlockingState,
        stopWebAudioVoice,
        abortAllVoiceInflight,
        stopAllSubtitleAudio,
        abortActiveAuditionPreparation,
        applyVideoTransportSnapshot,
        getVideoSyncMode,
        getVideoTransportTimeSec,
        findSubtitleIndexAtTime,
      }),
    [
      abortActiveAuditionPreparation,
      abortAllVoiceInflight,
      applyVideoTransportSnapshot,
      cancelUpdateLoop,
      findSubtitleIndexAtTime,
      getVideoSyncMode,
      getVideoTransportTimeSec,
      isPlaying,
      setPlaybackBlockingState,
      stopAllSubtitleAudio,
      stopWebAudioVoice,
      totalDuration,
      transportState.mode,
    ]
  );

  const handleSeek = useCallback(
    (time: number, isDragging = false, isAuditionSeek = false) => {
      playbackSeekOwner.handleSeek(time, isDragging, isAuditionSeek);
    },
    [playbackSeekOwner]
  );

  useEffect(() => {
    handleSeekRef.current = handleSeek;
  }, [handleSeek]);

  const handleSeekToSubtitle = useCallback(
    (time: number) => {
      playbackSeekOwner.handleSeekToSubtitle(time);
    },
    [playbackSeekOwner]
  );

  const playbackControlOwner = useMemo(
    () =>
      createPlaybackControlOwner({
        refs: {
          videoPreviewRef,
          bgmAudioRef,
          sourceAuditionAudioRef,
        },
        audioRefArr,
        setVolume,
        setIsBgmMuted,
        setIsSubtitleMuted,
        setIsAutoPlayNext,
        setIsPlaying,
        dispatchTransport,
        handlePlayPause,
      }),
    [audioRefArr, dispatchTransport, handlePlayPause]
  );

  const handleGlobalVolume = useCallback(
    (vol: number) => {
      playbackControlOwner.handleGlobalVolume(vol);
    },
    [playbackControlOwner]
  );

  const handleToggleBgmMute = useCallback(() => {
    playbackControlOwner.handleToggleBgmMute();
  }, [playbackControlOwner]);

  const handleToggleSubtitleMute = useCallback(() => {
    playbackControlOwner.handleToggleSubtitleMute();
  }, [playbackControlOwner]);

  const handleAutoPlayNextChange = useCallback((value: boolean) => {
    playbackControlOwner.handleAutoPlayNextChange(value);
  }, [playbackControlOwner]);

  const playbackAuditionFlow = useMemo(
    () =>
      createPlaybackAuditionFlow({
        locale,
        t,
        convertObj,
        getSubtitleTrack: () => subtitleTrackRef.current,
        getTransportState: () => transportStateRef.current,
        getVideoElement: () => videoPreviewRef.current?.videoElement,
        getSourceAuditionAudio: () => sourceAuditionAudioRef.current,
        setSourceAuditionAudio: (audio) => {
          sourceAuditionAudioRef.current = audio;
        },
        getAuditionRestoreState: () => auditionRestoreRef.current,
        setAuditionRestoreState: (next) => {
          auditionRestoreRef.current = next;
        },
        getSubtitleMuted: () => isSubtitleMutedRef.current,
        setSubtitleMuted: (value) => {
          setIsSubtitleMuted(value);
          isSubtitleMutedRef.current = value;
        },
        getBgmMuted: () => isBgmMutedRef.current,
        setBgmMuted: (value) => {
          setIsBgmMuted(value);
          isBgmMutedRef.current = value;
        },
        getVolume: () => volumeRef.current,
        getActiveAuditionType: () => auditionActiveTypeRef.current,
        setActiveAuditionType: (next) => {
          auditionActiveTypeRef.current = next;
        },
        getAuditionStopAtMs: () => auditionStopAtMsRef.current,
        setAuditionStopAtMs: (next) => {
          auditionStopAtMsRef.current = next;
        },
        getPlayingSubtitleIndex: () => playingSubtitleIndexRef.current,
        setPlayingSubtitleIndex: (value) => {
          setPlayingSubtitleIndex(value);
          playingSubtitleIndexRef.current = value;
        },
        nextAuditionToken: () => ++auditionTokenRef.current,
        getAuditionToken: () => auditionTokenRef.current,
        getAuditionAbortController: () => auditionAbortRef.current,
        setAuditionAbortController: (controller) => {
          auditionAbortRef.current = controller;
        },
        getAbortReason: () => ABORT_REASON,
        abortActiveAuditionPreparation,
        clearAuditionNaturalStopTimer,
        setTransportStalled: (value) => {
          transportIsStalledRef.current = value;
        },
        nextVideoStartGateToken: () => ++videoStartGateTokenRef.current,
        nextVideoPlayToken: () => ++videoPlayTokenRef.current,
        setIsVideoBuffering,
        setIsPlaying,
        dispatchTransport,
        logEditorTransport,
        getVideoSyncMode,
        getVideoTransportTimeSec,
        applyVideoTransportSnapshot,
        evaluateConvertAuditionGateForClipIndex,
        createVoiceUnavailableBlockingState: (gate) =>
          createVoiceUnavailableBlockingState(gate as Extract<ReturnType<typeof evaluateSubtitlePlaybackGate>, { kind: 'voice_unavailable' }>),
        pausePlaybackForBlockingState,
        handleSeek: (time, isDragging, isAuditionSeek) => handleSeekRef.current(time, isDragging, isAuditionSeek),
        ensureVoiceBuffer,
        cacheGetVoice,
        handleAuditionStopFallback: (naturalEnd = false) => handleAuditionStopRef.current(naturalEnd),
      }),
    [
      abortActiveAuditionPreparation,
      applyVideoTransportSnapshot,
      cacheGetVoice,
      clearAuditionNaturalStopTimer,
      convertObj,
      createVoiceUnavailableBlockingState,
      ensureVoiceBuffer,
      evaluateConvertAuditionGateForClipIndex,
      getVideoSyncMode,
      getVideoTransportTimeSec,
      locale,
      logEditorTransport,
      pausePlaybackForBlockingState,
      t,
    ]
  );

  const handleAuditionStop = useCallback(
    (naturalEnd = false) => playbackAuditionFlow.handleAuditionStop(naturalEnd),
    [playbackAuditionFlow]
  );

  const handleAuditionRequestPlay = useCallback(
    async (index: number, mode: 'source' | 'convert') => playbackAuditionFlow.handleAuditionRequestPlay(index, mode),
    [playbackAuditionFlow]
  );

  usePlaybackAuditionRuntime({
    handleAuditionStopRef,
    handleAuditionStop,
    pendingNextClipIndex: transportState.pendingNextClipIndex,
    pendingNextMode: transportState.pendingNextMode,
    getSubtitleTrack: () => subtitleTrackRef.current,
    logEditorTransport,
    dispatchTransport,
    handleAuditionRequestPlay,
  });

  const handleAuditionToggle = useCallback(() => {
    playbackControlOwner.handleAuditionToggle();
  }, [playbackControlOwner]);

  const handlePreviewPlayStateChange = useCallback((nextIsPlaying: boolean) => {
    playbackControlOwner.handlePreviewPlayStateChange(nextIsPlaying);
  }, [playbackControlOwner]);

  return {
    transportSnapshot,
    timelineHandleRef,
    videoPreviewRef,
    currentTime,
    totalDuration,
    volume,
    isBgmMuted,
    isSubtitleMuted,
    isPlaying,
    handlePreviewPlayStateChange,
    handlePlayPause,
    handleSeek,
    handleSeekToSubtitle,
    handleGlobalVolume,
    handleToggleBgmMute,
    handleToggleSubtitleMute,
    handleAutoPlayNextChange,
    handleAuditionRequestPlay,
    handleAuditionToggle,
    handleAuditionStop,
    handleRetryBlockedPlayback,
    handleCancelBlockedPlayback,
    handleLocateBlockedClip,
    clearVoiceCache,
    clearActiveTimelineClip,
  };
}
