import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveSplitTranslatedAudioPath, splitSubtitlePayload } from '@/shared/lib/timeline/split';

const getSystemConfigByKey = vi.fn();
const getUserInfo = vi.fn();
const findVtTaskMainById = vi.fn();
const patchSubtitleItemById = vi.fn();
const updateSingleSubtitleItemById = vi.fn();
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
  patchSubtitleItemById,
  updateSingleSubtitleItemById,
}));

vi.mock('@/shared/services/javaService', () => ({
  javaR2CoverWriteFile,
}));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function patchRowById(rows: any[], id: string, patch: Record<string, any>) {
  return rows.map((row) => (row?.id === id ? { ...row, ...patch } : row));
}

function replaceRowById(rows: any[], id: string, nextItem: Record<string, any>) {
  return rows.map((row) => (row?.id === id ? { ...nextItem } : row));
}

function srtToSeconds(str: string) {
  const parts = String(str || '').split(':');
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts;
  const [sec, ms] = (s || '0').split(/[.,]/);
  return (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Number(sec || 0) + (Number(ms || 0) / 1000);
}

function buildTrackSnapshot(rows: any[]) {
  return rows.map((entry) => {
    const draftPathRaw =
      typeof entry?.vap_draft_audio_path === 'string'
        ? String(entry.vap_draft_audio_path || '').trim()
        : '';
    const draftPath = draftPathRaw ? draftPathRaw.split('?')[0] : '';
    const pathName = resolveSplitTranslatedAudioPath({ ...entry, vap_draft_audio_path: draftPath });
    const updatedAtMsRaw = (entry as any)?.vap_tts_updated_at_ms;
    const updatedAtMs =
      typeof updatedAtMsRaw === 'number'
        ? updatedAtMsRaw
        : Number.parseInt(String(updatedAtMsRaw || ''), 10);
    const cacheBuster =
      Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? String(updatedAtMs) : '';
    const base = pathName
      ? `https://cdn.example.com/dev/user-1/task-1/${pathName}`
      : '';
    const audioUrl = !base
      ? ''
      : (cacheBuster
        ? `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(cacheBuster)}`
        : base);
    const draftTxt = typeof entry?.vap_draft_txt === 'string' ? String(entry.vap_draft_txt || '') : '';

    return {
      id: entry.id,
      text: draftTxt || entry.txt,
      audioUrl,
      startTime: srtToSeconds(entry.start),
      duration: Math.max(0, srtToSeconds(entry.end) - srtToSeconds(entry.start)),
    };
  });
}

describe('POST /api/video-task/update-subtitle-item', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getUserInfo.mockResolvedValue({ id: 'user-1' });
    findVtTaskMainById.mockResolvedValue({ id: 'task-1', userId: 'user-1' });
    getSystemConfigByKey.mockResolvedValue('public-bucket');
    javaR2CoverWriteFile.mockResolvedValue({ code: 200 });
    patchSubtitleItemById.mockResolvedValue({});
    updateSingleSubtitleItemById.mockResolvedValue({});
  });

  it('patches only promoted subtitle fields and clears draft metadata', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/video-task/update-subtitle-item', {
        method: 'POST',
        body: JSON.stringify({
          taskId: 'task-1',
          type: 'translate_srt',
          id: 'clip-1',
          pathName: 'adj_audio_time_temp/clip-1.wav?t=123',
          item: {
            id: 'clip-1',
            txt: 'final text',
            vap_draft_txt: 'stale draft text',
            vap_draft_audio_path: 'adj_audio_time_temp/stale.wav',
            vap_tts_updated_at_ms: 123456789,
          },
        }),
      })
    );

    const json = await response.json();

    expect(json.code).toBe(0);
    expect(javaR2CoverWriteFile).toHaveBeenCalledWith(
      'user-1/task-1/adj_audio_time_temp/clip-1.wav?t=123',
      'user-1/task-1/adj_audio_time/clip-1.wav',
      'public-bucket'
    );
    expect(patchSubtitleItemById).toHaveBeenCalledTimes(1);
    expect(patchSubtitleItemById).toHaveBeenCalledWith(
      'task-1',
      'translate_srt',
      'clip-1',
      expect.objectContaining({
        txt: 'final text',
        audio_url: 'adj_audio_time/clip-1.wav',
        vap_voice_status: 'ready',
        vap_needs_tts: false,
        vap_draft_audio_path: null,
        vap_draft_txt: null,
      })
    );
    expect(patchSubtitleItemById.mock.calls[0]?.[3]).not.toHaveProperty('vap_tts_updated_at_ms');
    expect(updateSingleSubtitleItemById).not.toHaveBeenCalled();
  });

  it('preserves earlier promoted edits after a later split rebuilds editor state', async () => {
    let translateRows = [
      {
        id: '0001_00-00-00-000_00-00-04-000',
        seq: '1',
        start: '00:00:00,000',
        end: '00:00:04,000',
        txt: 'first base text',
        audio_url: 'adj_audio_time/0001_00-00-00-000_00-00-04-000.wav',
      },
      {
        id: '0002_00-00-04-000_00-00-08-000',
        seq: '2',
        start: '00:00:04,000',
        end: '00:00:08,000',
        txt: 'second base text',
        audio_url: 'adj_audio_time/0002_00-00-04-000_00-00-08-000.wav',
      },
      {
        id: '0003_00-00-08-000_00-00-12-000',
        seq: '3',
        start: '00:00:08,000',
        end: '00:00:12,000',
        txt: 'third base text',
        audio_url: 'adj_audio_time/0003_00-00-08-000_00-00-12-000.wav',
      },
    ];
    let sourceRows = [
      {
        id: '0001_00-00-00-000_00-00-04-000',
        seq: '1',
        start: '00:00:00,000',
        end: '00:00:04,000',
        txt: 'first source',
        audio_url: 'split_audio/audio/0001_00-00-00-000_00-00-04-000.wav',
      },
      {
        id: '0002_00-00-04-000_00-00-08-000',
        seq: '2',
        start: '00:00:04,000',
        end: '00:00:08,000',
        txt: 'second source',
        audio_url: 'split_audio/audio/0002_00-00-04-000_00-00-08-000.wav',
      },
      {
        id: '0003_00-00-08-000_00-00-12-000',
        seq: '3',
        start: '00:00:08,000',
        end: '00:00:12,000',
        txt: 'third source',
        audio_url: 'split_audio/audio/0003_00-00-08-000_00-00-12-000.wav',
      },
    ];

    patchSubtitleItemById.mockImplementation(async (_taskId, _type, id, patch) => {
      translateRows = patchRowById(translateRows, id, patch);
      return {};
    });
    updateSingleSubtitleItemById.mockImplementation(async (_taskId, _type, id, nextItem) => {
      translateRows = replaceRowById(translateRows, id, nextItem);
      return {};
    });

    const firstSplit = splitSubtitlePayload({
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'first split text',
      splitOperationId: 'split-op-1',
      nowMs: 1000,
      translate: translateRows,
      source: sourceRows,
    });
    translateRows = clone(firstSplit.translate);
    sourceRows = clone(firstSplit.source);

    const leftChildId = firstSplit.newIds.leftTranslateId;
    const secondClipId = '0002_00-00-04-000_00-00-08-000';
    const thirdClipId = '0003_00-00-08-000_00-00-12-000';

    const staleLeftChild = clone(translateRows.find((row) => row.id === leftChildId));
    const staleThirdClip = clone(translateRows.find((row) => row.id === thirdClipId));

    translateRows = patchRowById(translateRows, leftChildId, {
      vap_draft_txt: 'edited first child',
      vap_draft_audio_path: `adj_audio_time_temp/${leftChildId}.wav`,
      vap_tts_updated_at_ms: 111,
    });
    translateRows = patchRowById(translateRows, thirdClipId, {
      vap_draft_txt: 'edited third clip',
      vap_draft_audio_path: `adj_audio_time_temp/${thirdClipId}.wav`,
      vap_tts_updated_at_ms: 333,
    });

    const { POST } = await import('./route');

    let response = await POST(
      new Request('http://localhost/api/video-task/update-subtitle-item', {
        method: 'POST',
        body: JSON.stringify({
          taskId: 'task-1',
          type: 'translate_srt',
          id: leftChildId,
          pathName: `adj_audio_time_temp/${leftChildId}.wav`,
          item: {
            ...staleLeftChild,
            txt: 'edited first child',
          },
        }),
      })
    );
    expect((await response.json()).code).toBe(0);

    response = await POST(
      new Request('http://localhost/api/video-task/update-subtitle-item', {
        method: 'POST',
        body: JSON.stringify({
          taskId: 'task-1',
          type: 'translate_srt',
          id: thirdClipId,
          pathName: `adj_audio_time_temp/${thirdClipId}.wav`,
          item: {
            ...staleThirdClip,
            txt: 'edited third clip',
          },
        }),
      })
    );
    expect((await response.json()).code).toBe(0);

    const secondSplit = splitSubtitlePayload({
      clipId: secondClipId,
      splitAtMs: 6000,
      effectiveConvertText: 'second split text',
      splitOperationId: 'split-op-2',
      nowMs: 2000,
      translate: translateRows,
      source: sourceRows,
    });

    const rebuiltTrack = buildTrackSnapshot(secondSplit.translate);
    const rebuiltLeftChild = rebuiltTrack.find((row) => row.id === leftChildId);
    const rebuiltThirdClip = rebuiltTrack.find((row) => row.id === thirdClipId);

    expect(rebuiltLeftChild).toMatchObject({
      id: leftChildId,
      text: 'edited first child',
      audioUrl: `https://cdn.example.com/dev/user-1/task-1/adj_audio_time/${leftChildId}.wav?t=111`,
    });
    expect(rebuiltThirdClip).toMatchObject({
      id: thirdClipId,
      text: 'edited third clip',
      audioUrl: `https://cdn.example.com/dev/user-1/task-1/adj_audio_time/${thirdClipId}.wav?t=333`,
    });
  });
});
