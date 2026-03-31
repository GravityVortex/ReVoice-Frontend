import { describe, expect, it, vi } from 'vitest';

import {
  resolvePreviewEditingSubtitle,
  resolvePreviewSubtitleCommitOutcome,
} from './video-preview-edit-session';

describe('video-preview-edit-session', () => {
  const subtitleTrack = [
    {
      id: 'clip-1',
      type: 'audio' as const,
      name: 'clip-1',
      text: '第一条字幕',
      startTime: 0,
      duration: 2,
    },
    {
      id: 'clip-2',
      type: 'audio' as const,
      name: 'clip-2',
      text: '第二条字幕',
      startTime: 2,
      duration: 2,
    },
  ];

  it('locks the preview editor to the subtitle being edited even if playback moves to another clip', () => {
    const activeSubtitle = resolvePreviewEditingSubtitle({
      activeSubtitleIndex: 1,
      subtitleTrack,
      editingSubtitleId: 'clip-1',
    });

    expect(activeSubtitle?.id).toBe('clip-1');
    expect(activeSubtitle?.text).toBe('第一条字幕');
  });

  it('keeps the editor open when the workstation rejects the commit', () => {
    const onCommit = vi.fn(() => false);

    const outcome = resolvePreviewSubtitleCommitOutcome({
      subtitleId: 'clip-1',
      draftText: '更新后的字幕',
      onCommit,
    });

    expect(onCommit).toHaveBeenCalledWith('clip-1', '更新后的字幕');
    expect(outcome.action).toBe('keep_editing');
    expect(outcome.nextText).toBe('更新后的字幕');
  });

  it('closes the editor without committing when the draft is empty after trim', () => {
    const onCommit = vi.fn();

    const outcome = resolvePreviewSubtitleCommitOutcome({
      subtitleId: 'clip-1',
      draftText: '   ',
      onCommit,
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(outcome.action).toBe('close');
    expect(outcome.nextText).toBe('');
  });
});
