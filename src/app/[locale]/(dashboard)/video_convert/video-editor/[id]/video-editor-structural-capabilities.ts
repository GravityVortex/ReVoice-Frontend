export type VideoEditorStructuralCapabilities = {
  blockReason: string | null;
  split: {
    disabled: boolean;
    loading: boolean;
    tooltipText: string | null;
  };
  undo: {
    available: boolean;
    disabled: boolean;
    loading: boolean;
    countdown: number;
    tooltipText: string | null;
  };
};

export function buildVideoEditorStructuralCapabilities(args: {
  blockReason: string | null;
  splitDisabled: boolean;
  splitLoading: boolean;
  splitTooltipText: string | null;
  hasUndoableOps: boolean;
  undoDisabled: boolean;
  undoLoading: boolean;
  undoCountdown: number;
  undoTooltipText: string | null;
}): VideoEditorStructuralCapabilities {
  return {
    blockReason: args.blockReason,
    split: {
      disabled: args.splitDisabled,
      loading: args.splitLoading,
      tooltipText: args.splitTooltipText,
    },
    undo: {
      available: args.hasUndoableOps,
      disabled: args.undoDisabled,
      loading: args.undoLoading,
      countdown: args.undoCountdown,
      tooltipText: args.undoTooltipText,
    },
  };
}
