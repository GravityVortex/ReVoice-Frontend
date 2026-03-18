import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockFindVtTaskSubtitleByTaskIdAndStepName = vi.fn();
const mockReplaceSubtitleDataAndLogTx = vi.fn();
const mockSplitAudioFile = vi.fn();
const mockJavaR2CoverWriteFile = vi.fn();
const mockJavaR2MoveFile = vi.fn();
const mockPyMergeVideoJobStart = vi.fn();
const mockPyConvertTxtGenerateVoice = vi.fn();

vi.mock('@/shared/models/user', () => ({
  getUserInfo: mockGetUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById: mockFindVtTaskMainById,
}));

vi.mock('@/shared/models/vt_task_subtitle', () => ({
  findVtTaskSubtitleByTaskIdAndStepName: mockFindVtTaskSubtitleByTaskIdAndStepName,
}));

vi.mock('@/shared/models/vt_edit_operation', () => ({
  replaceSubtitleDataAndLogTx: mockReplaceSubtitleDataAndLogTx,
}));

vi.mock('@/shared/lib/timeline/split-audio', () => ({
  splitAudioFile: mockSplitAudioFile,
}));

vi.mock('@/shared/services/javaService', () => ({
  javaR2CoverWriteFile: mockJavaR2CoverWriteFile,
  javaR2MoveFile: mockJavaR2MoveFile,
}));

vi.mock('@/shared/services/pythonService', () => ({
  pyMergeVideoJobStart: mockPyMergeVideoJobStart,
  pyConvertTxtGenerateVoice: mockPyConvertTxtGenerateVoice,
}));

async function call(body: any) {
  const { POST } = await import('@/app/api/video-task/split-subtitle/route');
  const req = new Request('http://localhost/api/video-task/split-subtitle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { res, json };
}

function makeSubtitleRows() {
  const translate = [
    {
      id: '0001_00-00-00-000_00-00-04-000',
      seq: '1',
      start: '00:00:00,000',
      end: '00:00:04,000',
      txt: 'hello world',
      audio_url: 'adj_audio_time/0001_00-00-00-000_00-00-04-000.wav',
      audio_rev_ms: 1700000000000,
      vap_draft_txt: 'hello world',
      vap_draft_audio_path: 'adj_audio_time_temp/0001.wav',
      vap_tts_job_id: null,
      vap_tr_job_id: null,
    },
    {
      id: '0002_00-00-04-000_00-00-08-000',
      seq: '2',
      start: '00:00:04,000',
      end: '00:00:08,000',
      txt: 'second line',
      audio_url: 'adj_audio_time/0002_00-00-04-000_00-00-08-000.wav',
      audio_rev_ms: 1700000001000,
    },
  ];

  const source = [
    {
      id: '0001_00-00-00-000_00-00-04-000',
      seq: '1',
      start: '00:00:00,000',
      end: '00:00:04,000',
      txt: 'hello world',
      audio_url: '',
    },
    {
      id: '0002_00-00-04-000_00-00-08-000',
      seq: '2',
      start: '00:00:04,000',
      end: '00:00:08,000',
      txt: 'second line',
      audio_url: '',
    },
  ];

  return { translate, source };
}

describe('/api/video-task/split-subtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtTaskMainById.mockResolvedValue({
      id: 'task_1',
      userId: 'u1',
    });

    const { translate, source } = makeSubtitleRows();
    mockFindVtTaskSubtitleByTaskIdAndStepName.mockImplementation(async (_taskId: string, stepName: string) => {
      if (stepName === 'translate_srt') {
        return {
          id: 'subtitle_translate_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: translate,
        };
      }
      if (stepName === 'gen_srt') {
        return {
          id: 'subtitle_source_1',
          taskId: 'task_1',
          userId: 'u1',
          stepName,
          subtitleData: source,
        };
      }
      return null;
    });

    mockReplaceSubtitleDataAndLogTx.mockResolvedValue({});
    // Audio split returns null by default (graceful degradation)
    mockSplitAudioFile.mockResolvedValue(null);
  });

  it('rejects when not authenticated', async () => {
    mockGetUserInfo.mockResolvedValue(null);

    const { json } = await call({
      taskId: 'task_1',
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'hello world',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('no auth');
  });

  it('rejects missing required fields', async () => {
    const { json } = await call({ taskId: 'task_1' });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('missing');
  });

  it('rejects when clip does not exist', async () => {
    const { json } = await call({
      taskId: 'task_1',
      clipId: '9999_00-00-10-000_00-00-12-000',
      splitAtMs: 11000,
      effectiveConvertText: 'ghost line',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('clip');
  });

  it('rejects when split point is too close to the boundary', async () => {
    const { json } = await call({
      taskId: 'task_1',
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 100,
      effectiveConvertText: 'hello world',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('boundary');
  });

  it('splits translate/gen subtitle arrays in sync and returns splitOperationId', async () => {
    const { json } = await call({
      taskId: 'task_1',
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'hello world',
    });

    expect(json.code).toBe(0);
    expect(json.data.splitOperationId).toEqual(expect.any(String));
    expect(json.data.newIds.leftTranslateId).toEqual(expect.any(String));
    expect(json.data.newIds.rightTranslateId).toEqual(expect.any(String));
    expect(json.data.newIds.leftSourceId).toEqual(expect.any(String));
    expect(json.data.newIds.rightSourceId).toEqual(expect.any(String));

    expect(json.data.translate).toHaveLength(3);
    expect(json.data.source).toHaveLength(3);

    expect(json.data.translate[0].txt).toBe('hello world');
    expect(json.data.translate[1].txt).toBe('hello world');
    expect(json.data.translate[0].audio_url).toBe('');
    expect(json.data.translate[1].audio_url).toBe('');
    expect(json.data.translate[0].vap_needs_tts).toBe(true);
    expect(json.data.translate[1].vap_needs_tts).toBe(true);
    expect(json.data.translate[0].vap_voice_status).toBe('missing');
    expect(json.data.translate[1].vap_voice_status).toBe('missing');
    expect(json.data.translate[0].vap_tts_reference_subtitle_id).toBe('0001_00-00-00-000_00-00-04-000');
    expect(json.data.translate[1].vap_tts_reference_subtitle_id).toBe('0001_00-00-00-000_00-00-04-000');

    expect(json.data.source[0].vap_source_mode).toBe('fallback_vocal');
    expect(json.data.source[1].vap_source_mode).toBe('fallback_vocal');
    expect(json.data.source[0].vap_source_segment_missing).toBe(true);
    expect(json.data.source[1].vap_source_segment_missing).toBe(true);

    expect(json.data.translate.map((row: any) => row.seq)).toEqual(['1', '2', '3']);
    expect(json.data.source.map((row: any) => row.seq)).toEqual(['1', '2', '3']);
  });

  it('does not trigger any external python or VAP side effects', async () => {
    await call({
      taskId: 'task_1',
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'hello world',
    });

    expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
    expect(mockJavaR2MoveFile).not.toHaveBeenCalled();
    expect(mockPyMergeVideoJobStart).not.toHaveBeenCalled();
    expect(mockPyConvertTxtGenerateVoice).not.toHaveBeenCalled();
  });
});
