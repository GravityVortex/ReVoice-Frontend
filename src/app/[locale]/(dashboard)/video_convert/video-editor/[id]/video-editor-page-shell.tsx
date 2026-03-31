'use client';

import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/shared/blocks/common/error-state';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { Button } from '@/shared/components/ui/button';

import { VideoEditorHeader } from './video-editor-header';
import { VideoEditorLoadingState } from './video-editor-loading-state';
import { VideoEditorTimelineDock } from './video-editor-timeline-dock';
import { VideoEditorUnsavedDialog } from './video-editor-unsaved-dialog';
import { VideoEditorWorkspace } from './video-editor-workspace';
import { useVideoEditorBootstrap } from './runtime/bootstrap/use-video-editor-bootstrap';
import { useVideoEditorStructuralTimingBridge } from './runtime/bridge/use-video-editor-structural-timing-bridge';
import { useVideoEditorWorkstationBridge } from './runtime/bridge/use-video-editor-workstation-bridge';
import { useVideoEditorDocument } from './runtime/document/use-video-editor-document';
import { getActiveVideoEditorDocumentState } from './runtime/document/video-editor-document-selectors';
import { useVideoEditorKeybindings } from './runtime/keybindings/use-video-editor-keybindings';
import { useVideoEditorLayout } from './runtime/layout/use-video-editor-layout';
import { useVideoEditorMerge } from './runtime/merge/use-video-editor-merge';
import { useVideoEditorPageOrchestration } from './runtime/orchestration/use-video-editor-page-orchestration';
import { useVideoEditorPlayback } from './runtime/playback/use-video-editor-playback';
import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';

export function VideoEditorPageShell() {
  const params = useParams();
  const convertId = params.id as string;
  const locale = (params.locale as string) || 'zh';
  const t = useTranslations('video_convert.videoEditor');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('video_convert.projectDetail');

  const {
    zoom,
    setZoom,
    bodyRef,
    timelineHeightPx,
    timelineResizeHandleLabel,
    handleTimelineResizePointerDown,
    handleTimelineResizePointerMove,
    handleTimelineResizePointerUp,
    handleTimelineResizePointerCancel,
  } = useVideoEditorLayout({
    locale,
  });

  const documentTrackLabels = useMemo(
    () => ({
      videoTrackName: t('videoEditor.tracks.mainVideo'),
      bgmTrackName: t('videoEditor.tracks.bgm'),
    }),
    [t]
  );

  const {
    convertObj,
    setConvertObj,
    videoTrack,
    bgmTrack,
    subtitleTrack,
    subtitleTrackOriginal,
    pendingTimingMap,
    setPendingTimingMap,
    pendingTimingCount,
    serverLastMergedAtMs,
    setServerLastMergedAtMs,
    setWorkstationDirty,
    documentPendingState,
    documentDuration,
    handlePendingVoiceIdsChange,
    handlePlaybackBlockedVoiceIdsChange,
    handleUpdateSubtitleAudio,
    handleSubtitleTextChange,
    handleSourceSubtitleTextChange,
    handleSubtitleVoiceStatusChange,
    handleResetTiming,
    resetDocumentSessionState,
  } = useVideoEditorDocument({
    convertId,
    trackLabels: documentTrackLabels,
  });

  const activeDocument = useMemo(
    () =>
      getActiveVideoEditorDocumentState({
        convertId,
        convertObj,
        videoTrack,
        bgmTrack,
        subtitleTrack,
        subtitleTrackOriginal,
        pendingTimingMap,
        pendingTimingCount,
        serverLastMergedAtMs,
        documentPendingState,
        documentDuration,
      }),
    [
      bgmTrack,
      convertId,
      convertObj,
      documentDuration,
      documentPendingState,
      pendingTimingCount,
      pendingTimingMap,
      serverLastMergedAtMs,
      subtitleTrack,
      subtitleTrackOriginal,
      videoTrack,
    ]
  );

  const activeConvertObj = activeDocument.convertObj;
  const activeVideoTrack = activeDocument.videoTrack;
  const activeBgmTrack = activeDocument.bgmTrack;
  const activeSubtitleTrack = activeDocument.subtitleTrack;
  const activeSubtitleTrackOriginal = activeDocument.subtitleTrackOriginal;
  const activePendingTimingMap = activeDocument.pendingTimingMap;
  const activePendingTimingCount = activeDocument.pendingTimingCount;
  const activeServerLastMergedAtMs = activeDocument.serverLastMergedAtMs;
  const activeDocumentPendingState = activeDocument.documentPendingState;
  const activeDocumentDuration = activeDocument.documentDuration;

  const {
    workstationRef,
    scrollToWorkstationItem,
    prepareForVideoMerge,
    requestVideoSave,
    prepareForStructuralEdit,
    commitPreviewSubtitleText,
  } =
    useVideoEditorWorkstationBridge();
  const {
    explicitMissingVoiceIdSet,
    localPendingVoiceIdSet,
    playbackBlockedVoiceIdSet,
    pendingMergeCount,
    pendingMergeVoiceCount,
    pendingMergeTimingCount,
    hasUnsavedChanges,
  } = activeDocumentPendingState;

  const {
    transportSnapshot,
    timelineHandleRef,
    videoPreviewRef,
    currentTime,
    totalDuration,
    volume,
    isBgmMuted,
    isSubtitleMuted,
    isPlaying,
    handlePreviewPlayStateChange,
    handlePlayPause,
    handleSeek,
    handleSeekToSubtitle,
    handleGlobalVolume,
    handleToggleBgmMute,
    handleToggleSubtitleMute,
    handleAutoPlayNextChange,
    handleAuditionRequestPlay,
    handleAuditionToggle,
    handleAuditionStop,
    handleRetryBlockedPlayback,
    handleCancelBlockedPlayback,
    handleLocateBlockedClip,
    clearVoiceCache,
    clearActiveTimelineClip,
  } = useVideoEditorPlayback({
    convertId,
    convertObj: activeConvertObj,
    locale,
    t,
    zoom,
    documentDuration: activeDocumentDuration,
    videoTrack: activeVideoTrack,
    bgmTrack: activeBgmTrack,
    subtitleTrack: activeSubtitleTrack,
    subtitleTrackOriginal: activeSubtitleTrackOriginal,
    localPendingVoiceIdSet,
    playbackBlockedVoiceIdSet,
    explicitMissingVoiceIdSet,
    scrollToItem: scrollToWorkstationItem,
  });

  const { isLoading, error, videoSource, loadedTaskMainItem, reloadConvertDetail } = useVideoEditorBootstrap({
    convertId,
    t,
    setConvertObj,
  });

  const { syncStructuralPersistPendingTimings, persistPendingTimingsForMerge } = useVideoEditorStructuralTimingBridge();

  const {
    taskStatus,
    taskErrorMessage,
    taskProgress,
    statusMeta,
    progressPercent,
    isTaskRunning,
    isMergeJobActive,
    isGeneratingVideo,
    mergeStatusRequiresManualRetry,
    mergePrimaryAction,
    headerProgressFillCls,
    headerProgressVisual,
    showHeaderBusySpinner,
    headerDownloadState,
    handleGenerateVideo,
    handleRetryMergeStatus,
    handleVideoMergeStarted,
    handleDownloadVideo,
    handleDownloadAudio,
    handleDownloadSrt,
    hydrateTaskStateFromDetail,
  } = useVideoEditorMerge({
    convertId,
    locale,
    t,
    tDetail,
    convertMetadata: activeConvertObj?.metadata,
    fallbackProgress: activeConvertObj?.progress,
    fallbackCurrentStep: activeConvertObj?.currentStep,
    userId: activeConvertObj?.userId || '',
    videoSourceFileName: videoSource?.fileName,
    hasUnsavedChanges,
    serverLastMergedAtMs: activeServerLastMergedAtMs,
    setServerLastMergedAtMs,
    prepareForVideoMerge,
    persistPendingTimingsIfNeeded: persistPendingTimingsForMerge,
    requestVideoSave,
  });

  const {
    isSplittingSubtitle,
    isRollingBack,
    hasUndoableOps,
    undoCountdown,
    structuralEditBlockReason,
    splitDisabled,
    undoDisabled,
    persistPendingTimingsIfNeeded,
    handleUndoCancel,
    handleRollbackLatest,
    handleSubtitleSplit,
  } = useVideoEditorStructuralEdit({
    convertId,
    locale,
    t,
    convertObj: activeConvertObj,
    subtitleTrack: activeSubtitleTrack,
    currentTimeSec: currentTime,
    isPlaying,
    isGeneratingVideo,
    isTaskRunning,
    isMergeJobActive,
    pendingTimingMap: activePendingTimingMap,
    setPendingTimingMap,
    pendingTimingCount: activePendingTimingCount,
    setConvertObj,
    clearActiveTimelineClip,
    prepareForStructuralEdit,
    scrollToItem: scrollToWorkstationItem,
    pausePlaybackBeforeSplit: () => {
      if (isPlaying) handlePlayPause();
    },
    clearVoiceCache,
  });

  useLayoutEffect(() => {
    syncStructuralPersistPendingTimings(persistPendingTimingsIfNeeded);
    return () => {
      syncStructuralPersistPendingTimings(undefined);
    };
  }, [persistPendingTimingsIfNeeded, syncStructuralPersistPendingTimings]);

  const {
    showLeaveDialog,
    confirmLeave,
    cancelLeave,
    handleBackClick,
    handleUnsavedDialogOpenChange,
    headerDownloadLabels,
    headerDownloadTooltipText,
    structuralEditBlockedMessage,
  } = useVideoEditorPageOrchestration({
    convertId,
    convertOriginalFileId: activeConvertObj?.originalFileId,
    hasUnsavedChanges,
    t,
    tDetail,
    headerDownloadTooltipKey: headerDownloadState.tooltipKey,
    resetDocumentSessionState,
    loadedTaskMainItem,
    hydrateTaskStateFromDetail,
  });

  useVideoEditorKeybindings({
    onUndo: handleRollbackLatest,
    onPlayPause: handlePlayPause,
  });

  // --- RENDER ---
  if (isLoading) return <VideoEditorLoadingState />;
  if (error)
    return (
      <ErrorState
        title={t('error.loadFailed')}
        detail={error}
        action={
          <Button variant="outline" size="sm" onClick={() => void reloadConvertDetail()}>
            {tCommon('errorState.retry')}
          </Button>
        }
      />
    );

  return (
    <div className="bg-background/40 relative m-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 shadow-xl backdrop-blur-xl sm:m-3">
      {/* Ambient backdrop: subtle motion + depth (keeps the editor feeling "alive" without being noisy). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[420px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] via-white/[0.01] to-transparent opacity-50 blur-[90px]" />
        <div className="absolute right-[-18%] -bottom-56 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent opacity-40 blur-[80px]" />
        <RetroGrid
          className="opacity-25 mix-blend-screen motion-reduce:opacity-0"
          angle={72}
          cellSize={78}
          opacity={0.22}
          lightLineColor="rgba(255, 255, 255, 0.04)"
          darkLineColor="rgba(255, 255, 255, 0.04)"
        />
      </div>

      <VideoEditorHeader
        locale={locale}
        t={t}
        convertObj={activeConvertObj}
        videoSourceFileName={videoSource?.fileName}
        statusMeta={statusMeta}
        progressPercent={progressPercent}
        totalDuration={totalDuration}
        pendingMergeCount={pendingMergeCount}
        pendingMergeVoiceCount={pendingMergeVoiceCount}
        pendingMergeTimingCount={pendingMergeTimingCount}
        taskStatus={taskStatus}
        taskErrorMessage={taskErrorMessage}
        isTaskRunning={isTaskRunning}
        isMergeJobActive={isMergeJobActive}
        taskProgress={taskProgress}
        mergeStatusRequiresManualRetry={mergeStatusRequiresManualRetry}
        mergePrimaryAction={mergePrimaryAction}
        showHeaderBusySpinner={showHeaderBusySpinner}
        headerDownloadLabels={headerDownloadLabels}
        headerDownloadState={headerDownloadState}
        headerDownloadTooltipText={headerDownloadTooltipText}
        headerProgressVisual={headerProgressVisual}
        headerProgressFillCls={headerProgressFillCls}
        hasUnsavedChanges={hasUnsavedChanges}
        onBackClick={handleBackClick}
        onRetryMergeStatus={handleRetryMergeStatus}
        onGenerateVideo={handleGenerateVideo}
        onDownloadVideo={() => void handleDownloadVideo()}
        onDownloadAudio={(kind) => void handleDownloadAudio(kind)}
        onDownloadSrt={(kind) => void handleDownloadSrt(kind)}
      />

      {/* Body (user-tunable dock layout: resizable columns + resizable timeline height). */}
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <VideoEditorWorkspace
          convertObj={activeConvertObj}
          serverLastMergedAtMs={activeServerLastMergedAtMs}
          transportSnapshot={transportSnapshot}
          subtitleTrack={activeSubtitleTrack}
          videoUrl={activeVideoTrack[0]?.url}
          workstationRef={workstationRef}
          videoPreviewRef={videoPreviewRef}
          onSeekToSubtitle={handleSeekToSubtitle}
          onUpdateSubtitleAudioUrl={handleUpdateSubtitleAudio}
          onSubtitleTextChange={handleSubtitleTextChange}
          onPreviewSubtitleCommit={commitPreviewSubtitleText}
          onSourceSubtitleTextChange={handleSourceSubtitleTextChange}
          onSubtitleVoiceStatusChange={handleSubtitleVoiceStatusChange}
          onPendingVoiceIdsChange={handlePendingVoiceIdsChange}
          onPlaybackBlockedVoiceIdsChange={handlePlaybackBlockedVoiceIdsChange}
          onVideoMergeStarted={handleVideoMergeStarted}
          onRequestAuditionPlay={handleAuditionRequestPlay}
          onRequestAuditionToggle={handleAuditionToggle}
          onRequestAuditionStop={() => handleAuditionStop(false)}
          onToggleAutoPlayNext={handleAutoPlayNextChange}
          onDirtyStateChange={setWorkstationDirty}
          onResetTiming={handleResetTiming}
          onPreviewPlayStateChange={handlePreviewPlayStateChange}
          onRetryBlockedPlayback={handleRetryBlockedPlayback}
          onCancelBlockedPlayback={handleCancelBlockedPlayback}
          onLocateBlockedClip={handleLocateBlockedClip}
          onReloadFromServer={() => reloadConvertDetail({ silent: true })}
        />

        <VideoEditorTimelineDock
          locale={locale}
          timelineHeightPx={timelineHeightPx}
          resizeHandleLabel={timelineResizeHandleLabel}
          totalDuration={totalDuration}
          transportSnapshot={transportSnapshot}
          subtitleTrack={activeSubtitleTrack}
          subtitleTrackOriginal={activeSubtitleTrackOriginal}
          vocalWaveformUrl={activeConvertObj?.vocalAudioUrl}
          bgmWaveformUrl={activeConvertObj?.backgroundAudioUrl}
          timelineRef={timelineHandleRef}
          zoom={zoom}
          volume={volume}
          isBgmMuted={isBgmMuted}
          isSubtitleMuted={isSubtitleMuted}
          splitDisabled={splitDisabled}
          splitTooltipText={structuralEditBlockReason ? structuralEditBlockedMessage : null}
          splitLoading={isSplittingSubtitle}
          hasUndoableOps={hasUndoableOps}
          undoDisabled={undoDisabled}
          undoLoading={isRollingBack}
          undoCountdown={undoCountdown}
          undoTooltipText={structuralEditBlockReason ? structuralEditBlockedMessage : null}
          onResizePointerDown={handleTimelineResizePointerDown}
          onResizePointerMove={handleTimelineResizePointerMove}
          onResizePointerUp={handleTimelineResizePointerUp}
          onResizePointerCancel={handleTimelineResizePointerCancel}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onZoomChange={setZoom}
          onVolumeChange={handleGlobalVolume}
          onToggleBgmMute={handleToggleBgmMute}
          onToggleSubtitleMute={handleToggleSubtitleMute}
          onSplitAtCurrentTime={handleSubtitleSplit}
          onUndo={handleRollbackLatest}
          onUndoCancel={handleUndoCancel}
        />
      </div>

      <VideoEditorUnsavedDialog
        open={showLeaveDialog}
        title={t('unsavedDialog.title')}
        description={t('unsavedDialog.description')}
        stayLabel={t('unsavedDialog.stay')}
        leaveLabel={t('unsavedDialog.leave')}
        onOpenChange={handleUnsavedDialogOpenChange}
        onStay={cancelLeave}
        onConfirmLeave={confirmLeave}
      />
    </div>
  );
}
