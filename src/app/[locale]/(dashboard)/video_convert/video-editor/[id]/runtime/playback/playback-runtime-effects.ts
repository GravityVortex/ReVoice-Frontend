import { useEffect } from 'react';

type MutableRefObjectLike<T> = {
  current: T;
};

type TrackLike = {
  url?: string;
};

type AudioRefLike = MutableRefObjectLike<HTMLAudioElement | null>;

type VideoPreviewRefLike = {
  videoElement?: (HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  }) | null;
};

type UsePlaybackRuntimeEffectsArgs = {
  refs: {
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRefLike | null>;
    transportStallTimerRef: MutableRefObjectLike<number | null>;
    subtitleBackendRef: MutableRefObjectLike<'webaudio' | 'media'>;
    voiceAudioCtxRef: MutableRefObjectLike<AudioContext | null>;
    isSubtitleBufferingRef: MutableRefObjectLike<boolean>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
    bgmAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    bgmKickMsRef: MutableRefObjectLike<number>;
    lastPlayedSubtitleIndexRef: MutableRefObjectLike<number>;
    isAudioRefArrPauseRef: MutableRefObjectLike<boolean>;
    seekDragActiveRef: MutableRefObjectLike<boolean>;
    lastVoiceSubtitleIndexRef: MutableRefObjectLike<number>;
  };
  audioRefArr: AudioRefLike[];
  bgmTrack: TrackLike[];
  pausePrefetchAbortRef: MutableRefObjectLike<AbortController | null>;
  isPlaying: boolean;
  isSubtitleBuffering: boolean;
  isVideoBuffering: boolean;
  isBgmMuted: boolean;
  isSubtitleMuted: boolean;
  currentTime: number;
  volume: number;
  abortReason: unknown;
  isAbortError: (error: unknown) => boolean;
  cancelUpdateLoop: () => void;
  startUpdateLoop: () => void;
  stopWebAudioVoice: () => void;
  prefetchVoiceAroundTime: (time: number, opts?: { count?: number; signal?: AbortSignal }) => void;
  getAdaptivePrefetchCount: (mode: 'play' | 'pause' | 'lookahead') => number;
  getPrefetchSubtitleUrls: (time: number, count?: number) => string[];
  setIsVideoBuffering: (value: boolean) => void;
};

export function usePlaybackRuntimeEffects(args: UsePlaybackRuntimeEffectsArgs) {
  useEffect(() => {
    const suppressAbort = (event: PromiseRejectionEvent) => {
      if (args.isAbortError(event.reason)) event.preventDefault();
    };
    const suppressAbortSync = (event: ErrorEvent) => {
      if (args.isAbortError(event.error)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('unhandledrejection', suppressAbort);
    window.addEventListener('error', suppressAbortSync, true);
    return () => {
      window.removeEventListener('unhandledrejection', suppressAbort);
      window.removeEventListener('error', suppressAbortSync, true);
    };
  }, [args.isAbortError]);

  useEffect(() => {
    const videoEl = args.refs.videoPreviewRef.current?.videoElement as any;
    if (!videoEl) return;

    const clearStallTimer = () => {
      const id = args.refs.transportStallTimerRef.current;
      if (id == null) return;
      args.refs.transportStallTimerRef.current = null;
      try {
        window.clearTimeout(id);
      } catch {
        // ignore
      }
    };

    const suspendVoice = () => {
      if (args.refs.subtitleBackendRef.current !== 'webaudio') return;
      const ctx = args.refs.voiceAudioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'running') {
        void ctx.suspend().catch(() => {
          // ignore
        });
      }
    };

    const resumeVoice = () => {
      if (args.refs.subtitleBackendRef.current !== 'webaudio') return;
      const ctx = args.refs.voiceAudioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          // ignore
        });
      }
    };

    const onBufferStart = () => {
      if (videoEl.paused) return;
      if (args.refs.isSubtitleBufferingRef.current) return;
      if (args.refs.transportIsStalledRef.current) return;
      if (args.refs.transportStallTimerRef.current != null) return;

      args.refs.transportStallTimerRef.current = window.setTimeout(() => {
        args.refs.transportStallTimerRef.current = null;
        if (videoEl.paused) return;
        if (args.refs.isSubtitleBufferingRef.current) return;
        if (args.refs.transportIsStalledRef.current) return;

        args.refs.transportIsStalledRef.current = true;
        args.setIsVideoBuffering(true);
        args.cancelUpdateLoop();

        try {
          args.refs.bgmAudioRef.current?.pause();
        } catch {
          // ignore
        }
        if (args.refs.subtitleBackendRef.current === 'media') {
          args.audioRefArr.forEach((ref) => {
            try {
              ref.current?.pause();
            } catch {
              // ignore
            }
          });
        }
        suspendVoice();
      }, 180);
    };

    const onBufferEnd = () => {
      clearStallTimer();
      args.refs.transportIsStalledRef.current = false;
      args.setIsVideoBuffering(false);
      if (args.refs.isSubtitleBufferingRef.current) return;
      if (videoEl.paused) return;
      resumeVoice();
      args.refs.bgmKickMsRef.current = 0;
      args.startUpdateLoop();
    };

    const onPauseLike = () => {
      clearStallTimer();
      args.refs.transportIsStalledRef.current = false;
      args.setIsVideoBuffering(false);
      args.cancelUpdateLoop();
    };

    videoEl.addEventListener('waiting', onBufferStart);
    videoEl.addEventListener('stalled', onBufferStart);
    videoEl.addEventListener('playing', onBufferEnd);
    videoEl.addEventListener('canplay', onBufferEnd);
    videoEl.addEventListener('pause', onPauseLike);
    videoEl.addEventListener('ended', onPauseLike);

    return () => {
      clearStallTimer();
      videoEl.removeEventListener('waiting', onBufferStart);
      videoEl.removeEventListener('stalled', onBufferStart);
      videoEl.removeEventListener('playing', onBufferEnd);
      videoEl.removeEventListener('canplay', onBufferEnd);
      videoEl.removeEventListener('pause', onPauseLike);
      videoEl.removeEventListener('ended', onPauseLike);
    };
  }, [args.audioRefArr, args.cancelUpdateLoop, args.setIsVideoBuffering, args.startUpdateLoop]);

  useEffect(() => {
    if (!args.isPlaying) return;
    args.refs.lastPlayedSubtitleIndexRef.current = -1;
    args.refs.isAudioRefArrPauseRef.current = false;
  }, [args.isPlaying, args.refs.isAudioRefArrPauseRef, args.refs.lastPlayedSubtitleIndexRef]);

  useEffect(() => {
    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    if (!videoEl) return;

    if (args.isPlaying) {
      if (args.refs.subtitleBackendRef.current === 'webaudio') {
        void args.refs.voiceAudioCtxRef.current?.resume?.().catch(() => {
          // ignore
        });
      }
      return;
    }

    args.cancelUpdateLoop();
    args.refs.transportIsStalledRef.current = false;
    args.setIsVideoBuffering(false);
    args.refs.bgmAudioRef.current?.pause();
    args.audioRefArr.forEach((ref) => ref.current?.pause());
    args.stopWebAudioVoice();
  }, [
    args.audioRefArr,
    args.cancelUpdateLoop,
    args.isPlaying,
    args.setIsVideoBuffering,
    args.stopWebAudioVoice,
  ]);

  useEffect(() => {
    if (args.isPlaying || args.isSubtitleBuffering || args.refs.seekDragActiveRef.current) {
      try {
        args.pausePrefetchAbortRef.current?.abort(args.abortReason);
      } catch {
        // ignore
      }
      args.pausePrefetchAbortRef.current = null;
      return;
    }

    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) return;

    const anchor = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime || 0 : args.currentTime;
    if (args.refs.subtitleBackendRef.current === 'webaudio') {
      const controller = new AbortController();
      try {
        args.pausePrefetchAbortRef.current?.abort(args.abortReason);
      } catch {
        // ignore
      }
      args.pausePrefetchAbortRef.current = controller;

      args.prefetchVoiceAroundTime(anchor, { count: args.getAdaptivePrefetchCount('pause'), signal: controller.signal });

      return () => {
        try {
          controller.abort(args.abortReason);
        } catch {
          // ignore
        }
        if (args.pausePrefetchAbortRef.current === controller) {
          args.pausePrefetchAbortRef.current = null;
        }
      };
    }

    try {
      args.pausePrefetchAbortRef.current?.abort(args.abortReason);
    } catch {
      // ignore
    }
    args.pausePrefetchAbortRef.current = null;
    if (args.refs.subtitleBackendRef.current !== 'media') return;

    const preloadCount = Math.max(1, Math.min(args.audioRefArr.length, args.getAdaptivePrefetchCount('pause')));
    const urls = args.getPrefetchSubtitleUrls(anchor, preloadCount);
    for (let index = 0; index < preloadCount; index += 1) {
      const url = urls[index];
      if (!url) break;
      const audio = args.audioRefArr[index]?.current;
      if (!audio) continue;
      const needsReload =
        audio.src !== url ||
        Boolean(audio.error) ||
        audio.networkState === 0 ||
        audio.networkState === 3;
      if (!needsReload) continue;
      audio.preload = 'auto';
      audio.src = url;
      try {
        audio.load();
      } catch {
        // ignore
      }
    }
  }, [
    args.abortReason,
    args.audioRefArr,
    args.currentTime,
    args.getAdaptivePrefetchCount,
    args.getPrefetchSubtitleUrls,
    args.isPlaying,
    args.isSubtitleBuffering,
    args.pausePrefetchAbortRef,
    args.prefetchVoiceAroundTime,
    args.refs.seekDragActiveRef,
    args.refs.subtitleBackendRef,
    args.refs.videoPreviewRef,
  ]);

  useEffect(() => {
    if (!args.isPlaying) return;
    args.startUpdateLoop();
  }, [args.isPlaying, args.startUpdateLoop]);

  useEffect(() => {
    const bgm = args.refs.bgmAudioRef.current;
    if (!bgm) return;
    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    if (
      !args.isPlaying ||
      !videoEl ||
      videoEl.paused ||
      args.isBgmMuted ||
      args.isSubtitleBuffering ||
      args.isVideoBuffering ||
      args.refs.transportIsStalledRef.current
    ) {
      try {
        bgm.pause();
      } catch {
        // ignore
      }
      return;
    }
    if (args.bgmTrack.length <= 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - args.refs.bgmKickMsRef.current < 220) return;
    args.refs.bgmKickMsRef.current = now;

    const transportTime = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime || 0 : args.currentTime;
    try {
      if (Math.abs(bgm.currentTime - transportTime) > 0.45) {
        bgm.currentTime = transportTime;
      }
    } catch {
      // ignore
    }
    bgm.volume = args.volume / 100;
    if (bgm.paused) {
      bgm.play().catch((error) => {
        if (args.isAbortError(error)) return;
        console.error('BGM play failed', error);
      });
    }
  }, [
    args.bgmTrack,
    args.currentTime,
    args.isAbortError,
    args.isBgmMuted,
    args.isPlaying,
    args.isSubtitleBuffering,
    args.isVideoBuffering,
    args.refs.bgmAudioRef,
    args.refs.bgmKickMsRef,
    args.refs.transportIsStalledRef,
    args.refs.videoPreviewRef,
    args.volume,
  ]);

  useEffect(() => {
    if (!args.isSubtitleMuted) return;
    args.audioRefArr.forEach((ref) => ref.current?.pause());
    args.stopWebAudioVoice();
  }, [args.audioRefArr, args.isSubtitleMuted, args.stopWebAudioVoice]);

  useEffect(() => {
    if (!args.isPlaying) return;
    if (args.isSubtitleMuted) return;
    args.refs.lastPlayedSubtitleIndexRef.current = -1;
    args.refs.lastVoiceSubtitleIndexRef.current = -1;
    args.stopWebAudioVoice();
  }, [
    args.isPlaying,
    args.isSubtitleMuted,
    args.refs.lastPlayedSubtitleIndexRef,
    args.refs.lastVoiceSubtitleIndexRef,
    args.stopWebAudioVoice,
  ]);
}
