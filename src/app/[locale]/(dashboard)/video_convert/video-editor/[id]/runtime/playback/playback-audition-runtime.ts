import { useEffect } from 'react';

import { clearPendingNextClip, type EditorAuditionMode } from '../../editor-transport';

type MutableRefObjectLike<T> = {
  current: T;
};

type SubtitleLike = {
  id?: string;
};

type UsePlaybackAuditionRuntimeArgs = {
  handleAuditionStopRef: MutableRefObjectLike<(naturalEnd?: boolean) => void>;
  handleAuditionStop: (naturalEnd?: boolean) => void;
  pendingNextClipIndex: number | null;
  pendingNextMode: EditorAuditionMode | null;
  getSubtitleTrack: () => SubtitleLike[];
  logEditorTransport: (level: 'debug' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => void;
  dispatchTransport: (action: ReturnType<typeof clearPendingNextClip>) => void;
  handleAuditionRequestPlay: (index: number, mode: EditorAuditionMode) => Promise<void>;
};

export function usePlaybackAuditionRuntime(args: UsePlaybackAuditionRuntimeArgs) {
  useEffect(() => {
    args.handleAuditionStopRef.current = args.handleAuditionStop;
  }, [args.handleAuditionStop, args.handleAuditionStopRef]);

  useEffect(() => {
    const nextIndex = args.pendingNextClipIndex;
    const nextMode = args.pendingNextMode;
    if (nextIndex == null || nextMode == null) return;

    const timer = window.setTimeout(() => {
      args.logEditorTransport('debug', 'queue-next-audition', {
        clipId: args.getSubtitleTrack()[nextIndex]?.id ?? null,
        mode: nextMode,
        index: nextIndex,
      });
      args.dispatchTransport(clearPendingNextClip());
      void args.handleAuditionRequestPlay(nextIndex, nextMode);
    }, 50);

    return () => window.clearTimeout(timer);
  }, [
    args.dispatchTransport,
    args.getSubtitleTrack,
    args.handleAuditionRequestPlay,
    args.logEditorTransport,
    args.pendingNextClipIndex,
    args.pendingNextMode,
  ]);
}
