import { describe, expect, it } from 'vitest';

import { buildVideoEditorHeaderCapabilities } from './video-editor-header-capabilities';

describe('video editor header capabilities', () => {
  it('groups header merge/download gate state into a single component protocol', () => {
    expect(
      buildVideoEditorHeaderCapabilities({
        mergePrimaryAction: {
          mode: 'retry-status',
          disabled: false,
        },
        showBusySpinner: true,
        headerDownloadState: {
          isVisible: true,
          isDisabled: true,
          tooltipKey: 'downloadUpdatingHint',
        },
        headerDownloadTooltipText: '正在生成最新成片，当前可下载上一版成功结果',
      })
    ).toEqual({
      mergePrimaryAction: {
        mode: 'retry-status',
        disabled: false,
      },
      showBusySpinner: true,
      download: {
        state: {
          isVisible: true,
          isDisabled: true,
          tooltipKey: 'downloadUpdatingHint',
        },
        tooltipText: '正在生成最新成片，当前可下载上一版成功结果',
      },
    });
  });
});
