'use client';

import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/shared/blocks/common/error-state';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { Button } from '@/shared/components/ui/button';

import { VideoEditorHeader } from './video-editor-header';
import { getHeaderDownloadState } from './header-download-actions';
import { buildVideoEditorHeaderSession } from './video-editor-header-session';
import { VideoEditorLoadingState } from './video-editor-loading-state';
import { VideoEditorTimelineDock } from './video-editor-timeline-dock';
import { buildVideoEditorTimelineSession } from './video-editor-timeline-session';
import { VideoEditorUnsavedDialog } from './video-editor-unsaved-dialog';
import { buildVideoEditorWorkspaceCapabilities } from './video-editor-workspace-capabilities';
import { VideoEditorWorkspace } from './video-editor-workspace';
import { useVideoEditorBootstrap } from './runtime/bootstrap/use-video-editor-bootstrap';
import { useVideoEditorStructuralTimingBridge } from './runtime/bridge/use-video-editor-structural-timing-bridge';
import { useVideoEditorWorkstationBridge } from './runtime/bridge/use-video-editor-workstation-bridge';
import { useVideoEditorDocument } from './runtime/document/use-video-editor-document';
import { getActiveVideoEditorDocumentState } from './runtime/document/video-editor-document-selectors';
import { useVideoEditorKeybindings } from './runtime/keybindings/use-video-editor-keybindings';
import { useVideoEditorLayout } from './runtime/layout/use-video-editor-layout';
import { useVideoEditorMerge } from './runtime/merge/use-video-editor-merge';
import { buildVideoEditorPageGateState, buildVideoEditorPageGates } from './runtime/orchestration/video-editor-page-gates';
import { useVideoEditorPageOrchestration } from './runtime/orchestration/use-video-editor-page-orchestration';
import { useVideoEditorPlayback } from './runtime/playback/use-video-editor-playback';
import { useVideoEditorStructuralEdit } from './runtime/structural/use-video-editor-structural-edit';
import { useVideoEditorTimingSession } from './runtime/timing/use-video-editor-timing-session';

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

  const playbackSession = useVideoEditorPlayback({
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

  const timingSession = useVideoEditorTimingSession({
    convertId,
    locale,
    convertObj: activeConvertObj,
    pendingTimingMap: activePendingTimingMap,
    pendingTimingCount: activePendingTimingCount,
    setPendingTimingMap,
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
    effectiveLastMergedAtMs,
    downloadGuardRef,
    headerProgressFillCls,
    headerProgressVisual,
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
    handleUndoCancel,
    handleRollbackLatest,
    handleSubtitleSplit,
  } = useVideoEditorStructuralEdit({
    convertId,
    locale,
    t,
    convertObj: activeConvertObj,
    subtitleTrack: activeSubtitleTrack,
    currentTimeSec: playbackSession.state.currentTime,
    isPlaying: playbackSession.state.isPlaying,
    isGeneratingVideo,
    isTaskRunning,
    isMergeJobActive,
    timingSession,
    setConvertObj,
    clearActiveTimelineClip: playbackSession.maintenance.clearActiveTimelineClip,
    prepareForStructuralEdit,
    scrollToItem: scrollToWorkstationItem,
    pausePlaybackBeforeSplit: async () => {
      // High Fix #6: Make pausePlaybackBeforeSplit async and wait for playback to stop
      if (playbackSession.state.isPlaying) {
        playbackSession.actions.handlePlayPause();
        // Wait for playback state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
    clearVoiceCache: playbackSession.maintenance.clearVoiceCache,
  });

  useLayoutEffect(() => {
    // P0 Fix #1: Sync flushPendingTimings for merge (not persistPendingTimingsIfNeeded)
    syncStructuralPersistPendingTimings(timingSession.actions.flushPendingTimings);
    return () => {
      syncStructuralPersistPendingTimings(undefined);
    };
  }, [syncStructuralPersistPendingTimings, timingSession.actions.flushPendingTimings]);

  const downloadGuardState = useMemo(
    () =>
      getHeaderDownloadState({
        taskStatus,
        serverLastMergedAtMs: effectiveLastMergedAtMs,
        isTaskRunning,
        isMergeJobActive,
      }),
    [effectiveLastMergedAtMs, isMergeJobActive, isTaskRunning, taskStatus]
  );
  downloadGuardRef.current = downloadGuardState;

  const pageGateState = useMemo(
    () =>
      buildVideoEditorPageGateState({
        header: {
          isGeneratingVideo,
          isTaskRunning,
          isMergeJobActive,
          mergeStatusRequiresManualRetry,
          hasUnsavedChanges,
          downloadState: downloadGuardState,
        },
        structural: {
          blockReason: structuralEditBlockReason,
          splitDisabled,
          splitLoading: isSplittingSubtitle,
          hasUndoableOps,
          undoDisabled,
          undoLoading: isRollingBack,
          undoCountdown,
        },
      }),
    [
      downloadGuardState,
      hasUndoableOps,
      hasUnsavedChanges,
      isGeneratingVideo,
      isMergeJobActive,
      isRollingBack,
      isSplittingSubtitle,
      isTaskRunning,
      mergeStatusRequiresManualRetry,
      splitDisabled,
      structuralEditBlockReason,
      undoCountdown,
      undoDisabled,
    ]
  );

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
    headerDownloadTooltipKey: pageGateState.header.downloadState.tooltipKey,
    resetDocumentSessionState,
    loadedTaskMainItem,
    hydrateTaskStateFromDetail,
  });

  const pageGates = useMemo(
    () =>
      buildVideoEditorPageGates({
        state: pageGateState,
        headerDownloadTooltipText,
        structuralBlockedTooltipText: structuralEditBlockedMessage,
      }),
    [
      headerDownloadTooltipText,
      pageGateState,
      structuralEditBlockedMessage,
    ]
  );

  const headerSession = useMemo(
    () =>
      buildVideoEditorHeaderSession({
        locale,
        t,
        view: {
          convertObj: activeConvertObj,
          videoSourceFileName: videoSource?.fileName,
          statusMeta,
          progressPercent,
          totalDuration: playbackSession.state.totalDuration,
          pendingMergeCount,
          pendingMergeVoiceCount,
          pendingMergeTimingCount,
          taskStatus,
          taskErrorMessage,
          isTaskRunning,
          isMergeJobActive,
          taskProgress,
          mergeStatusRequiresManualRetry,
          headerCapabilities: pageGates.headerCapabilities,
          headerDownloadLabels,
          headerProgressVisual,
          headerProgressFillCls,
          hasUnsavedChanges,
        },
        actions: {
          onBackClick: handleBackClick,
          onRetryMergeStatus: handleRetryMergeStatus,
          onGenerateVideo: handleGenerateVideo,
          onDownloadVideo: () => void handleDownloadVideo(),
          onDownloadAudio: (kind) => void handleDownloadAudio(kind),
          onDownloadSrt: (kind) => void handleDownloadSrt(kind),
        },
      }),
    [
      activeConvertObj,
      handleBackClick,
      handleDownloadAudio,
      handleDownloadSrt,
      handleDownloadVideo,
      handleGenerateVideo,
      handleRetryMergeStatus,
      hasUnsavedChanges,
      headerDownloadLabels,
      headerProgressFillCls,
      headerProgressVisual,
      isMergeJobActive,
      isTaskRunning,
      locale,
      mergeStatusRequiresManualRetry,
      pageGates.headerCapabilities,
      pendingMergeCount,
      pendingMergeTimingCount,
      pendingMergeVoiceCount,
      progressPercent,
      statusMeta,
      t,
      taskErrorMessage,
      taskProgress,
      taskStatus,
      playbackSession.state.totalDuration,
      videoSource?.fileName,
    ]
  );

  const workspaceCapabilities = useMemo(
    () =>
      buildVideoEditorWorkspaceCapabilities({
        workstation: {
          ref: workstationRef,
          convertObj: activeConvertObj,
          lastMergedAtMs: activeServerLastMergedAtMs,
          transportSnapshot: playbackSession.state.transportSnapshot,
          onSeekToSubtitle: playbackSession.actions.handleSeekToSubtitle,
          onUpdateSubtitleAudioUrl: handleUpdateSubtitleAudio,
          onSubtitleTextChange: handleSubtitleTextChange,
          onSourceSubtitleTextChange: handleSourceSubtitleTextChange,
          onSubtitleVoiceStatusChange: handleSubtitleVoiceStatusChange,
          onPendingVoiceIdsChange: handlePendingVoiceIdsChange,
          onPlaybackBlockedVoiceIdsChange: handlePlaybackBlockedVoiceIdsChange,
          onVideoMergeStarted: handleVideoMergeStarted,
          onRequestAuditionPlay: playbackSession.actions.handleAuditionRequestPlay,
          onRequestAuditionToggle: playbackSession.actions.handleAuditionToggle,
          onRequestAuditionStop: () => playbackSession.actions.handleAuditionStop(false),
          onToggleAutoPlayNext: playbackSession.actions.handleAutoPlayNextChange,
          onDirtyStateChange: setWorkstationDirty,
          onResetTiming: handleResetTiming,
          onReloadFromServer: () => reloadConvertDetail({ silent: true }),
        },
        preview: {
          ref: playbackSession.refs.videoPreviewRef,
          transportSnapshot: playbackSession.state.transportSnapshot,
          subtitleTrack: activeSubtitleTrack,
          videoUrl: activeVideoTrack[0]?.url,
          onPlayStateChange: playbackSession.actions.handlePreviewPlayStateChange,
          onRetryBlockedPlayback: playbackSession.actions.handleRetryBlockedPlayback,
          onCancelBlockedPlayback: playbackSession.actions.handleCancelBlockedPlayback,
          onLocateBlockedClip: playbackSession.actions.handleLocateBlockedClip,
          onSubtitleUpdate: commitPreviewSubtitleText,
        },
      }),
    [
      activeConvertObj,
      activeServerLastMergedAtMs,
      activeSubtitleTrack,
      activeVideoTrack,
      commitPreviewSubtitleText,
      handlePendingVoiceIdsChange,
      handlePlaybackBlockedVoiceIdsChange,
      handleResetTiming,
      handleSourceSubtitleTextChange,
      handleSubtitleTextChange,
      handleSubtitleVoiceStatusChange,
      handleUpdateSubtitleAudio,
      handleVideoMergeStarted,
      playbackSession,
      reloadConvertDetail,
      setWorkstationDirty,
      workstationRef,
    ]
  );

  const timelineSession = useMemo(
    () =>
      buildVideoEditorTimelineSession({
        dock: {
          heightPx: timelineHeightPx,
          resizeHandleLabel: timelineResizeHandleLabel,
          onResizePointerDown: handleTimelineResizePointerDown,
          onResizePointerMove: handleTimelineResizePointerMove,
          onResizePointerUp: handleTimelineResizePointerUp,
          onResizePointerCancel: handleTimelineResizePointerCancel,
        },
        panel: {
          totalDuration: playbackSession.state.totalDuration,
          transportSnapshot: playbackSession.state.transportSnapshot,
          subtitleTrack: activeSubtitleTrack,
          subtitleTrackOriginal: activeSubtitleTrackOriginal,
          vocalWaveformUrl: activeConvertObj?.vocalAudioUrl,
          bgmWaveformUrl: activeConvertObj?.backgroundAudioUrl,
          timelineRef: playbackSession.refs.timelineHandleRef,
          zoom,
          volume: playbackSession.state.volume,
          isBgmMuted: playbackSession.state.isBgmMuted,
          isSubtitleMuted: playbackSession.state.isSubtitleMuted,
          structuralCapabilities: pageGates.structuralCapabilities,
          onPlayPause: playbackSession.actions.handlePlayPause,
          onSeek: playbackSession.actions.handleSeek,
          onZoomChange: setZoom,
          onVolumeChange: playbackSession.actions.handleGlobalVolume,
          onToggleBgmMute: playbackSession.actions.handleToggleBgmMute,
          onToggleSubtitleMute: playbackSession.actions.handleToggleSubtitleMute,
          onSplitAtCurrentTime: handleSubtitleSplit,
          onUndo: handleRollbackLatest,
          onUndoCancel: handleUndoCancel,
        },
      }),
    [
      activeConvertObj,
      activeSubtitleTrack,
      activeSubtitleTrackOriginal,
      handleRollbackLatest,
      handleSubtitleSplit,
      handleTimelineResizePointerCancel,
      handleTimelineResizePointerDown,
      handleTimelineResizePointerMove,
      handleTimelineResizePointerUp,
      handleUndoCancel,
      playbackSession,
      setZoom,
      pageGates.structuralCapabilities,
      timelineHeightPx,
      timelineResizeHandleLabel,
      zoom,
    ]
  );

  useVideoEditorKeybindings({
    onUndo: handleRollbackLatest,
    onPlayPause: playbackSession.actions.handlePlayPause,
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
        headerSession={headerSession}
      />

      {/* Body (user-tunable dock layout: resizable columns + resizable timeline height). */}
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <VideoEditorWorkspace workspaceCapabilities={workspaceCapabilities} />

        <VideoEditorTimelineDock timelineSession={timelineSession} />
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
