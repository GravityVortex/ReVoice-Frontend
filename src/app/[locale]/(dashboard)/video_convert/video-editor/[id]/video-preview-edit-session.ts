import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';

export type PreviewSubtitleUpdateHandler = (id: string, text: string) => boolean | void;

export function resolvePreviewEditingSubtitle(args: {
  activeSubtitleIndex: number | null | undefined;
  subtitleTrack: SubtitleTrackItem[];
  editingSubtitleId: string | null;
}) {
  if (args.editingSubtitleId) {
    const editingSubtitle = args.subtitleTrack.find((item) => item.id === args.editingSubtitleId);
    if (editingSubtitle) return editingSubtitle;
  }

  if (args.activeSubtitleIndex == null || args.activeSubtitleIndex < 0) {
    return null;
  }

  return args.subtitleTrack[args.activeSubtitleIndex] ?? null;
}

export function resolvePreviewSubtitleCommitOutcome(args: {
  subtitleId: string;
  draftText: string;
  onCommit?: PreviewSubtitleUpdateHandler;
}) {
  const nextText = args.draftText.trim();
  if (!nextText) {
    return {
      action: 'close' as const,
      nextText,
    };
  }

  const accepted = args.onCommit?.(args.subtitleId, nextText);
  if (accepted === false) {
    return {
      action: 'keep_editing' as const,
      nextText,
    };
  }

  return {
    action: 'close' as const,
    nextText,
  };
}
