import { describe, expect, it } from 'vitest';

import { getHeaderDownloadState } from '../../header-download-actions';
import { buildVideoEditorPageGateState, buildVideoEditorPageGates } from './video-editor-page-gates';

describe('video editor page gates', () => {
  it('derives header gate decisions from raw page state and then builds capabilities', () => {
    const downloadState = getHeaderDownloadState({
      taskStatus: 'processing',
      serverLastMergedAtMs: 168,
      isTaskRunning: false,
      isMergeJobActive: true,
    });

    const state = buildVideoEditorPageGateState({
      header: {
        isGeneratingVideo: false,
        isTaskRunning: false,
        isMergeJobActive: true,
        mergeStatusRequiresManualRetry: true,
        hasUnsavedChanges: false,
        downloadState,
      },
      structural: {
        blockReason: 'video-updating',
        splitDisabled: true,
        splitLoading: false,
        hasUndoableOps: true,
        undoDisabled: false,
        undoLoading: false,
        undoCountdown: 2,
      },
    });

    expect(state.header).toEqual({
      mergePrimaryAction: {
        mode: 'retry-status',
        disabled: false,
      },
      showBusySpinner: false,
      downloadState: {
        isVisible: true,
        isDisabled: true,
        tooltipKey: 'downloadUpdatingHint',
      },
    });

    const gates = buildVideoEditorPageGates({
      state,
      headerDownloadTooltipText: '正在生成最新成片',
      structuralBlockedTooltipText: '当前不可切割',
    });

    expect(gates.headerCapabilities).toEqual({
      mergePrimaryAction: {
        mode: 'retry-status',
        disabled: false,
      },
      showBusySpinner: false,
      download: {
        state: {
          isVisible: true,
          isDisabled: true,
          tooltipKey: 'downloadUpdatingHint',
        },
        tooltipText: '正在生成最新成片',
      },
    });

    expect(gates.structuralCapabilities).toEqual({
      blockReason: 'video-updating',
      split: {
        disabled: true,
        loading: false,
        tooltipText: '当前不可切割',
      },
      undo: {
        available: true,
        disabled: false,
        loading: false,
        countdown: 2,
        tooltipText: '当前不可切割',
      },
    });
  });
});
