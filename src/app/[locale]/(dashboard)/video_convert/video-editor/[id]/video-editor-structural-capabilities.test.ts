import { describe, expect, it } from 'vitest';

import { buildVideoEditorStructuralCapabilities } from './video-editor-structural-capabilities';

describe('video editor structural capabilities', () => {
  it('groups split and undo gate state into a single timeline protocol', () => {
    expect(
      buildVideoEditorStructuralCapabilities({
        blockReason: 'video-updating',
        splitDisabled: true,
        splitLoading: false,
        splitTooltipText: '结构编辑暂时不可用',
        hasUndoableOps: true,
        undoDisabled: true,
        undoLoading: false,
        undoCountdown: 0,
        undoTooltipText: '结构编辑暂时不可用',
      })
    ).toEqual({
      blockReason: 'video-updating',
      split: {
        disabled: true,
        loading: false,
        tooltipText: '结构编辑暂时不可用',
      },
      undo: {
        available: true,
        disabled: true,
        loading: false,
        countdown: 0,
        tooltipText: '结构编辑暂时不可用',
      },
    });
  });
});
