import { getTimelineAutoFollowTarget } from '@/shared/lib/timeline/follow';

import { syncTransportTime, type TransportBlockingReason, type TransportBlockingState } from '../../editor-transport';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type SubtitleTrackItemLike = {
  id: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
};

type MutableRefObjectLike<T> = {
  current: T;
};

type VoicePlaybackSourceState = {
  index: number;
  url: string;
  source: AudioBufferSourceNode;
  startAt?: number;
  stopAt: number;
  epoch: number;
};

type VideoElementLike = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (callbackId: number) => void;
};

type CreatePlaybackTimeLoopArgs = {
  refs: {
    rafIdRef: MutableRefObjectLike<number | null>;
    videoFrameCbIdRef: MutableRefObjectLike<number | null>;
    videoPreviewRef: MutableRefObjectLike<{ videoElement?: VideoElementLike | null } | null>;
    timelineHandleRef: MutableRefObjectLike<{ setTime: (time: number) => void } | null>;
    autoFollowPrevTimeRef: MutableRefObjectLike<number>;
    zoomRef: MutableRefObjectLike<number>;
    lastUiTimeRef: MutableRefObjectLike<number>;
    isPlayingRef: MutableRefObjectLike<boolean>;
    isSubtitleBufferingRef: MutableRefObjectLike<boolean>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
    subtitleBackendRef: MutableRefObjectLike<'webaudio' | 'media'>;
    auditionStopAtMsRef: MutableRefObjectLike<number | null>;
    auditionActiveTypeRef: MutableRefObjectLike<'source' | 'convert' | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    videoStartGateTokenRef: MutableRefObjectLike<number>;
    videoPlayTokenRef: MutableRefObjectLike<number>;
    activeConvertIdRef: MutableRefObjectLike<string>;
    auditionNaturalStopTimerRef: MutableRefObjectLike<number | null>;
    handleAuditionStopRef: MutableRefObjectLike<(naturalEnd?: boolean) => void>;
    lastPlayedSubtitleIndexRef: MutableRefObjectLike<number>;
    subtitleGraceUntilMsRef: MutableRefObjectLike<number>;
    subtitleKickRef: MutableRefObjectLike<{ index: number; atMs: number } | null>;
    subtitleWatchdogMsRef: MutableRefObjectLike<number>;
    subtitleRetryRef: MutableRefObjectLike<{ index: number; untilMs: number } | null>;
    subtitlePlayTokenRef: MutableRefObjectLike<number>;
    isAudioRefArrPauseRef: MutableRefObjectLike<boolean>;
    transportStateRef: MutableRefObjectLike<{ blockingState: TransportBlockingState | null }>;
    lastVoiceSyncMsRef: MutableRefObjectLike<number>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    lastVoiceSubtitleIndexRef: MutableRefObjectLike<number>;
    subtitleTrackRef: MutableRefObjectLike<SubtitleTrackItemLike[]>;
    voiceInflightRef: MutableRefObjectLike<Map<string, { controller: AbortController; promise: Promise<AudioBuffer> }>>;
    voiceGainRef: MutableRefObjectLike<GainNode | null>;
    voiceCurrentRef: MutableRefObjectLike<VoicePlaybackSourceState | null>;
    voiceNextRef: MutableRefObjectLike<VoicePlaybackSourceState | null>;
    voiceEpochRef: MutableRefObjectLike<number>;
  };
  subtitleTrack: SubtitleTrackItemLike[];
  getAudioElements: () => Array<HTMLAudioElement | null>;
  isSubtitleMuted: boolean;
  isSubtitleBuffering: boolean;
  volume: number;
  dispatchTransport: (action: ReturnType<typeof syncTransportTime>) => void;
  setCurrentTime: (time: number) => void;
  setIsVideoBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setPlayingSubtitleIndex: (value: number) => void;
  cancelUpdateLoop: () => void;
  clearAuditionNaturalStopTimer: () => void;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  evaluatePlaybackGateForClipIndex: (
    clipIndex: number
  ) => { kind: 'ready' } | { kind: 'voice_unavailable'; clipIndex: number; subtitleId: string; reason: TransportBlockingReason };
  createVoiceUnavailableBlockingState: (gate: {
    kind: 'voice_unavailable';
    clipIndex: number;
    subtitleId: string;
    reason: TransportBlockingReason;
  }) => TransportBlockingState;
  pausePlaybackForBlockingState: (nextState: TransportBlockingState, pauseAtSec?: number) => Promise<void>;
  pausePlaybackForMediaFailure: (clipIndex: number, clip?: { id?: string; startTime?: number } | null) => void;
  stopAllSubtitleAudio: () => void;
  stopWebAudioVoice: () => void;
  stopWebAudioVoiceCurrent: () => void;
  cacheGetVoice: (key: string) => AudioBuffer | null;
  ensureVoiceBuffer: (url: string, signal: AbortSignal) => Promise<unknown>;
  beginSubtitleBuffering: (reasonIndex: number, url: string) => Promise<void>;
  getOrCreateVoiceAudioCtx: () => AudioContext;
  getAdaptivePrefetchCount: (mode: 'play' | 'pause' | 'lookahead') => number;
  getAdaptiveWebAudioDecodeLookaheadCount: () => number;
  isAbortError: (error: unknown) => boolean;
};

function stopScheduledVoiceSource(item: VoicePlaybackSourceState | null) {
  if (!item) return;
  try {
    item.source.onended = null;
  } catch {
    // ignore
  }
  try {
    item.source.stop(0);
  } catch {
    // ignore
  }
  try {
    item.source.disconnect();
  } catch {
    // ignore
  }
}

export function findSubtitleIndexAtTime(track: Array<{ startTime: number; duration: number }>, time: number) {
  if (!track.length) return -1;
  let lo = 0;
  let hi = track.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].startTime <= time) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best < 0) return -1;
  const subtitle = track[best];
  const endTime = subtitle.startTime + subtitle.duration;
  return time >= subtitle.startTime && time < endTime ? best : -1;
}

export function findNextSubtitleIndexAtOrAfterTime(track: Array<{ startTime: number }>, time: number) {
  if (!track.length) return -1;
  let lo = 0;
  let hi = track.length - 1;
  let best = track.length;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].startTime >= time) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return best < track.length ? best : -1;
}

export function createPlaybackTimeLoop(args: CreatePlaybackTimeLoopArgs) {
  const refs = args.refs;

  const syncAudioPlayback = (time: number) => {
    if (args.isSubtitleMuted || refs.isAudioRefArrPauseRef.current || args.subtitleTrack.length === 0) return;
    if (refs.transportIsStalledRef.current) return;

    const audioElements = args.getAudioElements();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const startMargin = 0.1;
    const bestIndex = (() => {
      let lo = 0;
      let hi = args.subtitleTrack.length - 1;
      let best = -1;

      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (args.subtitleTrack[mid].startTime <= time) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      return best;
    })();

    const currentSubtitleIndex = (() => {
      if (bestIndex < 0) return -1;
      const subtitle = args.subtitleTrack[bestIndex];
      const endTime = subtitle.startTime + subtitle.duration;
      return time >= subtitle.startTime - startMargin && time < endTime ? bestIndex : -1;
    })();

    if (currentSubtitleIndex !== -1) {
      const gate = args.evaluatePlaybackGateForClipIndex(currentSubtitleIndex);
      if (gate.kind === 'voice_unavailable') {
        const blockingClip = args.subtitleTrack[currentSubtitleIndex];
        refs.lastPlayedSubtitleIndexRef.current = -1;
        args.setPlayingSubtitleIndex(currentSubtitleIndex);
        args.stopAllSubtitleAudio();
        const activeBlocking = refs.transportStateRef.current.blockingState;
        if (
          activeBlocking?.kind !== 'voice_unavailable' ||
          activeBlocking.subtitleId !== gate.subtitleId ||
          activeBlocking.reason !== gate.reason
        ) {
          void args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), blockingClip?.startTime);
        }
        return;
      }
    }

    if (currentSubtitleIndex !== -1 && currentSubtitleIndex === refs.lastPlayedSubtitleIndexRef.current) {
      if (now < refs.subtitleGraceUntilMsRef.current) return;

      const kickState = refs.subtitleKickRef.current;
      if (kickState && kickState.index === currentSubtitleIndex && now - kickState.atMs < 900) return;

      if (now - refs.subtitleWatchdogMsRef.current >= 240) {
        refs.subtitleWatchdogMsRef.current = now;
        const subtitle = args.subtitleTrack[currentSubtitleIndex];
        const audio = audioElements[currentSubtitleIndex % 5];
        if (subtitle?.audioUrl && audio) {
          const offset = Math.max(0, time - subtitle.startTime);
          const drift = (() => {
            try {
              return Math.abs(audio.currentTime - offset);
            } catch {
              return 0;
            }
          })();
          const isError = Boolean(audio.error) || audio.networkState === 0 || audio.networkState === 3;
          const isStalled = audio.paused && !audio.ended;

          if (isError) {
            if (!kickState || now - kickState.atMs >= 1200) {
              args.pausePlaybackForMediaFailure(currentSubtitleIndex, subtitle);
              return;
            }
            refs.subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 260 };
            refs.lastPlayedSubtitleIndexRef.current = -1;
            return;
          }

          if (isStalled) {
            if (!kickState || now - kickState.atMs >= 1200) {
              const playToken = ++refs.subtitlePlayTokenRef.current;
              audio.play().catch((error) => {
                if (playToken !== refs.subtitlePlayTokenRef.current) return;
                if (args.isAbortError(error)) return;
                refs.subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 280 };
                refs.lastPlayedSubtitleIndexRef.current = -1;
              });
              refs.subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
            }
            return;
          }

          if (!audio.ended && !audio.paused && drift > 0.95) {
            try {
              if (audio.readyState >= 1) audio.currentTime = offset;
            } catch {
              // ignore
            }
            refs.subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
          }
        }
      }
    }

    if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== refs.lastPlayedSubtitleIndexRef.current) {
      const retryState = refs.subtitleRetryRef.current;
      if (retryState && retryState.index === currentSubtitleIndex && now < retryState.untilMs) {
        refs.lastPlayedSubtitleIndexRef.current = -1;
        args.setPlayingSubtitleIndex(currentSubtitleIndex);
        return;
      }
      refs.subtitleRetryRef.current = null;

      args.stopAllSubtitleAudio();
      args.setPlayingSubtitleIndex(currentSubtitleIndex);

      const subtitle = args.subtitleTrack[currentSubtitleIndex];
      const offset = Math.max(0, time - subtitle.startTime);
      const audio = audioElements[currentSubtitleIndex % 5];

      if (subtitle?.audioUrl && audio) {
        refs.lastPlayedSubtitleIndexRef.current = currentSubtitleIndex;
        refs.subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
        const playToken = ++refs.subtitlePlayTokenRef.current;

        const needsReload =
          audio.src !== subtitle.audioUrl ||
          Boolean(audio.error) ||
          audio.networkState === 0 ||
          audio.networkState === 3;

        if (needsReload) {
          audio.preload = 'auto';
          audio.src = subtitle.audioUrl;
          try {
            audio.load();
          } catch {
            // ignore
          }
        } else if (audio.readyState === 0) {
          try {
            audio.load();
          } catch {
            // ignore
          }
        }

        try {
          if (audio.readyState >= 1) audio.currentTime = offset;
        } catch {
          // ignore
        }
        audio.volume = args.volume / 100;
        audio.play().catch((error) => {
          if (playToken !== refs.subtitlePlayTokenRef.current) return;
          if (args.isAbortError(error)) {
            refs.subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 160 };
            refs.lastPlayedSubtitleIndexRef.current = -1;
            return;
          }
          console.error('Subtitle audio play failed', error);
          args.pausePlaybackForMediaFailure(currentSubtitleIndex, subtitle);
        });
      }

      const lookaheadCount = Math.max(1, Math.min(4, args.getAdaptivePrefetchCount('lookahead')));
      for (let offsetIndex = 1; offsetIndex <= lookaheadCount; offsetIndex += 1) {
        const nextSubtitle = args.subtitleTrack[currentSubtitleIndex + offsetIndex];
        if (!nextSubtitle?.audioUrl) continue;
        const audio = audioElements[(currentSubtitleIndex + offsetIndex) % 5];
        if (!audio) continue;
        const needsReload =
          audio.src !== nextSubtitle.audioUrl ||
          Boolean(audio.error) ||
          audio.networkState === 0 ||
          audio.networkState === 3;
        if (!needsReload) continue;
        audio.preload = 'auto';
        audio.src = nextSubtitle.audioUrl;
        try {
          audio.load();
        } catch {
          // ignore
        }
      }
    } else if (currentSubtitleIndex === -1 && refs.lastPlayedSubtitleIndexRef.current !== -1) {
      refs.lastPlayedSubtitleIndexRef.current = -1;
      args.setPlayingSubtitleIndex(-1);
      args.stopAllSubtitleAudio();
    }
  };

  const syncVoicePlaybackWebAudio = (time: number) => {
    if (refs.subtitleBackendRef.current !== 'webaudio') return;
    if (args.isSubtitleBuffering) return;
    if (refs.transportIsStalledRef.current) return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - refs.lastVoiceSyncMsRef.current < 70) return;
    refs.lastVoiceSyncMsRef.current = nowMs;

    if (refs.isSubtitleMutedRef.current) {
      if (refs.lastVoiceSubtitleIndexRef.current !== -1) {
        refs.lastVoiceSubtitleIndexRef.current = -1;
        if (refs.auditionStopAtMsRef.current == null) args.setPlayingSubtitleIndex(-1);
      }
      args.stopWebAudioVoice();
      return;
    }

    const track = refs.subtitleTrackRef.current;
    if (!track.length) {
      if (refs.lastVoiceSubtitleIndexRef.current !== -1) {
        refs.lastVoiceSubtitleIndexRef.current = -1;
        args.setPlayingSubtitleIndex(-1);
      }
      args.stopWebAudioVoice();
      return;
    }

    const currentIndex = findSubtitleIndexAtTime(track, time);
    if (currentIndex !== refs.lastVoiceSubtitleIndexRef.current) {
      refs.lastVoiceSubtitleIndexRef.current = currentIndex;
      args.setPlayingSubtitleIndex(currentIndex);
    }

    if (currentIndex !== -1) {
      const gate = args.evaluatePlaybackGateForClipIndex(currentIndex);
      if (gate.kind === 'voice_unavailable') {
        args.stopWebAudioVoice();
        const blockingClip = track[currentIndex];
        const activeBlocking = refs.transportStateRef.current.blockingState;
        if (
          activeBlocking?.kind !== 'voice_unavailable' ||
          activeBlocking.subtitleId !== gate.subtitleId ||
          activeBlocking.reason !== gate.reason
        ) {
          void args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), blockingClip?.startTime);
        }
        return;
      }
    }

    if (currentIndex === -1) {
      args.stopWebAudioVoiceCurrent();

      const upcomingIndex = findNextSubtitleIndexAtOrAfterTime(track, time);
      if (upcomingIndex === -1) {
        stopScheduledVoiceSource(refs.voiceNextRef.current);
        refs.voiceNextRef.current = null;
        return;
      }

      const upcoming = track[upcomingIndex];
      const upcomingUrl = (upcoming?.audioUrl || '').trim();
      if (!upcomingUrl || upcoming.duration <= 0) return;

      if (!args.cacheGetVoice(upcomingUrl) && !refs.voiceInflightRef.current.has(upcomingUrl)) {
        const controller = new AbortController();
        void args.ensureVoiceBuffer(upcomingUrl, controller.signal).catch(() => {
          // silent
        });
      }

      const nextBuffer = args.cacheGetVoice(upcomingUrl);
      if (!nextBuffer) return;

      let ctx: AudioContext;
      try {
        ctx = args.getOrCreateVoiceAudioCtx();
      } catch (error) {
        console.error('[VoiceEngine] WebAudio unavailable, falling back to <audio>:', error);
        refs.subtitleBackendRef.current = 'media';
        return;
      }

      const gain = refs.voiceGainRef.current;
      if (!gain) return;

      const now = ctx.currentTime;
      const when = now + Math.max(0, upcoming.startTime - time);
      if (when > now + 3.0) return;

      const scheduled = refs.voiceNextRef.current;
      if (
        scheduled &&
        scheduled.index === upcomingIndex &&
        scheduled.url === upcomingUrl &&
        typeof scheduled.startAt === 'number' &&
        Math.abs(scheduled.startAt - when) <= 0.06
      ) {
        return;
      }

      stopScheduledVoiceSource(refs.voiceNextRef.current);
      refs.voiceNextRef.current = null;

      try {
        const source = ctx.createBufferSource();
        source.buffer = nextBuffer;
        source.connect(gain);
        const playableDuration = Math.min(upcoming.duration, nextBuffer.duration);
        if (playableDuration <= 0.02) return;
        source.start(when, 0, playableDuration);
        const stopAt = when + playableDuration;
        try {
          source.stop(stopAt + 0.01);
        } catch {
          // ignore
        }
        refs.voiceNextRef.current = {
          index: upcomingIndex,
          url: upcomingUrl,
          source,
          startAt: when,
          stopAt,
          epoch: refs.voiceEpochRef.current,
        };
        source.onended = () => {
          const nextState = refs.voiceNextRef.current;
          if (nextState && nextState.source === source) refs.voiceNextRef.current = null;
        };
      } catch (error) {
        console.error('[VoiceEngine] schedule next failed:', error);
      }

      return;
    }

    const subtitle = track[currentIndex];
    const url = (subtitle?.audioUrl || '').trim();
    if (!url || subtitle.duration <= 0) {
      args.stopWebAudioVoiceCurrent();
      return;
    }

    const cached = args.cacheGetVoice(url);
    if (!cached) {
      void args.beginSubtitleBuffering(currentIndex, url);
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = args.getOrCreateVoiceAudioCtx();
    } catch (error) {
      console.error('[VoiceEngine] WebAudio unavailable, falling back to <audio>:', error);
      refs.subtitleBackendRef.current = 'media';
      return;
    }

    const gain = refs.voiceGainRef.current;
    if (!gain) return;

    const now = ctx.currentTime;
    const lead = 0.04;
    const desiredVideoAtStart = time + lead;
    const offset = Math.max(0, desiredVideoAtStart - subtitle.startTime);
    const maxPlayable = Math.min(subtitle.duration, cached.duration);
    const playableDuration = Math.max(0, maxPlayable - offset);

    const active = refs.voiceCurrentRef.current;
    const scheduledCurrent = refs.voiceNextRef.current;
    if ((!active || active.index !== currentIndex || active.url !== url) && scheduledCurrent && scheduledCurrent.index === currentIndex && scheduledCurrent.url === url) {
      if (active && (active.index !== currentIndex || active.url !== url)) {
        stopScheduledVoiceSource(active);
      }
      refs.voiceNextRef.current = null;
      refs.voiceCurrentRef.current = {
        index: currentIndex,
        url,
        source: scheduledCurrent.source,
        stopAt: scheduledCurrent.stopAt,
        epoch: scheduledCurrent.epoch,
      };
      try {
        scheduledCurrent.source.onended = () => {
          try {
            scheduledCurrent.source.disconnect();
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore
      }
    }

    const current = refs.voiceCurrentRef.current;
    if (!current || current.index !== currentIndex || current.url !== url) {
      const tailGuard = Math.max(0.08, Math.min(0.12, maxPlayable * 0.25));
      args.stopWebAudioVoice();
      if (playableDuration > tailGuard) {
        try {
          const source = ctx.createBufferSource();
          source.buffer = cached;
          source.connect(gain);
          const startAt = now + lead;
          source.start(startAt, offset, playableDuration);
          const stopAt = startAt + playableDuration;
          try {
            source.stop(stopAt + 0.01);
          } catch {
            // ignore
          }
          refs.voiceCurrentRef.current = {
            index: currentIndex,
            url,
            source,
            stopAt,
            epoch: refs.voiceEpochRef.current,
          };
          source.onended = () => {
            try {
              source.disconnect();
            } catch {
              // ignore
            }
          };
        } catch (error) {
          console.error('[VoiceEngine] start failed:', error);
        }
      }
    }

    const nextSubtitle = track[currentIndex + 1];
    if (!nextSubtitle?.audioUrl || nextSubtitle.duration <= 0) {
      stopScheduledVoiceSource(refs.voiceNextRef.current);
      refs.voiceNextRef.current = null;
      return;
    }

    const nextUrl = nextSubtitle.audioUrl.trim();
    if (!nextUrl) return;

    const decodeLookaheadCount = Math.max(1, Math.min(3, args.getAdaptiveWebAudioDecodeLookaheadCount()));
    for (let lookaheadIndex = 1; lookaheadIndex <= decodeLookaheadCount; lookaheadIndex += 1) {
      const segment = track[currentIndex + lookaheadIndex];
      const segmentUrl = (segment?.audioUrl || '').trim();
      if (!segmentUrl) continue;
      if (args.cacheGetVoice(segmentUrl) || refs.voiceInflightRef.current.has(segmentUrl)) continue;
      const controller = new AbortController();
      void args.ensureVoiceBuffer(segmentUrl, controller.signal).catch(() => {
        // silent
      });
    }

    const nextBuffer = args.cacheGetVoice(nextUrl);
    if (!nextBuffer) return;

    const when = now + Math.max(0, nextSubtitle.startTime - time);
    if (when > now + 3.0) return;

    const scheduled = refs.voiceNextRef.current;
    if (
      scheduled &&
      scheduled.index === currentIndex + 1 &&
      scheduled.url === nextUrl &&
      typeof scheduled.startAt === 'number' &&
      Math.abs(scheduled.startAt - when) <= 0.06
    ) {
      return;
    }

    stopScheduledVoiceSource(refs.voiceNextRef.current);
    refs.voiceNextRef.current = null;

    try {
      const source = ctx.createBufferSource();
      source.buffer = nextBuffer;
      source.connect(gain);
      const playableDuration = Math.min(nextSubtitle.duration, nextBuffer.duration);
      if (playableDuration <= 0.02) return;
      source.start(when, 0, playableDuration);
      const stopAt = when + playableDuration;
      try {
        source.stop(stopAt + 0.01);
      } catch {
        // ignore
      }
      refs.voiceNextRef.current = {
        index: currentIndex + 1,
        url: nextUrl,
        source,
        startAt: when,
        stopAt,
        epoch: refs.voiceEpochRef.current,
      };
      source.onended = () => {
        const nextState = refs.voiceNextRef.current;
        if (nextState && nextState.source === source) refs.voiceNextRef.current = null;
      };
    } catch (error) {
      console.error('[VoiceEngine] schedule next failed:', error);
    }
  };

  const updateTimeLoop = () => {
    refs.rafIdRef.current = null;
    refs.videoFrameCbIdRef.current = null;

    // Critical Fix #2: Check activeConvertIdRef to prevent cross-task RAF execution
    const videoElement = refs.videoPreviewRef.current?.videoElement;
    if (!videoElement) return;
    if (!refs.isPlayingRef.current) return;
    if (refs.transportIsStalledRef.current || refs.isSubtitleBufferingRef.current) return;
    if (videoElement.paused) return;

    const time = videoElement.currentTime;
    const auditionStopAtMs = refs.auditionStopAtMsRef.current;
    if (auditionStopAtMs != null) {
      const timeMs = time * 1000;
      const isSourceMode = refs.auditionActiveTypeRef.current === 'source';
      const sourceAudio = refs.sourceAuditionAudioRef.current;
      const sourceStillPlaying = isSourceMode && sourceAudio && !sourceAudio.paused && !sourceAudio.ended;
      const graceExceeded = timeMs >= auditionStopAtMs + 3000;

      if (Number.isFinite(timeMs) && timeMs >= auditionStopAtMs + 50 && (!sourceStillPlaying || graceExceeded)) {
        refs.videoStartGateTokenRef.current += 1;
        refs.videoPlayTokenRef.current += 1;
        refs.transportIsStalledRef.current = false;
        args.setIsVideoBuffering(false);
        void args.applyVideoTransportSnapshot(
          {
            mode: args.getVideoSyncMode(),
            status: 'paused',
            transportTimeSec: time,
          },
          {
            seekToleranceSec: 0,
          }
        );
        try {
          if (refs.sourceAuditionAudioRef.current) {
            refs.sourceAuditionAudioRef.current.onended = null;
            refs.sourceAuditionAudioRef.current.onerror = null;
            refs.sourceAuditionAudioRef.current.ontimeupdate = null;
            refs.sourceAuditionAudioRef.current.pause();
          }
        } catch {
          // ignore
        }
        args.setIsPlaying(false);

        args.clearAuditionNaturalStopTimer();
        const taskId = refs.activeConvertIdRef.current;
        refs.auditionNaturalStopTimerRef.current = window.setTimeout(() => {
          refs.auditionNaturalStopTimerRef.current = null;
          if (refs.activeConvertIdRef.current !== taskId) return;
          refs.handleAuditionStopRef.current(true);
        }, 10);
        return;
      }
    }

    refs.timelineHandleRef.current?.setTime(time);

    const previousFollowTime = refs.autoFollowPrevTimeRef.current;
    refs.autoFollowPrevTimeRef.current = time;
    const scroller = document.getElementById('unified-scroll-container');
    if (scroller) {
      const pxPerSecond = Math.max(1, Math.round(50 * refs.zoomRef.current));
      const target = getTimelineAutoFollowTarget({
        currentTime: time,
        prevTime: previousFollowTime >= 0 ? previousFollowTime : time,
        pxPerSec: pxPerSecond,
        scrollLeft: scroller.scrollLeft,
        viewportWidth: scroller.clientWidth,
        contentWidth: scroller.scrollWidth,
        isDragging: false,
      });

      if (target) {
        if (target.mode === 'snap') {
          scroller.scrollLeft = target.targetLeft;
        } else {
          const currentLeft = scroller.scrollLeft;
          const nextLeft = currentLeft + (target.targetLeft - currentLeft) * 0.22;
          scroller.scrollLeft = Math.abs(target.targetLeft - currentLeft) <= 1 ? target.targetLeft : nextLeft;
        }
      }
    }

    if (Math.abs(time - refs.lastUiTimeRef.current) >= 0.18) {
      refs.lastUiTimeRef.current = time;
      args.setCurrentTime(time);
      args.dispatchTransport(syncTransportTime(time));
    }

    if (refs.subtitleBackendRef.current === 'webaudio') syncVoicePlaybackWebAudio(time);
    else syncAudioPlayback(time);

    const requestVideoFrameCallback = videoElement.requestVideoFrameCallback;
    if (typeof requestVideoFrameCallback === 'function') {
      refs.videoFrameCbIdRef.current = requestVideoFrameCallback.call(videoElement, () => updateTimeLoop());
    } else {
      refs.rafIdRef.current = requestAnimationFrame(updateTimeLoop);
    }
  };

  const startUpdateLoop = () => {
    args.cancelUpdateLoop();
    const videoElement = refs.videoPreviewRef.current?.videoElement;
    if (!videoElement) return;
    if (!refs.isPlayingRef.current) return;
    if (refs.transportIsStalledRef.current || refs.isSubtitleBufferingRef.current) return;
    if (videoElement.paused) return;

    const requestVideoFrameCallback = videoElement.requestVideoFrameCallback;
    if (typeof requestVideoFrameCallback === 'function') {
      refs.videoFrameCbIdRef.current = requestVideoFrameCallback.call(videoElement, () => updateTimeLoop());
    } else {
      refs.rafIdRef.current = requestAnimationFrame(updateTimeLoop);
    }
  };

  return {
    findSubtitleIndexAtTime: (track: SubtitleTrackItemLike[], time: number) => findSubtitleIndexAtTime(track, time),
    findNextSubtitleIndexAtOrAfterTime: (track: SubtitleTrackItemLike[], time: number) => findNextSubtitleIndexAtOrAfterTime(track, time),
    syncAudioPlayback,
    syncVoicePlaybackWebAudio,
    updateTimeLoop,
    startUpdateLoop,
  };
}
