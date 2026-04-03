import type { ActiveVideoMergeJob } from '../../video-merge-state';

import type { MergeSessionPhase } from './merge-session-owner';

export type VideoEditorMergeSession = {
  state: {
    phase: MergeSessionPhase;
    taskStatus: string;
    taskErrorMessage: string;
    taskProgress: number | null;
    taskCurrentStep: string;
    activeJob: ActiveVideoMergeJob | null;
    failureCount: number;
    lastMergedAtMs: number;
  };
  view: {
    isTaskRunning: boolean;
    isMergeJobActive: boolean;
    isGeneratingVideo: boolean;
    mergeStatusRequiresManualRetry: boolean;
  };
};

export function buildVideoEditorMergeSession(session: VideoEditorMergeSession): VideoEditorMergeSession {
  return session;
}
