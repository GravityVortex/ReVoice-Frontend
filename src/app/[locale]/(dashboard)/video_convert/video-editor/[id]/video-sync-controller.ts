const VIDEO_SYNC_LOG_PREFIX = '[VideoSync]';

export type VideoSyncSnapshot = {
  mode: 'timeline' | 'audition_source' | 'audition_convert';
  status: 'paused' | 'buffering' | 'playing';
  transportTimeSec: number;
};

export type VideoLikeElement = {
  currentTime: number;
  paused: boolean;
  play: () => Promise<unknown>;
  pause: () => void;
};

type VideoSyncControllerOptions = {
  seekToleranceSec?: number;
  play?: () => Promise<unknown>;
  pause?: () => void;
};

function logVideoSync(event: string, meta: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') return;
  console.debug(VIDEO_SYNC_LOG_PREFIX, event, meta);
}

export function createVideoSyncController(
  video: VideoLikeElement,
  opts?: VideoSyncControllerOptions
) {
  const seekToleranceSec = opts?.seekToleranceSec ?? 0.05;

  return {
    async apply(snapshot: VideoSyncSnapshot) {
      if (!Number.isFinite(snapshot.transportTimeSec)) return;

      if (Math.abs(video.currentTime - snapshot.transportTimeSec) > seekToleranceSec) {
        video.currentTime = snapshot.transportTimeSec;
        logVideoSync('seek', {
          mode: snapshot.mode,
          status: snapshot.status,
          transportTimeSec: snapshot.transportTimeSec,
        });
      }

      if (snapshot.status === 'playing') {
        logVideoSync('play', {
          mode: snapshot.mode,
          transportTimeSec: snapshot.transportTimeSec,
        });
        await (opts?.play ? opts.play() : video.play());
        return;
      }

      if (!video.paused) {
        logVideoSync('pause', {
          mode: snapshot.mode,
          transportTimeSec: snapshot.transportTimeSec,
        });
        if (opts?.pause) opts.pause();
        else video.pause();
      }
    },
  };
}
