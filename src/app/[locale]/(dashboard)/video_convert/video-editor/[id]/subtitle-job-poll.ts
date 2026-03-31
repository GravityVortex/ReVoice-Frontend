'use client';

import { fetchWithTimeout } from './runtime/network/fetch-with-timeout';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_NETWORK_FAILURES = 3;

type PendingJobType = 'gen_srt' | 'translate_srt';

type PollSubtitleJobArgs = {
  taskId: string;
  subtitleName: string;
  type: PendingJobType;
  jobId: string;
  requestKey?: string;
  timeoutMs?: number;
  failureMessage: string;
};

type PollSubtitleJobOptions = {
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  maxNetworkFailures?: number;
};

class PollSubtitleJobTerminalError extends Error {}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, ms));
  });
}

export async function pollSubtitleJob(args: PollSubtitleJobArgs, options: PollSubtitleJobOptions = {}) {
  const {
    taskId,
    subtitleName,
    type,
    jobId,
    requestKey,
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    failureMessage,
  } = args;
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxNetworkFailures = DEFAULT_MAX_NETWORK_FAILURES,
  } = options;

  const startedAt = Date.now();
  let networkFailureCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);

    try {
      const pollResp = await fetchWithTimeout(
        `/api/video-task/generate-subtitle-voice?taskId=${encodeURIComponent(taskId)}&subtitleName=${encodeURIComponent(subtitleName)}&type=${encodeURIComponent(type)}&jobId=${encodeURIComponent(jobId)}${requestKey ? `&requestKey=${encodeURIComponent(requestKey)}` : ''}`,
        {
          timeoutMs: requestTimeoutMs,
        }
      );
      const pollBack = await pollResp.json().catch(() => null);

      if (pollBack?.code === 0) {
        const data = pollBack?.data;
        if (type === 'translate_srt' && data?.path_name) return data;
        if (type === 'gen_srt' && data?.text_translated) return data;
        networkFailureCount = 0;
        continue;
      }

      if (pollBack?.code != null) {
        throw new PollSubtitleJobTerminalError(pollBack?.message || failureMessage);
      }

      throw new Error('subtitle job poll malformed response');
    } catch (error) {
      if (error instanceof PollSubtitleJobTerminalError) {
        throw error;
      }

      networkFailureCount += 1;
      if (networkFailureCount >= maxNetworkFailures) {
        break;
      }
    }
  }

  throw new Error(failureMessage);
}
