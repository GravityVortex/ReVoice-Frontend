'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/utils';

import { normalizeVideoAspectRatio } from './video-frame';

export interface SubtitleItem {
  id: string;
  start: number;
  end: number;
  txt: string;
}

export interface LoadedVideoMetadata {
  videoWidth: number;
  videoHeight: number;
  aspectRatio: number;
}

interface PlyrVideoPlayerProps {
  src: string;
  subtitles?: SubtitleItem[];
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onMetadataLoaded?: (metadata: LoadedVideoMetadata) => void;
}

export function PlyrVideoPlayer({
  src,
  subtitles = [],
  autoPlay = false,
  loop = false,
  playbackRate = 1,
  onTimeUpdate,
  onMetadataLoaded,
}: PlyrVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [plyrContainer, setPlyrContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || typeof window === 'undefined') return;

    let player: any = null;

    const initPlayer = async () => {
      const PlyrLib = (await import('plyr')).default;
      await import('plyr/dist/plyr.css');

      player = new PlyrLib(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
        settings: ['speed'],
        speed: { selected: playbackRate, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        fullscreen: { enabled: true, fallback: true, iosNative: true },
        clickToPlay: true,
        hideControls: false,
        invertTime: true,
      });

      playerRef.current = player;
      player.speed = playbackRate;
      player.loop = loop;

      player.on('enterfullscreen', () => setIsFullscreen(true));
      player.on('exitfullscreen', () => setIsFullscreen(false));

      const plyrEl = video.closest('.plyr') as HTMLElement;
      if (plyrEl) {
        setPlyrContainer(plyrEl);
      }
    };

    initPlayer();

    return () => {
      if (player) {
        player.destroy();
        playerRef.current = null;
      }
      setPlyrContainer(null);
    };
  }, []);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.speed = playbackRate;
    }
  }, [playbackRate]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    onMetadataLoaded?.({
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      aspectRatio: normalizeVideoAspectRatio(video.videoWidth, video.videoHeight),
    });
  }, [onMetadataLoaded]);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      const currentTime = video.currentTime;
      onTimeUpdate?.(currentTime);

      if (subtitles.length === 0) {
        setCurrentSubtitle(null);
        return;
      }

      const matches = subtitles.filter((s) => s.start <= currentTime && currentTime < s.end);
      if (matches.length === 0) {
        setCurrentSubtitle(null);
      } else if (matches.length === 1) {
        setCurrentSubtitle(matches[0]);
      } else {
        setCurrentSubtitle(matches.reduce((a, b) => (a.end < b.end ? a : b)));
      }
    },
    [subtitles, onTimeUpdate]
  );

  const subtitleElement = currentSubtitle && (
    <div
      className={cn(
        'pointer-events-none absolute bottom-16 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-center font-medium whitespace-pre-wrap text-white',
        isFullscreen ? 'text-xl' : 'text-sm'
      )}
    >
      {currentSubtitle.txt}
    </div>
  );

  return (
    <div ref={containerRef} className="absolute inset-0">
      <video
        ref={videoRef}
        src={src}
        className="absolute inset-0 h-full w-full object-contain"
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />
      {plyrContainer && subtitleElement && createPortal(subtitleElement, plyrContainer)}
    </div>
  );
}
