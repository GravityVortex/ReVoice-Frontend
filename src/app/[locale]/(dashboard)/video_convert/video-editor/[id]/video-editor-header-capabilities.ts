import type { HeaderDownloadState } from './header-download-actions';
import type { VideoMergePrimaryActionMode } from './video-merge-state';

export type VideoEditorHeaderCapabilities = {
  mergePrimaryAction: {
    mode: VideoMergePrimaryActionMode;
    disabled: boolean;
  };
  showBusySpinner: boolean;
  download: {
    state: HeaderDownloadState;
    tooltipText: string | null;
  };
};

export function buildVideoEditorHeaderCapabilities(args: {
  mergePrimaryAction: VideoEditorHeaderCapabilities['mergePrimaryAction'];
  showBusySpinner: boolean;
  headerDownloadState: HeaderDownloadState;
  headerDownloadTooltipText: string | null;
}): VideoEditorHeaderCapabilities {
  return {
    mergePrimaryAction: args.mergePrimaryAction,
    showBusySpinner: args.showBusySpinner,
    download: {
      state: args.headerDownloadState,
      tooltipText: args.headerDownloadTooltipText,
    },
  };
}
