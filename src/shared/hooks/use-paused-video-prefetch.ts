'use client';

import { RefObject, useEffect, useRef } from 'react';
import { getBufferedAheadSeconds } from '@/shared/lib/media-buffer';

interface UsePausedVideoPrefetchOptions {
  enabled?: boolean;
  minBufferedAheadSeconds?: number;
  intervalMs?: number;
  warmupPlayMs?: number;
  metadataTimeoutMs?: number;
  maxWarmupsPerPause?: number;
}

const DEFAULT_OPTIONS: Required<UsePausedVideoPrefetchOptions> = {
  enabled: true,
  minBufferedAheadSeconds: 6,
  intervalMs: 2500,
  warmupPlayMs: 260,
  metadataTimeoutMs: 2500,
  maxWarmupsPerPause: 6,
};

function isAutoplayBlockError(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as any).name || '') : '';
  return name === 'NotAllowedError' || name === 'AbortError';
}

function isReadyForMetadata(video: HTMLVideoElement) {
  return video.readyState >= 1;
}

async function waitForMetadata(video: HTMLVideoElement, timeoutMs: number) {
  if (isReadyForMetadata(video)) return true;
  return await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onFail);
      clearTimeout(timerId);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onFail = () => finish(false);
    const timerId = window.setTimeout(() => finish(false), Math.max(200, timeoutMs));

    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onFail, { once: true });
  });
}

export function usePausedVideoPrefetch(
  videoRef: RefObject<HTMLVideoElement | null>,
  options?: UsePausedVideoPrefetchOptions
) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const shadowVideoRef = useRef<HTMLVideoElement | null>(null);
  const inFlightRef = useRef(false);
  const blockedUntilPlayRef = useRef(false);
  const lastSrcRef = useRef('');
  const pausedWarmupCountRef = useRef(0);
  const pauseAnchorBucketRef = useRef<number | null>(null);

  useEffect(() => {
    if (!opts.enabled) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let disposed = false;
    let timerId: number | null = null;

    const ensureShadowVideo = () => {
      let shadow = shadowVideoRef.current;
      if (shadow) return shadow;

      shadow = document.createElement('video');
      shadow.preload = 'auto';
      shadow.muted = true;
      shadow.playsInline = true;
      shadow.controls = false;
      shadow.setAttribute('aria-hidden', 'true');
      shadow.tabIndex = -1;
      shadow.style.cssText =
        'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(shadow);
      shadowVideoRef.current = shadow;
      return shadow;
    };

    const disposeShadowVideo = () => {
      const shadow = shadowVideoRef.current;
      shadowVideoRef.current = null;
      if (!shadow) return;
      try {
        shadow.pause();
      } catch {
        // ignore
      }
      try {
        shadow.removeAttribute('src');
        shadow.load();
      } catch {
        // ignore
      }
      if (shadow.parentElement) {
        shadow.parentElement.removeChild(shadow);
      }
    };

    const runWarmup = async (mainVideo: HTMLVideoElement) => {
      if (disposed || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const src = (mainVideo.currentSrc || mainVideo.src || '').trim();
        if (!src || mainVideo.paused === false || mainVideo.ended) return;

        const shadow = ensureShadowVideo();
        const shadowSrc = (shadow.currentSrc || shadow.src || '').trim();
        if (shadowSrc !== src) {
          try {
            shadow.src = src;
            shadow.load();
          } catch {
            return;
          }
        }

        const metadataReady = await waitForMetadata(shadow, opts.metadataTimeoutMs);
        if (!metadataReady || disposed) return;

        const anchor = Number.isFinite(mainVideo.currentTime) ? Math.max(0, mainVideo.currentTime) : 0;
        const duration = Number.isFinite(shadow.duration) ? shadow.duration : 0;
        const maxSeek = duration > 0 ? Math.max(0, duration - 0.05) : anchor;
        const targetTime = Math.min(anchor, maxSeek);
        if (Math.abs((shadow.currentTime || 0) - targetTime) > 0.2) {
          try {
            shadow.currentTime = targetTime;
          } catch {
            // ignore
          }
        }

        const rate = Number.isFinite(mainVideo.playbackRate) && mainVideo.playbackRate > 0
          ? mainVideo.playbackRate
          : 1;
        shadow.playbackRate = Math.max(1, Math.min(rate, 3));

        try {
          await shadow.play();
          await new Promise((resolve) => {
            window.setTimeout(resolve, Math.max(120, opts.warmupPlayMs));
          });
        } catch (err) {
          if (isAutoplayBlockError(err)) {
            blockedUntilPlayRef.current = true;
          }
        } finally {
          try {
            shadow.pause();
          } catch {
            // ignore
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const tick = async () => {
      if (disposed) return;
      const mainVideo = videoRef.current;
      if (!mainVideo) return;

      const src = (mainVideo.currentSrc || mainVideo.src || '').trim();
      if (src !== lastSrcRef.current) {
        lastSrcRef.current = src;
        blockedUntilPlayRef.current = false;
        pausedWarmupCountRef.current = 0;
        pauseAnchorBucketRef.current = null;
      }

      // 用户已恢复播放后，重置自动播放拦截标记，下一次暂停可继续预缓存。
      if (!mainVideo.paused) {
        blockedUntilPlayRef.current = false;
        pausedWarmupCountRef.current = 0;
        pauseAnchorBucketRef.current = null;
        return;
      }
      if (mainVideo.ended || blockedUntilPlayRef.current) return;

      const anchorTime = Number.isFinite(mainVideo.currentTime) ? Math.max(0, mainVideo.currentTime) : 0;
      const anchorBucket = Math.floor(anchorTime / 0.5);
      if (pauseAnchorBucketRef.current !== anchorBucket) {
        pauseAnchorBucketRef.current = anchorBucket;
        pausedWarmupCountRef.current = 0;
      }
      if (pausedWarmupCountRef.current >= Math.max(1, opts.maxWarmupsPerPause)) return;

      try {
        if (mainVideo.readyState === 0) mainVideo.load();
      } catch {
        // ignore
      }

      const ahead = getBufferedAheadSeconds(mainVideo.buffered as any, anchorTime);
      if (ahead >= Math.max(0, opts.minBufferedAheadSeconds)) return;

      pausedWarmupCountRef.current += 1;
      await runWarmup(mainVideo);
    };

    timerId = window.setInterval(() => {
      void tick();
    }, Math.max(800, opts.intervalMs));

    void tick();

    return () => {
      disposed = true;
      if (timerId != null) window.clearInterval(timerId);
      disposeShadowVideo();
    };
  }, [
    opts.enabled,
    opts.intervalMs,
    opts.metadataTimeoutMs,
    opts.maxWarmupsPerPause,
    opts.minBufferedAheadSeconds,
    opts.warmupPlayMs,
    videoRef,
  ]);
}
