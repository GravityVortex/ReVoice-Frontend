import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockFindVtTaskSubtitleByTaskIdAndStepName = vi.fn();
const mockHasPermission = vi.fn();
const mockPyMergeVideoJobStart = vi.fn();
const mockPyMergeVideoJobStatus = vi.fn();
const mockUpdateVtTaskMain = vi.fn();

vi.mock('@/shared/models/user', () => ({ getUserInfo: mockGetUserInfo }));
vi.mock('@/shared/models/vt_task_main', () => ({ findVtTaskMainById: mockFindVtTaskMainById, updateVtTaskMain: mockUpdateVtTaskMain }));
vi.mock('@/shared/models/vt_task_subtitle', () => ({ findVtTaskSubtitleByTaskIdAndStepName: mockFindVtTaskSubtitleByTaskIdAndStepName }));
vi.mock('@/shared/services/rbac', () => ({ hasPermission: mockHasPermission }));
vi.mock('@/shared/services/pythonService', () => ({ pyMergeVideoJobStart: mockPyMergeVideoJobStart, pyMergeVideoJobStatus: mockPyMergeVideoJobStatus }));

async function call(taskId: string) {
  const { GET } = await import('@/app/api/video-task/generate-video/route');
  const res = await GET(new Request(`http://localhost/api/video-task/generate-video?taskId=${taskId}`) as any);
  const json = await res.json();
  return { res, json };
}

async function callStatus(taskId: string, jobId: string) {
  const { GET } = await import('@/app/api/video-task/generate-video/route');
  const res = await GET(
    new Request(`http://localhost/api/video-task/generate-video?taskId=${taskId}&jobId=${jobId}&mode=status`) as any
  );
  const json = await res.json();
  return { res, json };
}

async function callPost(taskId: string) {
  const { POST } = await import('@/app/api/video-task/generate-video/route');
  const res = await POST(
    new Request('http://localhost/api/video-task/generate-video', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }) as any
  );
  const json = await res.json();
  return { res, json };
}

function buildMergeRequestKey(taskId: string, subtitleData: Array<Record<string, unknown>>) {
  const inputDigest = createHash('sha256')
    .update(
      subtitleData
        .map((row) => `${row.id}\u0000${String(row.audio_rev_ms ?? 0)}\u0000${String(row.timing_rev_ms ?? 0)}\n`)
        .join('')
    )
    .digest('hex')
    .slice(0, 24);

  return createHash('sha256').update(['merge', taskId, inputDigest].join('\u0000')).digest('hex').slice(0, 24);
}

describe('/api/video-task/generate-video guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockHasPermission.mockResolvedValue(false);
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'u1', metadata: '{}' });
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockResolvedValue({
      id: 'sub_1',
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'translate_srt',
      subtitleData: [
        {
          id: '00010001_00-00-00-000_00-00-02-000',
          start: '00:00:00,000',
          end: '00:00:02,000',
          txt: 'split child',
          vap_needs_tts: true,
          vap_voice_status: 'missing',
        },
      ],
    });
  });

  it('rejects merge when split rows still need voice regeneration', async () => {
    const { json } = await call('task_1');
    expect(json.code).toBe(-1);
    expect(String(json.message)).toContain('voice');
    expect(mockPyMergeVideoJobStart).not.toHaveBeenCalled();
  });

  it('allows merge when backend status is stale missing but persisted audio is still available', async () => {
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockResolvedValue({
      id: 'sub_1',
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'translate_srt',
      subtitleData: [
        {
          id: 'clip-1',
          start: '00:00:00,000',
          end: '00:00:02,000',
          txt: 'stale split child',
          vap_needs_tts: false,
          vap_voice_status: 'missing',
          audio_url: 'adj_audio_time/clip-1.wav',
          audio_rev_ms: 10,
          timing_rev_ms: 20,
        },
      ],
    });
    mockPyMergeVideoJobStart.mockResolvedValue({ code: 200, job_id: 'job_1' });

    const { json } = await call('task_1');

    expect(json.code).toBe(0);
    expect(mockPyMergeVideoJobStart).toHaveBeenCalledTimes(1);
  });

  it('still returns merge job status when subtitles became dirty after the job already started', async () => {
    mockFindVtTaskMainById.mockResolvedValue({
      id: 'task_1',
      userId: 'u1',
      metadata: JSON.stringify({
        videoMerge: {
          active: {
            jobId: 'job_1',
            requestKey: 'req_1',
            inputDigest: 'digest_1',
            createdAtMs: 123,
          },
        },
      }),
    });
    mockPyMergeVideoJobStatus.mockResolvedValue({
      code: 200,
      modal_status: 'PENDING',
    });

    const { json } = await callStatus('task_1', 'job_1');

    expect(json.code).toBe(0);
    expect(json.data.status).toBe('pending');
    expect(mockPyMergeVideoJobStatus).toHaveBeenCalledWith('job_1');
  });

  it('starts a new merge job when the previous active job already failed for the same input', async () => {
    const subtitleData = [
      {
        id: 'clip-1',
        start: '00:00:00,000',
        end: '00:00:02,000',
        txt: 'ready clip',
        vap_needs_tts: false,
        vap_voice_status: 'ready',
        audio_url: 'adj_audio_time/clip-1.wav',
        audio_rev_ms: 10,
        timing_rev_ms: 20,
      },
    ];
    const requestKey = buildMergeRequestKey('task_1', subtitleData);

    mockFindVtTaskMainById.mockResolvedValue({
      id: 'task_1',
      userId: 'u1',
      metadata: JSON.stringify({
        videoMerge: {
          active: {
            jobId: 'job_failed',
            requestKey,
            inputDigest: 'digest_same',
            state: 'failed',
            createdAtMs: 123,
          },
        },
      }),
    });
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockResolvedValue({
      id: 'sub_1',
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'translate_srt',
      subtitleData,
    });
    mockPyMergeVideoJobStart.mockResolvedValue({ code: 200, job_id: 'job_retry_1' });

    const { json } = await callPost('task_1');

    expect(json.code).toBe(0);
    expect(json.data.jobId).toBe('job_retry_1');
    expect(mockPyMergeVideoJobStart).toHaveBeenCalledTimes(1);
  });
});
