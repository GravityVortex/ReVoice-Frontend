import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSystemConfigByKey = vi.fn();
const getUserInfo = vi.fn();
const findVtTaskMainById = vi.fn();
const findVtTaskSubtitleByTaskIdAndStepName = vi.fn();
const updateVtTaskSubtitle = vi.fn();
const javaR2CoverWriteFile = vi.fn();

vi.mock('@/shared/cache/system-config', () => ({
  getSystemConfigByKey,
}));

vi.mock('@/shared/models/user', () => ({
  getUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById,
}));

vi.mock('@/shared/models/vt_task_subtitle', () => ({
  findVtTaskSubtitleByTaskIdAndStepName,
  updateVtTaskSubtitle,
}));

vi.mock('@/shared/services/javaService', () => ({
  javaR2CoverWriteFile,
}));

describe('POST /api/video-task/update-subtitle-timings', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getUserInfo.mockResolvedValue({ id: 'user-1' });
    findVtTaskMainById.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    findVtTaskSubtitleByTaskIdAndStepName.mockResolvedValue({
      id: 'subtitle-row-1',
      subtitleData: [
        {
          id: '00010001_00-00-00-000_00-00-02-000',
          start: '00:00:00,000',
          end: '00:00:02,000',
          txt: 'draft child',
          audio_url: '',
          vap_draft_audio_path: 'adj_audio_time_temp/00010001_00-00-00-000_00-00-02-000.wav',
        },
      ],
    });
    getSystemConfigByKey.mockResolvedValue('public-bucket');
    updateVtTaskSubtitle.mockResolvedValue({});
    javaR2CoverWriteFile.mockResolvedValue({ code: 200 });
  });

  it('renames draft-only rows without trying to copy a missing persisted adj_audio_time file', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/video-task/update-subtitle-timings', {
        method: 'POST',
        body: JSON.stringify({
          taskId: 'task-1',
          stepName: 'translate_srt',
          items: [
            {
              id: '00010001_00-00-00-000_00-00-02-000',
              startMs: 100,
              endMs: 1900,
            },
          ],
        }),
      })
    );

    const json = await response.json();

    expect(json.code).toBe(0);
    expect(javaR2CoverWriteFile).not.toHaveBeenCalled();
    expect(updateVtTaskSubtitle).toHaveBeenCalledTimes(1);
    expect(updateVtTaskSubtitle.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        subtitleData: [
          expect.objectContaining({
            id: '00010001_00-00-00-100_00-00-01-900',
            start: '00:00:00,100',
            end: '00:00:01,900',
            audio_url: '',
          }),
        ],
      })
    );
    expect(json.data).toEqual(
      expect.objectContaining({
        updated: 1,
        renamed: 1,
        idMap: {
          '00010001_00-00-00-000_00-00-02-000': '00010001_00-00-00-100_00-00-01-900',
        },
      })
    );
  });
});
