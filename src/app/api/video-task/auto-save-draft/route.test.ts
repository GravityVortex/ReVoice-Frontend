import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserInfo = vi.fn();
const findVtTaskMainById = vi.fn();
const patchSubtitleDraftByIdIfNewer = vi.fn();

vi.mock('@/shared/models/user', () => ({
  getUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById,
}));

vi.mock('@/shared/models/vt_task_subtitle', () => ({
  patchSubtitleDraftByIdIfNewer,
}));

describe('POST /api/video-task/auto-save-draft', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getUserInfo.mockResolvedValue({ id: 'user-1' });
    findVtTaskMainById.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    patchSubtitleDraftByIdIfNewer.mockResolvedValue({ applied: true });
  });

  it('passes the client edit version to the guarded draft patch so stale saves cannot overwrite newer text', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/video-task/auto-save-draft', {
        method: 'POST',
        body: JSON.stringify({
          taskId: 'task-1',
          subtitleId: 'clip-1',
          draftTxt: 'latest draft',
          editedAtMs: 1710000000123,
        }),
      })
    );

    const json = await response.json();

    expect(json.code).toBe(0);
    expect(patchSubtitleDraftByIdIfNewer).toHaveBeenCalledWith(
      'task-1',
      'translate_srt',
      'clip-1',
      'latest draft',
      1710000000123
    );
  });
});
