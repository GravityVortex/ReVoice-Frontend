import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindVtFileTaskByTaskIdAndR2Key, mockGetPreSignedUrl, mockGetSystemConfigByKey } =
  vi.hoisted(() => ({
    mockFindVtFileTaskByTaskIdAndR2Key: vi.fn(),
  mockGetPreSignedUrl: vi.fn(),
    mockGetSystemConfigByKey: vi.fn(),
  }));

vi.mock('@/shared/models/vt_file_task', () => ({
  findVtFileTaskByTaskIdAndR2Key: mockFindVtFileTaskByTaskIdAndR2Key,
}));

vi.mock('@/shared/cache/system-config', () => ({
  getSystemConfigByKey: mockGetSystemConfigByKey,
}));

vi.mock('@/shared/services/javaService', () => ({
  getPreSignedUrl: mockGetPreSignedUrl,
}));

import { checkReferenceAudioExists } from './reference-audio-exists';

function expectProbeFetchCalledWith(url: string) {
  expect(fetch).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: expect.any(AbortSignal),
    })
  );
}

describe('checkReferenceAudioExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockGetSystemConfigByKey.mockImplementation(async (key: string) => {
      if (key === 'r2.public.base_url') return 'https://pub.example.com';
      if (key === 'r2.bucket.public') return 'zhesheng-public';
      return '';
    });
  });

  it('probes public bucket object via public url GET range', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/ref-id.wav',
      r2Bucket: 'zhesheng-public',
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 206 }));

    const result = await checkReferenceAudioExists({
      taskId: 'task_1',
      userId: 'u1',
      referenceSubtitleName: 'ref-id',
    });

    expect(result).toEqual(
      expect.objectContaining({
        exists: true,
        path: 'u1/task_1/split_audio/audio/ref-id.wav',
        status: 206,
        storage: 'public_url',
        url: 'https://pub.example.com/dev/u1/task_1/split_audio/audio/ref-id.wav',
      })
    );
    expect(mockFindVtFileTaskByTaskIdAndR2Key).toHaveBeenCalledWith(
      'task_1',
      'split_audio/audio/ref-id.wav'
    );
    expect(mockGetPreSignedUrl).not.toHaveBeenCalled();
    expectProbeFetchCalledWith('https://pub.example.com/dev/u1/task_1/split_audio/audio/ref-id.wav');
  });

  it('returns explicit db_record_missing when task file row is absent', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue(null);

    const result = await checkReferenceAudioExists({
      taskId: 'task_1',
      userId: 'u1',
      referenceSubtitleName: 'ref-id',
    });

    expect(result).toEqual(
      expect.objectContaining({
        exists: false,
        reason: 'db_record_missing',
        path: 'u1/task_1/split_audio/audio/ref-id.wav',
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to presigned GET range for non-public buckets', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/ref-id.wav',
      r2Bucket: 'zhesheng',
    });
    mockGetPreSignedUrl.mockResolvedValue([{ url: 'https://example.com/ref.wav' }]);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const result = await checkReferenceAudioExists({
      taskId: 'task_1',
      userId: 'u1',
      referenceSubtitleName: 'ref-id',
    });

    expect(result).toEqual(
      expect.objectContaining({
        exists: true,
        status: 200,
        path: 'u1/task_1/split_audio/audio/ref-id.wav',
        storage: 'presigned_url',
        url: 'https://example.com/ref.wav',
      })
    );
    expect(mockGetPreSignedUrl).toHaveBeenCalledWith(
      [
        {
          path: 'u1/task_1/split_audio/audio/ref-id.wav',
          operation: 'download',
          expirationMinutes: 5,
        },
      ],
      { forceRefresh: true }
    );
    expectProbeFetchCalledWith('https://example.com/ref.wav');
  });

  it('returns object_missing when db row exists but object probe returns 404', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/ref-id.wav',
      r2Bucket: 'zhesheng-public',
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const result = await checkReferenceAudioExists({
      taskId: 'task_1',
      userId: 'u1',
      referenceSubtitleName: 'ref-id',
    });

    expect(result).toEqual(
      expect.objectContaining({
        exists: false,
        reason: 'object_missing',
        status: 404,
        path: 'u1/task_1/split_audio/audio/ref-id.wav',
        storage: 'public_url',
      })
    );
  });
});
