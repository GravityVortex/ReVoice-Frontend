import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConsumeCredits = vi.fn();
const mockFindCreditByTransactionNo = vi.fn();
const mockRefundCredits = vi.fn();
const mockGetSystemConfigByKey = vi.fn();
const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockFindVtTaskSubtitleByTaskIdAndStepName = vi.fn();
const mockPatchSubtitleItemById = vi.fn();
const mockFindVtFileTaskByTaskIdAndR2Key = vi.fn();
const mockJavaR2CoverWriteFile = vi.fn();
const mockJavaSubtitleSingleTranslate = vi.fn();
const mockGetPreSignedUrl = vi.fn();
const mockHasPermission = vi.fn();
const mockPyConvertTxtGenerateVoice = vi.fn();
const mockPyConvertTxtGenerateVoiceJobStatus = vi.fn();
const mockPyOriginalTxtTranslateJobStatus = vi.fn();

let warnSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;

vi.mock('@/shared/models/credit', () => ({
  consumeCredits: mockConsumeCredits,
  findCreditByTransactionNo: mockFindCreditByTransactionNo,
  refundCredits: mockRefundCredits,
}));

vi.mock('@/shared/cache/system-config', () => ({
  getSystemConfigByKey: mockGetSystemConfigByKey,
}));

vi.mock('@/shared/models/user', () => ({
  getUserInfo: mockGetUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById: mockFindVtTaskMainById,
}));

vi.mock('@/shared/models/vt_task_subtitle', () => ({
  findVtTaskSubtitleByTaskIdAndStepName: mockFindVtTaskSubtitleByTaskIdAndStepName,
  patchSubtitleItemById: mockPatchSubtitleItemById,
}));

vi.mock('@/shared/models/vt_file_task', () => ({
  findVtFileTaskByTaskIdAndR2Key: mockFindVtFileTaskByTaskIdAndR2Key,
}));

vi.mock('@/shared/services/javaService', () => ({
  javaR2CoverWriteFile: mockJavaR2CoverWriteFile,
  javaSubtitleSingleTranslate: mockJavaSubtitleSingleTranslate,
  getPreSignedUrl: mockGetPreSignedUrl,
}));

vi.mock('@/shared/services/rbac', () => ({
  hasPermission: mockHasPermission,
}));

vi.mock('@/shared/services/pythonService', () => ({
  pyConvertTxtGenerateVoice: mockPyConvertTxtGenerateVoice,
  pyConvertTxtGenerateVoiceJobStatus: mockPyConvertTxtGenerateVoiceJobStatus,
  pyOriginalTxtTranslateJobStatus: mockPyOriginalTxtTranslateJobStatus,
}));

async function call(body: any) {
  const { POST } = await import('@/app/api/video-task/generate-subtitle-voice/route');
  const req = new Request('http://localhost/api/video-task/generate-subtitle-voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as any);
  const json = await res.json();
  return { res, json };
}

async function callGet(search: Record<string, string>) {
  const { GET } = await import('@/app/api/video-task/generate-subtitle-voice/route');
  const params = new URLSearchParams(search);
  const req = new Request(`http://localhost/api/video-task/generate-subtitle-voice?${params.toString()}`, {
    method: 'GET',
  });
  const res = await GET(req as any);
  const json = await res.json();
  return { res, json };
}

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

describe('/api/video-task/generate-subtitle-voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    mockConsumeCredits.mockResolvedValue({ id: 'credit_1' });
    mockFindCreditByTransactionNo.mockResolvedValue(null);
    mockRefundCredits.mockResolvedValue(undefined);
    mockGetSystemConfigByKey.mockImplementation(async (key: string) => {
      if (key === 'r2.public.base_url') return 'https://pub.example.com';
      if (key === 'r2.bucket.public') return 'zhesheng-public';
      return '';
    });
    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'u1' });
    mockHasPermission.mockResolvedValue(false);
    mockPatchSubtitleItemById.mockResolvedValue(undefined);
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/0003_00-00-08-794_00-00-14-475.wav',
      r2Bucket: 'zhesheng-public',
    });
    mockJavaR2CoverWriteFile.mockResolvedValue({ code: 200 });
    mockJavaSubtitleSingleTranslate.mockResolvedValue({ textTranslated: 'unused' });
    mockGetPreSignedUrl.mockResolvedValue([{ url: 'https://example.com/reference.wav' }]);
    mockPyConvertTxtGenerateVoice.mockResolvedValue({
      code: 200,
      data: {
        path_name: 'adj_audio_time_temp/00030001_00-00-10-074_00-00-14-475.wav',
        duration: 4.401,
      },
    });
    mockPyConvertTxtGenerateVoiceJobStatus.mockResolvedValue({ code: 200, modal_status: 'SUCCESS', data: {} });
    mockPyOriginalTxtTranslateJobStatus.mockResolvedValue({ code: 200, modal_status: 'SUCCESS', data: {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 206 })));

    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030001_00-00-10-074_00-00-14-475',
              txt: 'split child text',
              vap_split_parent_id: 'translate-parent',
              vap_tts_reference_subtitle_id: '0003_00-00-08-794_00-00-14-475',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030001_00-00-10-074_00-00-14-475',
              txt: 'split child source text',
              vap_source_split_parent_id: '0003_00-00-08-794_00-00-14-475',
            },
          ],
        };
      }
      return null;
    });
  });

  it('uses canonical tts reference id and skips split reference copy compatibility logic', async () => {
    const { json } = await call({
      type: 'translate_srt',
      text: '新的子字幕译文',
      preText: '',
      subtitleName: '00030001_00-00-10-074_00-00-14-475',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(0);
    expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
    expect(mockFindVtFileTaskByTaskIdAndR2Key).toHaveBeenCalledWith(
      'task_1',
      'split_audio/audio/0003_00-00-08-794_00-00-14-475.wav'
    );
    expect(mockGetPreSignedUrl).not.toHaveBeenCalled();
    expectProbeFetchCalledWith('https://pub.example.com/dev/u1/task_1/split_audio/audio/0003_00-00-08-794_00-00-14-475.wav');
    expect(mockPyConvertTxtGenerateVoice).toHaveBeenCalledWith(
      'task_1',
      '新的子字幕译文',
      '00030001_00-00-10-074_00-00-14-475',
      { referenceSubtitleName: '0003_00-00-08-794_00-00-14-475' }
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[generate-subtitle-voice] reference subtitle resolved',
      expect.objectContaining({
        taskId: 'task_1',
        subtitleName: '00030001_00-00-10-074_00-00-14-475',
        referenceSubtitleName: '0003_00-00-08-794_00-00-14-475',
      })
    );
    expect(mockPatchSubtitleItemById.mock.calls.some((call) => call[3]?.vap_tts_reference_subtitle_id)).toBe(false);
    expect(mockPatchSubtitleItemById).toHaveBeenCalledWith(
      'task_1',
      'translate_srt',
      '00030001_00-00-10-074_00-00-14-475',
      expect.objectContaining({
        vap_draft_audio_path: 'adj_audio_time_temp/00030001_00-00-10-074_00-00-14-475.wav',
        vap_draft_txt: '新的子字幕译文',
      })
    );
  });

  it('persists gen_srt success as voice-regeneration-required state and clears stale tts markers', async () => {
    mockJavaSubtitleSingleTranslate.mockResolvedValueOnce({ textTranslated: '新的译文结果' });

    const { json } = await call({
      type: 'gen_srt',
      text: 'updated source text',
      preText: '',
      subtitleName: '00030001_00-00-10-074_00-00-14-475',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(0);
    expect(mockPatchSubtitleItemById).toHaveBeenCalledWith(
      'task_1',
      'translate_srt',
      '00030001_00-00-10-074_00-00-14-475',
      expect.objectContaining({
        vap_draft_txt: '新的译文结果',
        vap_draft_audio_path: null,
        vap_voice_status: 'missing',
        vap_needs_tts: true,
        vap_tts_job_id: null,
        vap_tts_request_key: null,
      })
    );
  });

  it('persists resumed gen_srt job success as voice-regeneration-required state after refresh recovery', async () => {
    mockPyOriginalTxtTranslateJobStatus.mockResolvedValueOnce({
      code: 200,
      modal_status: 'SUCCESS',
      data: {
        text_translated: '恢复后的译文',
      },
    });

    const { json } = await callGet({
      taskId: 'task_1',
      subtitleName: '00030001_00-00-10-074_00-00-14-475',
      type: 'gen_srt',
      jobId: 'job-gen-1',
      requestKey: 'req-gen-1',
    });

    expect(json.code).toBe(0);
    expect(mockPatchSubtitleItemById).toHaveBeenCalledWith(
      'task_1',
      'translate_srt',
      '00030001_00-00-10-074_00-00-14-475',
      expect.objectContaining({
        vap_draft_txt: '恢复后的译文',
        vap_draft_audio_path: null,
        vap_voice_status: 'missing',
        vap_needs_tts: true,
        vap_tts_job_id: null,
        vap_tts_request_key: null,
      })
    );
  });

  it('lazily backfills canonical tts reference from source lineage for legacy split rows', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/source-parent.wav',
      r2Bucket: 'zhesheng-public',
    });
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child text',
              vap_split_parent_id: 'translate-parent',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child source text',
              vap_source_split_parent_id: 'source-parent',
            },
          ],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(0);
    expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
    expectProbeFetchCalledWith('https://pub.example.com/dev/u1/task_1/split_audio/audio/source-parent.wav');
    expect(mockPyConvertTxtGenerateVoice).toHaveBeenCalledWith(
      'task_1',
      '右半段子字幕译文',
      '00030002_00-00-14-601_00-00-15-780',
      { referenceSubtitleName: 'source-parent' }
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[generate-subtitle-voice] reference subtitle resolved',
      expect.objectContaining({
        taskId: 'task_1',
        subtitleName: '00030002_00-00-14-601_00-00-15-780',
        referenceSubtitleName: 'source-parent',
        strategy: 'source_parent',
        needsBackfill: true,
      })
    );
    expect(mockPatchSubtitleItemById).toHaveBeenCalledWith(
      'task_1',
      'translate_srt',
      '00030002_00-00-14-601_00-00-15-780',
      expect.objectContaining({
        vap_tts_reference_subtitle_id: 'source-parent',
      })
    );
  });

  it('warns on translate/source lineage mismatch and still uses source lineage', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/source-parent.wav',
      r2Bucket: 'zhesheng-public',
    });
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child text',
              vap_split_parent_id: 'translate-parent',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child source text',
              vap_source_split_parent_id: 'source-parent',
            },
          ],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(0);
    expectProbeFetchCalledWith('https://pub.example.com/dev/u1/task_1/split_audio/audio/source-parent.wav');
    expect(mockPyConvertTxtGenerateVoice).toHaveBeenCalledWith(
      'task_1',
      '右半段子字幕译文',
      '00030002_00-00-14-601_00-00-15-780',
      { referenceSubtitleName: 'source-parent' }
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[generate-subtitle-voice] reference subtitle lineage mismatch',
      expect.objectContaining({
        taskId: 'task_1',
        subtitleName: '00030002_00-00-14-601_00-00-15-780',
        translateParentId: 'translate-parent',
        sourceParentId: 'source-parent',
      })
    );
  });

  it('returns explicit error when split reference cannot be resolved', async () => {
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('切割参考音频定位失败');
    expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
    expect(mockPyConvertTxtGenerateVoice).not.toHaveBeenCalled();
  });

  it('fails before python tts when split reference audio is missing', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockResolvedValue({
      taskId: 'task_1',
      userId: 'u1',
      stepName: 'split_audio',
      r2Key: 'split_audio/audio/0003_00-00-08-794_00-00-14-475.wav',
      r2Bucket: 'zhesheng-public',
    });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const { json } = await call({
      type: 'translate_srt',
      text: '新的子字幕译文',
      preText: '',
      subtitleName: '00030001_00-00-10-074_00-00-14-475',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('参考音频不存在');
    expect(json.message).toContain('split_audio/audio/0003_00-00-08-794_00-00-14-475.wav');
    expect(mockPyConvertTxtGenerateVoice).not.toHaveBeenCalled();
  });

  it('repairs missing split reference from adjusted audio before invoking python tts', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockImplementation(async (_taskId: string, r2Key: string) => {
      if (r2Key === 'split_audio/audio/source-parent.wav') {
        return {
          taskId: 'task_1',
          userId: 'u1',
          stepName: 'split_audio',
          r2Key,
          r2Bucket: 'zhesheng-public',
        };
      }
      if (r2Key === 'adj_audio_time/source-parent.wav') {
        return {
          taskId: 'task_1',
          userId: 'u1',
          stepName: 'adj_audio_time',
          r2Key,
          r2Bucket: 'zhesheng-public',
        };
      }
      return null;
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }));
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child text',
              vap_split_parent_id: 'translate-parent',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child source text',
              vap_source_split_parent_id: 'source-parent',
            },
          ],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(0);
    expect(mockJavaR2CoverWriteFile).toHaveBeenCalledWith(
      'u1/task_1/adj_audio_time/source-parent.wav',
      'u1/task_1/split_audio/audio/source-parent.wav',
      'zhesheng-public'
    );
    expect(mockPyConvertTxtGenerateVoice).toHaveBeenCalledWith(
      'task_1',
      '右半段子字幕译文',
      '00030002_00-00-14-601_00-00-15-780',
      { referenceSubtitleName: 'source-parent' }
    );
  });

  it('fails when split reference and adjusted fallback are both missing', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockImplementation(async (_taskId: string, r2Key: string) => {
      if (r2Key === 'split_audio/audio/source-parent.wav') {
        return {
          taskId: 'task_1',
          userId: 'u1',
          stepName: 'split_audio',
          r2Key,
          r2Bucket: 'zhesheng-public',
        };
      }
      return null;
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child text',
              vap_split_parent_id: 'translate-parent',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child source text',
              vap_source_split_parent_id: 'source-parent',
            },
          ],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('参考音频不存在');
    expect(json.message).toContain('split_audio/audio/source-parent.wav');
    expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
    expect(mockPyConvertTxtGenerateVoice).not.toHaveBeenCalled();
  });

  it('fails when split reference backfill cannot make the object visible', async () => {
    mockFindVtFileTaskByTaskIdAndR2Key.mockImplementation(async (_taskId: string, r2Key: string) => {
      if (r2Key === 'split_audio/audio/source-parent.wav') {
        return {
          taskId: 'task_1',
          userId: 'u1',
          stepName: 'split_audio',
          r2Key,
          r2Bucket: 'zhesheng-public',
        };
      }
      if (r2Key === 'adj_audio_time/source-parent.wav') {
        return {
          taskId: 'task_1',
          userId: 'u1',
          stepName: 'adj_audio_time',
          r2Key,
          r2Bucket: 'zhesheng-public',
        };
      }
      return null;
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'sub_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child text',
              vap_split_parent_id: 'translate-parent',
              vap_voice_status: 'missing',
              vap_needs_tts: true,
            },
          ],
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'sub_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: [
            {
              id: '00030002_00-00-14-601_00-00-15-780',
              txt: 'right child source text',
              vap_source_split_parent_id: 'source-parent',
            },
          ],
        };
      }
      return null;
    });

    const { json } = await call({
      type: 'translate_srt',
      text: '右半段子字幕译文',
      preText: '',
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      taskId: 'task_1',
      languageTarget: 'zh',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('参考音频不存在');
    expect(mockJavaR2CoverWriteFile).toHaveBeenCalledWith(
      'u1/task_1/adj_audio_time/source-parent.wav',
      'u1/task_1/split_audio/audio/source-parent.wav',
      'zhesheng-public'
    );
    expect(mockPyConvertTxtGenerateVoice).not.toHaveBeenCalled();
  });
});
