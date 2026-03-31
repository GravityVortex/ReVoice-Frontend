import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildPythonAuthHeaders = vi.fn();

vi.mock('@/shared/cache/system-config', () => ({
  PYTHON_SERVER_BASE_URL: 'https://legacy-python.example.com',
}));

vi.mock('@/shared/services/pythonAuth', () => ({
  buildPythonAuthHeaders: mockBuildPythonAuthHeaders,
}));

describe('pyConvertTxtGenerateVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBuildPythonAuthHeaders.mockReturnValue({ Authorization: 'Bearer test-token' });
    process.env.TTS_SERVER_BASE_URL = 'https://tts.example.com';
  });

  afterEach(() => {
    delete process.env.TTS_SERVER_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('includes reference_subtitle_name when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { path_name: 'adj_audio_time_temp/out.wav', duration: 1.23 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { pyConvertTxtGenerateVoice } = await import('./pythonService');
    await pyConvertTxtGenerateVoice('task_1', '新的译文', '00030001_00-00-10-074_00-00-14-475', {
      referenceSubtitleName: '0003_00-00-10-074_00-00-18-876',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tts.example.com/api/internal/subtitles/translated/tts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: '新的译文',
          subtitle_name: '00030001_00-00-10-074_00-00-14-475',
          task_id: 'task_1',
          reference_subtitle_name: '0003_00-00-10-074_00-00-18-876',
        }),
      })
    );
  });
});

describe('fetchJsonWithStructuredError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBuildPythonAuthHeaders.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws StructuredFetchError with normalized data on 503 JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        code: -1,
        message: 'platform busy',
        error_code: 'PLATFORM_BUSY',
        trace_id: 'trace-123',
        retry_after_s: 40,
        modal_status: 'FAILURE',
        platform: 'modal',
      }),
      text: async () => 'platform busy',
      clone: function () {
        return this;
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchJsonWithStructuredError, StructuredFetchError } = await import('./pythonService');

    await expect(fetchJsonWithStructuredError('https://tts.example.com', { method: 'GET' })).rejects.toEqual(
      expect.objectContaining({
        status: 503,
        statusText: 'Service Unavailable',
        data: expect.objectContaining({
          errorCode: 'PLATFORM_BUSY',
          traceId: 'trace-123',
          retryAfterS: 40,
          upstreamStatus: 'FAILURE',
          platform: 'modal',
          reason: 'platform busy',
        }),
      })
    );

    await expect(async () => {
      await fetchJsonWithStructuredError('https://tts.example.com', { method: 'GET' });
    }).rejects.toThrow(StructuredFetchError);
  });
});
