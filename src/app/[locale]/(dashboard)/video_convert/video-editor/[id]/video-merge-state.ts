export type ActiveVideoMergeJob = {
  jobId: string;
  createdAtMs: number;
};

export type VideoMergeTaskState = {
  taskStatus: string;
  taskErrorMessage: string;
  taskProgress: number | null;
  taskCurrentStep: string;
};

export const MERGE_STATUS_MAX_NETWORK_FAILURES = 5; // Critical Fix #3: Increased from 3 to 5

export type VideoMergePrimaryActionMode = 'generate-video' | 'retry-status';

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readPositiveNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readMetadataObject(metaRaw: unknown) {
  if (!metaRaw) return null;

  if (typeof metaRaw === 'string') {
    try {
      const parsed = JSON.parse(metaRaw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  return typeof metaRaw === 'object' ? metaRaw : null;
}

export function readVideoMergeMetadata(metaRaw: unknown): {
  lastMergedAtMs: number;
  activeJob: ActiveVideoMergeJob | null;
} {
  const meta = readMetadataObject(metaRaw) as Record<string, any> | null;
  if (!meta) {
    return {
      lastMergedAtMs: 0,
      activeJob: null,
    };
  }

  const lastMergedAtMs =
    readPositiveNumber(meta?.videoMerge?.lastSuccess?.mergedAtMs) ||
    readPositiveNumber(meta?.videoMerge?.lastSuccess?.merged_at_ms) ||
    readPositiveNumber(meta?.videoMerge?.lastMergedAtMs) ||
    readPositiveNumber(meta?.videoMerge?.last_merged_at_ms) ||
    readPositiveNumber(meta?.video_merge?.lastMergedAtMs) ||
    readPositiveNumber(meta?.video_merge?.last_merged_at_ms);

  const activeRaw = meta?.videoMerge?.active ?? meta?.video_merge?.active ?? null;
  const activeJobId = readTrimmedString(activeRaw?.jobId ?? activeRaw?.job_id);
  const activeCreatedAtMs = readPositiveNumber(activeRaw?.createdAtMs ?? activeRaw?.created_at_ms);
  const activeState = readTrimmedString(activeRaw?.state).toLowerCase();

  return {
    lastMergedAtMs,
    activeJob:
      activeJobId && activeCreatedAtMs > 0 && (!activeState || activeState === 'pending')
        ? {
            jobId: activeJobId,
            createdAtMs: activeCreatedAtMs,
          }
        : null,
  };
}

export function hydrateVideoMergeMetadataState(args: {
  previousLastMergedAtMs: number;
  metadata: unknown;
}): {
  lastMergedAtMs: number;
  activeJob: ActiveVideoMergeJob | null;
} {
  const metaSnapshot = readVideoMergeMetadata(args.metadata);

  return {
    lastMergedAtMs: Math.max(Math.max(0, args.previousLastMergedAtMs), metaSnapshot.lastMergedAtMs),
    activeJob: metaSnapshot.activeJob,
  };
}

export function resolveVideoMergeStatusResponse(args: {
  response: any;
  baselineMergedAtMs: number;
  previousLastMergedAtMs: number;
  fallbackFailureMessage: string;
}): {
  failureCount: number;
  mergeStatusRequiresManualRetry: boolean;
  clearActiveJob: boolean;
  toastKind: 'success' | 'error' | null;
  toastMessage: string | null;
  taskState: VideoMergeTaskState | null;
  serverLastMergedAtMs: number;
} {
  const { response, baselineMergedAtMs, previousLastMergedAtMs, fallbackFailureMessage } = args;
  const stableMergedAtMs = Math.max(Math.max(0, previousLastMergedAtMs), Math.max(0, baselineMergedAtMs));

  if (response?.code !== 0) {
    const message = response?.message || fallbackFailureMessage;
    return {
      failureCount: 0,
      mergeStatusRequiresManualRetry: false,
      clearActiveJob: true,
      toastKind: 'error',
      toastMessage: message,
      taskState: {
        taskStatus: 'failed',
        taskErrorMessage: message,
        taskProgress: null,
        taskCurrentStep: '',
      },
      serverLastMergedAtMs: Math.max(0, previousLastMergedAtMs),
    };
  }

  const status = readTrimmedString(response?.data?.status).toLowerCase();

  if (status === 'success') {
    return {
      failureCount: 0,
      mergeStatusRequiresManualRetry: false,
      clearActiveJob: true,
      toastKind: 'success',
      toastMessage: null,
      taskState: {
        taskStatus: 'completed',
        taskErrorMessage: '',
        taskProgress: 100,
        taskCurrentStep: '',
      },
      serverLastMergedAtMs: stableMergedAtMs,
    };
  }

  if (status === 'failed') {
    const message = response?.data?.errorMessage || response?.data?.message || fallbackFailureMessage;
    return {
      failureCount: 0,
      mergeStatusRequiresManualRetry: false,
      clearActiveJob: true,
      toastKind: 'error',
      toastMessage: message,
      taskState: {
        taskStatus: 'failed',
        taskErrorMessage: message,
        taskProgress: null,
        taskCurrentStep: '',
      },
      serverLastMergedAtMs: Math.max(0, previousLastMergedAtMs),
    };
  }

  return {
    failureCount: 0,
    mergeStatusRequiresManualRetry: false,
    clearActiveJob: false,
    toastKind: null,
    toastMessage: null,
    taskState: null,
    serverLastMergedAtMs: Math.max(0, previousLastMergedAtMs),
  };
}

export function shouldPollActiveVideoMergeStatus(activeJob: ActiveVideoMergeJob | null, requiresManualRetry: boolean) {
  return Boolean(activeJob?.jobId) && !requiresManualRetry;
}

export function getNextMergeStatusPollState(failureCount: number) {
  const nextFailureCount = Math.max(0, failureCount) + 1;

  return {
    failureCount: nextFailureCount,
    requiresManualRetry: nextFailureCount >= MERGE_STATUS_MAX_NETWORK_FAILURES,
  };
}

export function getVideoMergePrimaryActionState(args: {
  isGeneratingVideo: boolean;
  isTaskRunning: boolean;
  isMergeJobActive: boolean;
  mergeStatusRequiresManualRetry: boolean;
  hasUnsavedChanges: boolean;
}): {
  mode: VideoMergePrimaryActionMode;
  disabled: boolean;
} {
  if (args.isMergeJobActive && args.mergeStatusRequiresManualRetry) {
    return {
      mode: 'retry-status',
      disabled: false,
    };
  }

  return {
    mode: 'generate-video',
    disabled: args.isGeneratingVideo || args.isTaskRunning || args.isMergeJobActive || !args.hasUnsavedChanges,
  };
}

export function reconcileMergeTerminalState(args: {
  taskStatus: string;
  activeJob: ActiveVideoMergeJob | null;
  requiresManualRetry: boolean;
  failureCount: number;
}) {
  const status = readTrimmedString(args.taskStatus).toLowerCase();
  const isTerminal = status.length > 0 && status !== 'pending' && status !== 'processing';

  if (!isTerminal) {
    return {
      activeJob: args.activeJob,
      requiresManualRetry: args.requiresManualRetry,
      failureCount: args.failureCount,
    };
  }

  return {
    activeJob: null,
    requiresManualRetry: false,
    failureCount: 0,
  };
}
