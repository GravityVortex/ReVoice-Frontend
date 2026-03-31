import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveReference = {
  status: 'resolved',
  referenceSubtitleName: '0001_00-00-00-000_00-00-04-000',
  diagnostics: {},
  strategy: 'direct',
  needsBackfill: false,
};

vi.mock('@/shared/lib/reference-audio-exists', () => ({
  checkReferenceAudioExists: vi.fn(async () => ({ exists: true })),
}));
vi.mock('@/shared/lib/reference-audio-repair', () => ({
  repairReferenceAudio: vi.fn(async () => ({ status: 'already_exists' })),
}));
vi.mock('@/shared/lib/subtitle-reference-audio', () => ({
  resolveTranslatedTtsReference: vi.fn(() => mockResolveReference),
}));
vi.mock('@/shared/models/credit', () => ({
  consumeCredits: vi.fn(async () => ({ id: 'credit-1' })),
  findCreditByTransactionNo: vi.fn(),
  refundCredits: vi.fn(async () => undefined),
}));
vi.mock('@/shared/models/user', () => ({
  getUserInfo: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('@/shared/models/vt_task_subtitle', () => ({
  findVtTaskSubtitleByTaskIdAndStepName: vi.fn(async () => ({ userId: 'user-1', subtitleData: [] })),
  patchSubtitleItemById: vi.fn(async () => undefined),
}));
vi.mock('@/shared/services/javaService', () => ({
  javaSubtitleSingleTranslate: vi.fn(async () => ({ textTranslated: 'translated' })),
}));
vi.mock('@/shared/services/rbac', () => ({
  hasPermission: vi.fn(async () => true),
}));

describe('generate-subtitle-voice route platform errors', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 503 structured response when pyConvert throws StructuredFetchError', async () => {
    const { StructuredFetchError } = await import('@/shared/services/pythonService');
    const structuredError = new StructuredFetchError(
      'platform busy',
      503,
      'Service Unavailable',
      {
        errorCode: 'PLATFORM_FULL',
        traceId: 'trace-1',
        retryAfterS: 30,
        upstreamStatus: 'FAILURE',
        platform: 'modal',
      }
    );

    const pythonService = await import('@/shared/services/pythonService');
    vi.spyOn(pythonService, 'pyConvertTxtGenerateVoice').mockRejectedValue(structuredError);

    const { POST } = await import('@/app/api/video-task/generate-subtitle-voice/route');

    const response = await POST(
      new NextRequest('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'translate_srt',
          text: '你好',
          subtitleName: '0001_00-00-00-000_00-00-04-000',
          taskId: 'task-1',
          languageTarget: 'zh',
        }),
      }) as NextRequest
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe(-1);
    expect(body.message).toBe('TTS 平台暂不可用，请稍后重试');
    expect(body.data).toMatchObject({
      errorCode: 'PLATFORM_FULL',
      traceId: 'trace-1',
      retryAfterS: 30,
      upstreamStatus: 'FAILURE',
      platform: 'modal',
      reason: 'platform busy',
    });
  });
});
