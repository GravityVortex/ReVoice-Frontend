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
});
