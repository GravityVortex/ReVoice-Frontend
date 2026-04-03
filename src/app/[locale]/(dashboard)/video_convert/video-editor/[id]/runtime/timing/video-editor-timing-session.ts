import type { ConvertObj } from '@/shared/components/video-editor/types';

import type { TimingPersistReason, TimingSessionPhase } from './timing-session-owner';

export type VideoEditorTimingSession = {
  state: {
    pendingTimingMap: Record<string, { startMs: number; endMs: number }>;
    pendingTimingCount: number;
    phase: TimingSessionPhase;
    latestPersistIdMap: Record<string, string>;
    lastPersistError: string | null;
    lastPersistedAtMs: number;
    convertObj: ConvertObj | null;
  };
  actions: {
    persistPendingTimingsIfNeeded: (options?: { reason?: TimingPersistReason; silent?: boolean }) => Promise<boolean>;
    reconcilePendingTimingAfterRollback: (restoredRows: Array<{ id?: string; start?: string; end?: string }>) => void;
    remapSubtitleIdAfterTimingSave: (subtitleId: string) => string;
    // P0 Fix #1: Add flushPendingTimings for merge
    flushPendingTimings: () => Promise<boolean>;
  };
};

export function buildVideoEditorTimingSession(session: VideoEditorTimingSession): VideoEditorTimingSession {
  return session;
}
