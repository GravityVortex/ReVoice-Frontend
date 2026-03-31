import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSystemConfigByKey = vi.fn();
const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockPatchSubtitleItemById = vi.fn();
const mockJavaR2CoverWriteFile = vi.fn();

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
  patchSubtitleItemById: mockPatchSubtitleItemById,
}));

vi.mock('@/shared/services/javaService', () => ({
  javaR2CoverWriteFile: mockJavaR2CoverWriteFile,
}));

async function call(body: any) {
  const { POST } = await import('@/app/api/video-task/update-subtitle-item/route');
  const req = new Request('http://localhost/api/video-task/update-subtitle-item', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { res, json };
}

describe('/api/video-task/update-subtitle-item by id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'u1' });
    mockGetSystemConfigByKey.mockResolvedValue('zhesheng-public');
    mockJavaR2CoverWriteFile.mockResolvedValue({ code: 200 });
    mockPatchSubtitleItemById.mockResolvedValue({});
  });

  it('rejects when not authenticated', async () => {
    mockGetUserInfo.mockResolvedValue(null);
    const { json } = await call({ taskId: 'task_1', type: 'translate_srt', id: 'sub_1', pathName: 'adj_audio_time_temp/a.wav', item: {} });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no auth');
  });

  it('requires id instead of seq', async () => {
    const { json } = await call({ taskId: 'task_1', type: 'translate_srt', seq: '1', pathName: 'adj_audio_time_temp/a.wav', item: {} });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('missing required parameters');
  });

  it('saves by id and preserves vap status fields', async () => {
    const item = {
      id: '00010002_00-00-02-000_00-00-04-000',
      txt: 'edited child text',
      vap_split_operation_id: 'split_op_1',
      vap_split_parent_id: '0001_00-00-00-000_00-00-04-000',
      vap_voice_status: 'missing',
      vap_needs_tts: true,
    };

    const { json } = await call({
      taskId: 'task_1',
      type: 'translate_srt',
      id: item.id,
      pathName: 'adj_audio_time_temp/00010002.wav',
      item,
    });

    expect(json.code).toBe(0);
    expect(mockJavaR2CoverWriteFile).toHaveBeenCalledWith(
      'u1/task_1/adj_audio_time_temp/00010002.wav',
      'u1/task_1/adj_audio_time/00010002_00-00-02-000_00-00-04-000.wav',
      'zhesheng-public'
    );
    expect(mockPatchSubtitleItemById).toHaveBeenCalledWith(
      'task_1',
      'translate_srt',
      '00010002_00-00-02-000_00-00-04-000',
      expect.objectContaining({
        txt: 'edited child text',
        vap_voice_status: 'ready',
        vap_needs_tts: false,
        audio_url: 'adj_audio_time/00010002_00-00-02-000_00-00-04-000.wav',
        vap_draft_audio_path: null,
        vap_draft_txt: null,
      })
    );
  });
});
