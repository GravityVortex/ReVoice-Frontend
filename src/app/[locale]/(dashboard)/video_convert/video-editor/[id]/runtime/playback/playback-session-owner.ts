import { useEffect } from 'react';

import type { SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';

import { resetTransport, type EditorTransportState } from '../../editor-transport';
import type { VideoPreviewRef } from '../../video-preview-panel';

type MutableRefObjectLike<T> = {
  current: T;
};

type AudioRefLike = MutableRefObjectLike<HTMLAudioElement | null>;

type AuditionRestoreState = {
  subtitleMuted: boolean;
  bgmMuted: boolean;
  videoMuted: boolean;
};

type UsePlaybackSessionOwnerArgs = {
  refs: {
    transportStateRef: MutableRefObjectLike<EditorTransportState>;
    isAutoPlayNextRef: MutableRefObjectLike<boolean>;
    activeConvertIdRef: MutableRefObjectLike<string>;
    explicitMissingVoiceIdSetRef: MutableRefObjectLike<Set<string>>;
    localPendingVoiceIdSetRef: MutableRefObjectLike<Set<string>>;
    playbackBlockedVoiceIdSetRef: MutableRefObjectLike<Set<string>>;
    subtitleTrackRef: MutableRefObjectLike<SubtitleTrackItem[]>;
    subtitleTrackOriginalRef: MutableRefObjectLike<SubtitleTrackItem[]>;
    volumeRef: MutableRefObjectLike<number>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    isPlayingRef: MutableRefObjectLike<boolean>;
    isSubtitleBufferingRef: MutableRefObjectLike<boolean>;
    isBgmMutedRef: MutableRefObjectLike<boolean>;
    voiceGainRef: MutableRefObjectLike<GainNode | null>;
    bgmAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    lastBgmUrlRef: MutableRefObjectLike<string>;
    voiceAudioCtxRef: MutableRefObjectLike<AudioContext | null>;
    seekDragRafRef: MutableRefObjectLike<number | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    auditionRestoreRef: MutableRefObjectLike<AuditionRestoreState | null>;
    auditionActiveTypeRef: MutableRefObjectLike<'source' | 'convert' | null>;
    auditionStopAtMsRef: MutableRefObjectLike<number | null>;
    auditionTokenRef: MutableRefObjectLike<number>;
    videoStartGateTokenRef: MutableRefObjectLike<number>;
    videoPlayTokenRef: MutableRefObjectLike<number>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
    subtitleBackendRef: MutableRefObjectLike<'webaudio' | 'media'>;
    playingSubtitleIndexRef: MutableRefObjectLike<number>;
    lastPlayedSubtitleIndexRef: MutableRefObjectLike<number>;
    lastVoiceSubtitleIndexRef: MutableRefObjectLike<number>;
    lastUiTimeRef: MutableRefObjectLike<number>;
    autoFollowPrevTimeRef: MutableRefObjectLike<number>;
    subtitleRetryRef: MutableRefObjectLike<{ index: number; untilMs: number } | null>;
    subtitleKickRef: MutableRefObjectLike<{ index: number; atMs: number } | null>;
    subtitleWatchdogMsRef: MutableRefObjectLike<number>;
    subtitleGraceUntilMsRef: MutableRefObjectLike<number>;
    seekDragActiveRef: MutableRefObjectLike<boolean>;
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRef | null>;
  };
  audioRefArr: AudioRefLike[];
  convertId: string;
  transportState: EditorTransportState;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  convertPreUrl?: string;
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  documentDuration: number;
  localPendingVoiceIdSet: Set<string>;
  playbackBlockedVoiceIdSet: Set<string>;
  explicitMissingVoiceIdSet: Set<string>;
  volume: number;
  isSubtitleMuted: boolean;
  isPlaying: boolean;
  isSubtitleBuffering: boolean;
  isBgmMuted: boolean;
  abortActiveAuditionPreparation: () => void;
  clearAuditionNaturalStopTimer: () => void;
  abortAllVoiceInflight: () => void;
  cancelUpdateLoop: () => void;
  stopWebAudioVoice: () => void;
  stopAllSubtitleAudio: () => void;
  clearVoiceCache: () => void;
  setTotalDuration: (value: number) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsVideoBuffering: (value: boolean) => void;
  setCurrentTime: (value: number) => void;
  setPlayingSubtitleIndex: (value: number) => void;
  setIsSubtitleMuted: (value: boolean) => void;
  setIsBgmMuted: (value: boolean) => void;
  dispatchTransport: (action: ReturnType<typeof resetTransport>) => void;
};

export function usePlaybackSessionOwner(args: UsePlaybackSessionOwnerArgs) {
  useEffect(() => {
    args.refs.transportStateRef.current = args.transportState;
  }, [args.transportState]);

  useEffect(() => {
    args.refs.isAutoPlayNextRef.current = args.transportState.autoPlayNext;
  }, [args.transportState.autoPlayNext]);

  useEffect(() => {
    return () => {
      args.abortActiveAuditionPreparation();
    };
  }, [args.abortActiveAuditionPreparation]);

  useEffect(() => {
    args.refs.activeConvertIdRef.current = args.convertId;
  }, [args.convertId]);

  useEffect(() => {
    args.refs.explicitMissingVoiceIdSetRef.current = args.explicitMissingVoiceIdSet;
  }, [args.explicitMissingVoiceIdSet]);

  useEffect(() => {
    args.refs.localPendingVoiceIdSetRef.current = args.localPendingVoiceIdSet;
  }, [args.localPendingVoiceIdSet]);

  useEffect(() => {
    args.refs.playbackBlockedVoiceIdSetRef.current = args.playbackBlockedVoiceIdSet;
  }, [args.playbackBlockedVoiceIdSet]);

  useEffect(() => {
    if (args.documentDuration <= 0) return;
    args.setTotalDuration(args.documentDuration);
  }, [args.documentDuration, args.setTotalDuration]);

  useEffect(() => {
    args.refs.bgmAudioRef.current = new Audio();
    args.refs.bgmAudioRef.current.preload = 'auto';
    args.audioRefArr.forEach((ref) => {
      const audio = new Audio();
      audio.preload = 'auto';
      ref.current = audio;
    });

    return () => {
      args.cancelUpdateLoop();
      args.clearAuditionNaturalStopTimer();
      if (args.refs.seekDragRafRef.current != null) {
        cancelAnimationFrame(args.refs.seekDragRafRef.current);
        args.refs.seekDragRafRef.current = null;
      }
      args.refs.bgmAudioRef.current?.pause();
      args.audioRefArr.forEach((ref) => ref.current?.pause());
      try {
        args.refs.sourceAuditionAudioRef.current?.pause();
      } catch {
        // ignore
      }
    };
  }, [args.audioRefArr, args.cancelUpdateLoop, args.clearAuditionNaturalStopTimer]);

  useEffect(() => {
    const audio = args.refs.bgmAudioRef.current;
    if (!audio) return;

    const url = args.bgmTrack[0]?.url;
    if (!url) {
      args.refs.lastBgmUrlRef.current = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (args.refs.lastBgmUrlRef.current === url) return;
    args.refs.lastBgmUrlRef.current = url;
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
  }, [args.bgmTrack]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const urls = [args.videoTrack[0]?.url, args.bgmTrack[0]?.url, args.convertPreUrl]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);

    const origins = new Set<string>();
    for (const url of urls) {
      try {
        origins.add(new URL(url).origin);
      } catch {
        // ignore
      }
    }

    for (const origin of origins) {
      const key = `revoice-preconnect:${origin}`;
      if (document.head.querySelector(`link[data-revoice-hint="${CSS.escape(key)}"]`)) continue;

      const pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = origin;
      pre.crossOrigin = 'anonymous';
      pre.dataset.revoiceHint = key;
      document.head.appendChild(pre);

      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = origin;
      dns.dataset.revoiceHint = key;
      document.head.appendChild(dns);
    }
  }, [args.bgmTrack, args.convertPreUrl, args.videoTrack]);

  useEffect(() => {
    args.refs.subtitleTrackRef.current = args.subtitleTrack;
  }, [args.subtitleTrack]);

  useEffect(() => {
    args.refs.subtitleTrackOriginalRef.current = args.subtitleTrackOriginal;
  }, [args.subtitleTrackOriginal]);

  useEffect(() => {
    args.refs.volumeRef.current = args.volume;
    args.refs.isSubtitleMutedRef.current = args.isSubtitleMuted;
    const gain = args.refs.voiceGainRef.current;
    if (gain) {
      gain.gain.value = args.isSubtitleMuted ? 0 : args.volume / 100;
    }
  }, [args.isSubtitleMuted, args.volume]);

  useEffect(() => {
    args.refs.isPlayingRef.current = args.isPlaying;
  }, [args.isPlaying]);

  useEffect(() => {
    args.refs.isSubtitleBufferingRef.current = args.isSubtitleBuffering;
  }, [args.isSubtitleBuffering]);

  useEffect(() => {
    args.refs.isBgmMutedRef.current = args.isBgmMuted;
  }, [args.isBgmMuted]);

  useEffect(() => {
    return () => {
      args.stopWebAudioVoice();
      args.abortAllVoiceInflight();
      const ctx = args.refs.voiceAudioCtxRef.current;
      args.refs.voiceAudioCtxRef.current = null;
      args.refs.voiceGainRef.current = null;
      if (ctx && typeof ctx.close === 'function') {
        try {
          void ctx.close();
        } catch {
          // ignore
        }
      }
    };
  }, [args.abortAllVoiceInflight, args.stopWebAudioVoice]);

  useEffect(() => {
    args.refs.auditionTokenRef.current += 1;
    args.abortActiveAuditionPreparation();
    args.clearAuditionNaturalStopTimer();
    args.abortAllVoiceInflight();
    args.cancelUpdateLoop();
    args.stopWebAudioVoice();
    args.stopAllSubtitleAudio();
    args.clearVoiceCache();

    args.refs.videoStartGateTokenRef.current += 1;
    args.refs.videoPlayTokenRef.current += 1;
    args.refs.transportIsStalledRef.current = false;
    args.refs.subtitleBackendRef.current = 'webaudio';

    args.setIsPlaying(false);
    args.setIsSubtitleBuffering(false);
    args.setIsVideoBuffering(false);
    args.setCurrentTime(0);
    args.setPlayingSubtitleIndex(-1);

    args.refs.playingSubtitleIndexRef.current = -1;
    args.refs.lastPlayedSubtitleIndexRef.current = -1;
    args.refs.lastVoiceSubtitleIndexRef.current = -1;
    args.refs.lastUiTimeRef.current = -1;
    args.refs.autoFollowPrevTimeRef.current = -1;
    args.refs.subtitleRetryRef.current = null;
    args.refs.subtitleKickRef.current = null;
    args.refs.subtitleWatchdogMsRef.current = 0;
    args.refs.subtitleGraceUntilMsRef.current = 0;
    args.refs.seekDragActiveRef.current = false;
    if (args.refs.seekDragRafRef.current != null) {
      cancelAnimationFrame(args.refs.seekDragRafRef.current);
      args.refs.seekDragRafRef.current = null;
    }

    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    try {
      videoEl?.pause();
    } catch {
      // ignore
    }
    try {
      if (videoEl) videoEl.currentTime = 0;
    } catch {
      // ignore
    }

    try {
      args.refs.bgmAudioRef.current?.pause();
    } catch {
      // ignore
    }
    try {
      if (args.refs.bgmAudioRef.current) args.refs.bgmAudioRef.current.currentTime = 0;
    } catch {
      // ignore
    }

    try {
      if (args.refs.sourceAuditionAudioRef.current) {
        args.refs.sourceAuditionAudioRef.current.onended = null;
        args.refs.sourceAuditionAudioRef.current.onerror = null;
        args.refs.sourceAuditionAudioRef.current.ontimeupdate = null;
        args.refs.sourceAuditionAudioRef.current.pause();
      }
    } catch {
      // ignore
    }

    const restore = args.refs.auditionRestoreRef.current;
    if (restore) {
      args.setIsSubtitleMuted(restore.subtitleMuted);
      args.refs.isSubtitleMutedRef.current = restore.subtitleMuted;
      args.setIsBgmMuted(restore.bgmMuted);
      args.refs.isBgmMutedRef.current = restore.bgmMuted;
      if (videoEl) {
        videoEl.muted = restore.videoMuted;
      }
    } else if (videoEl) {
      videoEl.muted = false;
    }

    args.refs.auditionRestoreRef.current = null;
    args.refs.auditionActiveTypeRef.current = null;
    args.refs.auditionStopAtMsRef.current = null;

    args.dispatchTransport(resetTransport({ autoPlayNext: args.refs.isAutoPlayNextRef.current }));
  }, [
    args.abortActiveAuditionPreparation,
    args.abortAllVoiceInflight,
    args.cancelUpdateLoop,
    args.clearAuditionNaturalStopTimer,
    args.clearVoiceCache,
    args.convertId,
    args.dispatchTransport,
    args.setCurrentTime,
    args.setIsBgmMuted,
    args.setIsPlaying,
    args.setIsSubtitleBuffering,
    args.setIsSubtitleMuted,
    args.setIsVideoBuffering,
    args.setPlayingSubtitleIndex,
    args.stopAllSubtitleAudio,
    args.stopWebAudioVoice,
  ]);
}
