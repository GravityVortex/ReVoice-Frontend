import type { Dispatch, SetStateAction } from 'react';

import type { VideoPreviewRef } from '../../video-preview-panel';
import { setAutoPlayNext as setTransportAutoPlayNext, type EditorTransportAction } from '../../editor-transport';

type MutableRefObjectLike<T> = {
  current: T;
};

type AudioRefLike = MutableRefObjectLike<HTMLAudioElement | null>;

type CreatePlaybackControlOwnerArgs = {
  refs: {
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRef | null>;
    bgmAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
  };
  audioRefArr: AudioRefLike[];
  setVolume: (value: number) => void;
  setIsBgmMuted: Dispatch<SetStateAction<boolean>>;
  setIsSubtitleMuted: Dispatch<SetStateAction<boolean>>;
  setIsAutoPlayNext: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  dispatchTransport: (action: EditorTransportAction) => void;
  handlePlayPause: () => void;
};

export function createPlaybackControlOwner(args: CreatePlaybackControlOwnerArgs) {
  const handleGlobalVolume = (vol: number) => {
    args.setVolume(vol);
    const output = vol / 100;
    if (args.refs.videoPreviewRef.current?.videoElement) {
      args.refs.videoPreviewRef.current.videoElement.volume = output;
    }
    if (args.refs.bgmAudioRef.current) {
      args.refs.bgmAudioRef.current.volume = output;
    }
    args.audioRefArr.forEach((ref) => {
      if (ref.current) ref.current.volume = output;
    });
    if (args.refs.sourceAuditionAudioRef.current) {
      args.refs.sourceAuditionAudioRef.current.volume = output;
    }
  };

  const handleToggleBgmMute = () => {
    args.setIsBgmMuted((value) => !value);
  };

  const handleToggleSubtitleMute = () => {
    args.setIsSubtitleMuted((value) => !value);
  };

  const handleAutoPlayNextChange = (value: boolean) => {
    args.setIsAutoPlayNext(value);
    args.dispatchTransport(setTransportAutoPlayNext(value));
  };

  const handleAuditionToggle = () => {
    args.handlePlayPause();
  };

  const handlePreviewPlayStateChange = (nextIsPlaying: boolean) => {
    args.setIsPlaying(nextIsPlaying);
  };

  return {
    handleGlobalVolume,
    handleToggleBgmMute,
    handleToggleSubtitleMute,
    handleAutoPlayNextChange,
    handleAuditionToggle,
    handlePreviewPlayStateChange,
  };
}
