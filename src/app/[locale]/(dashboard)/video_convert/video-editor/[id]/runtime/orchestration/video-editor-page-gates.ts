import type { HeaderDownloadState } from '../../header-download-actions';
import { buildVideoEditorHeaderCapabilities, type VideoEditorHeaderCapabilities } from '../../video-editor-header-capabilities';
import {
  buildVideoEditorStructuralCapabilities,
  type VideoEditorStructuralCapabilities,
} from '../../video-editor-structural-capabilities';
import { getVideoMergePrimaryActionState, type VideoMergePrimaryActionMode } from '../../video-merge-state';

export type VideoEditorPageGates = {
  headerCapabilities: VideoEditorHeaderCapabilities;
  structuralCapabilities: VideoEditorStructuralCapabilities;
};

export type VideoEditorPageGateState = {
  header: {
    mergePrimaryAction: {
      mode: VideoMergePrimaryActionMode;
      disabled: boolean;
    };
    showBusySpinner: boolean;
    downloadState: HeaderDownloadState;
  };
  structural: {
    blockReason: string | null;
    splitDisabled: boolean;
    splitLoading: boolean;
    hasUndoableOps: boolean;
    undoDisabled: boolean;
    undoLoading: boolean;
    undoCountdown: number;
  };
};

export function buildVideoEditorPageGateState(args: {
  header: {
    isGeneratingVideo: boolean;
    isTaskRunning: boolean;
    isMergeJobActive: boolean;
    mergeStatusRequiresManualRetry: boolean;
    hasUnsavedChanges: boolean;
    downloadState: HeaderDownloadState;
  };
  structural: {
    blockReason: string | null;
    splitDisabled: boolean;
    splitLoading: boolean;
    hasUndoableOps: boolean;
    undoDisabled: boolean;
    undoLoading: boolean;
    undoCountdown: number;
  };
}): VideoEditorPageGateState {
  const mergePrimaryAction = getVideoMergePrimaryActionState({
    isGeneratingVideo: args.header.isGeneratingVideo,
    isTaskRunning: args.header.isTaskRunning,
    isMergeJobActive: args.header.isMergeJobActive,
    mergeStatusRequiresManualRetry: args.header.mergeStatusRequiresManualRetry,
    hasUnsavedChanges: args.header.hasUnsavedChanges,
  });

  return {
    header: {
      mergePrimaryAction,
      showBusySpinner:
        args.header.isGeneratingVideo ||
        args.header.isTaskRunning ||
        (args.header.isMergeJobActive && mergePrimaryAction.mode !== 'retry-status'),
      downloadState: args.header.downloadState,
    },
    structural: {
      blockReason: args.structural.blockReason,
      splitDisabled: args.structural.splitDisabled,
      splitLoading: args.structural.splitLoading,
      hasUndoableOps: args.structural.hasUndoableOps,
      undoDisabled: args.structural.undoDisabled,
      undoLoading: args.structural.undoLoading,
      undoCountdown: args.structural.undoCountdown,
    },
  };
}

export function buildVideoEditorPageGates(args: {
  state: VideoEditorPageGateState;
  headerDownloadTooltipText: string | null;
  structuralBlockedTooltipText: string | null;
}): VideoEditorPageGates {
  return {
    headerCapabilities: buildVideoEditorHeaderCapabilities({
      mergePrimaryAction: args.state.header.mergePrimaryAction,
      showBusySpinner: args.state.header.showBusySpinner,
      headerDownloadState: args.state.header.downloadState,
      headerDownloadTooltipText: args.headerDownloadTooltipText,
    }),
    structuralCapabilities: buildVideoEditorStructuralCapabilities({
      blockReason: args.state.structural.blockReason,
      splitDisabled: args.state.structural.splitDisabled,
      splitLoading: args.state.structural.splitLoading,
      splitTooltipText: args.state.structural.blockReason ? args.structuralBlockedTooltipText : null,
      hasUndoableOps: args.state.structural.hasUndoableOps,
      undoDisabled: args.state.structural.undoDisabled,
      undoLoading: args.state.structural.undoLoading,
      undoCountdown: args.state.structural.undoCountdown,
      undoTooltipText: args.state.structural.blockReason ? args.structuralBlockedTooltipText : null,
    }),
  };
}
