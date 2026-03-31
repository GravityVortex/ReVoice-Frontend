'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter } from '@/core/i18n/navigation';
import { useUnsavedChangesGuard } from '@/shared/hooks/use-unsaved-changes-guard';

import type { HeaderDownloadLabels } from '../../header-download-actions';

type TranslateFn = (key: string) => string;

type TaskMainHydratePayload = {
  status?: unknown;
  errorMessage?: unknown;
  progress?: unknown;
  currentStep?: unknown;
} | null;

type UseVideoEditorPageOrchestrationArgs = {
  convertId: string;
  convertOriginalFileId?: string | null;
  hasUnsavedChanges: boolean;
  t: TranslateFn;
  tDetail: TranslateFn;
  headerDownloadTooltipKey: keyof Pick<HeaderDownloadLabels, 'downloadUpdatingHint'> | null;
  resetDocumentSessionState: () => void;
  loadedTaskMainItem: TaskMainHydratePayload;
  hydrateTaskStateFromDetail: (taskMainItem: TaskMainHydratePayload) => void;
};

export function useVideoEditorPageOrchestration(args: UseVideoEditorPageOrchestrationArgs) {
  const {
    convertId,
    convertOriginalFileId,
    hasUnsavedChanges,
    t,
    tDetail,
    headerDownloadTooltipKey,
    resetDocumentSessionState,
    loadedTaskMainItem,
    hydrateTaskStateFromDetail,
  } = args;

  const router = useRouter();
  const { showLeaveDialog, confirmLeave, cancelLeave } = useUnsavedChangesGuard(hasUnsavedChanges);

  useEffect(() => {
    resetDocumentSessionState();
  }, [convertId, resetDocumentSessionState]);

  useEffect(() => {
    if (!loadedTaskMainItem) return;
    hydrateTaskStateFromDetail(loadedTaskMainItem);
  }, [hydrateTaskStateFromDetail, loadedTaskMainItem]);

  const backUrl = convertOriginalFileId ? `/dashboard/projects/${convertOriginalFileId}` : '/dashboard/projects';

  const handleBackClick = useCallback(() => {
    router.push(backUrl);
  }, [backUrl, router]);

  const handleUnsavedDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelLeave();
    },
    [cancelLeave]
  );

  const headerDownloadLabels = useMemo(
    () => ({
      downloadFinalVideo: tDetail('ui.workbench.deliverables.downloadVideo'),
      moreDownloads: t('header.moreDownloads'),
      mobileDownload: tDetail('buttons.download'),
      downloadDubAudio: `${tDetail('audio.download')} .wav`,
      downloadBackgroundAudio: `${tDetail('audio.downloadBg')} .wav`,
      downloadOriginalSubtitle: `${tDetail('subtitle.download_yuan')} .srt`,
      downloadTranslatedSubtitle: `${tDetail('subtitle.download_tran')} .srt`,
      downloadBilingualSubtitle: `${tDetail('subtitle.download_double')} .srt`,
      downloadUpdatingHint: t('header.downloadUpdatingHint'),
    }),
    [t, tDetail]
  );

  const headerDownloadTooltipText = headerDownloadTooltipKey == null ? null : headerDownloadLabels[headerDownloadTooltipKey];
  const structuralEditBlockedMessage = t('videoEditor.tooltips.structuralEditBlocked');

  return {
    showLeaveDialog,
    confirmLeave,
    cancelLeave,
    handleBackClick,
    handleUnsavedDialogOpenChange,
    headerDownloadLabels,
    headerDownloadTooltipText,
    structuralEditBlockedMessage,
  };
}
