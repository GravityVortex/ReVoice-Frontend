'use client';

import { useCallback, useEffect, useMemo, useReducer, type Dispatch, type SetStateAction } from 'react';

import type { ConvertObj, SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';

import type { VideoEditorDocumentTrackLabels } from './video-editor-document-mappers';
import {
  createInitialVideoEditorDocumentState,
  videoEditorDocumentReducer,
} from './video-editor-document-reducer';
import { deriveDocumentPendingState } from './video-editor-document-selectors';

type UseVideoEditorDocumentArgs = {
  convertId: string;
  trackLabels: VideoEditorDocumentTrackLabels;
};

type UseVideoEditorDocumentResult = {
  convertObj: ConvertObj | null;
  setConvertObj: Dispatch<SetStateAction<ConvertObj | null>>;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  pendingVoiceEntries: Array<{ id: string; updatedAtMs: number }>;
  setPendingVoiceEntries: Dispatch<SetStateAction<Array<{ id: string; updatedAtMs: number }>>>;
  playbackBlockedVoiceIds: string[];
  setPlaybackBlockedVoiceIds: Dispatch<SetStateAction<string[]>>;
  pendingTimingMap: Record<string, { startMs: number; endMs: number }>;
  setPendingTimingMap: Dispatch<SetStateAction<Record<string, { startMs: number; endMs: number }>>>;
  pendingTimingCount: number;
  serverLastMergedAtMs: number;
  setServerLastMergedAtMs: Dispatch<SetStateAction<number>>;
  workstationDirty: boolean;
  setWorkstationDirty: Dispatch<SetStateAction<boolean>>;
  documentPendingState: ReturnType<typeof deriveDocumentPendingState>;
  documentDuration: number;
  handlePendingVoiceIdsChange: (entries: Array<{ id: string; updatedAtMs: number }>) => void;
  handlePlaybackBlockedVoiceIdsChange: (ids: string[]) => void;
  handleUpdateSubtitleAudio: (id: string, url: string, previewAudioUrl?: string) => void;
  handleSubtitleTextChange: (id: string, text: string) => void;
  handleSourceSubtitleTextChange: (sourceId: string, text: string) => void;
  handleSubtitleVoiceStatusChange: (id: string, voiceStatus: string, needsTts: boolean) => void;
  handleResetTiming: (id: string, sourceId: string, startMs: number, endMs: number) => void;
  resetDocumentSessionState: () => void;
};

export function useVideoEditorDocument(args: UseVideoEditorDocumentArgs): UseVideoEditorDocumentResult {
  const { convertId, trackLabels } = args;
  const [state, dispatch] = useReducer(videoEditorDocumentReducer, undefined, createInitialVideoEditorDocumentState);
  const videoTrackName = trackLabels.videoTrackName;
  const bgmTrackName = trackLabels.bgmTrackName;
  const resolvedTrackLabels = useMemo(
    () => ({
      videoTrackName,
      bgmTrackName,
    }),
    [bgmTrackName, videoTrackName]
  );

  const setConvertObj = useCallback<Dispatch<SetStateAction<ConvertObj | null>>>(
    (update) => {
      dispatch({
        type: 'set_convert_obj',
        update,
        trackLabels: resolvedTrackLabels,
      });
    },
    [resolvedTrackLabels]
  );

  const setPendingVoiceEntries = useCallback<Dispatch<SetStateAction<Array<{ id: string; updatedAtMs: number }>>>>((update) => {
    dispatch({
      type: 'set_pending_voice_entries',
      update,
    });
  }, []);

  const setPlaybackBlockedVoiceIds = useCallback<Dispatch<SetStateAction<string[]>>>((update) => {
    dispatch({
      type: 'set_playback_blocked_voice_ids',
      update,
    });
  }, []);

  const setPendingTimingMap = useCallback<Dispatch<SetStateAction<Record<string, { startMs: number; endMs: number }>>>>(
    (update) => {
      dispatch({
        type: 'set_pending_timing_map',
        update,
        trackLabels: resolvedTrackLabels,
      });
    },
    [resolvedTrackLabels]
  );

  const setServerLastMergedAtMs = useCallback<Dispatch<SetStateAction<number>>>((update) => {
    dispatch({
      type: 'set_server_last_merged_at_ms',
      update,
    });
  }, []);

  const setWorkstationDirty = useCallback<Dispatch<SetStateAction<boolean>>>((update) => {
    dispatch({
      type: 'set_workstation_dirty',
      update,
    });
  }, []);

  const pendingTimingCount = useMemo(() => Object.keys(state.pendingTimingMap).length, [state.pendingTimingMap]);

  const documentPendingState = useMemo(
    () =>
      deriveDocumentPendingState({
        pendingVoiceEntries: state.pendingVoiceEntries,
        pendingTimingMap: state.pendingTimingMap,
        playbackBlockedVoiceIds: state.playbackBlockedVoiceIds,
        convertRows: Array.isArray(state.convertObj?.srt_convert_arr) ? (state.convertObj?.srt_convert_arr as any[]) : [],
        workstationDirty: state.workstationDirty,
        serverLastMergedAtMs: state.serverLastMergedAtMs,
      }),
    [
      state.convertObj?.srt_convert_arr,
      state.pendingTimingMap,
      state.pendingVoiceEntries,
      state.playbackBlockedVoiceIds,
      state.workstationDirty,
      state.serverLastMergedAtMs,
    ]
  );

  const documentDuration = state.convertObj?.processDurationSeconds ?? 0;

  useEffect(() => {
    dispatch({ type: 'reset_for_convert_id' });
  }, [convertId]);

  useEffect(() => {
    dispatch({
      type: 'remap_document',
      trackLabels: resolvedTrackLabels,
    });
  }, [resolvedTrackLabels]);

  const handlePendingVoiceIdsChange = useCallback((entries: Array<{ id: string; updatedAtMs: number }>) => {
    setPendingVoiceEntries(entries);
  }, []);

  const handlePlaybackBlockedVoiceIdsChange = useCallback((ids: string[]) => {
    setPlaybackBlockedVoiceIds(ids);
  }, []);

  const handleUpdateSubtitleAudio = useCallback((id: string, url: string, previewAudioUrl?: string) => {
    dispatch({
      type: 'update_subtitle_audio',
      id,
      url,
      previewAudioUrl,
    });
  }, []);

  const handleSubtitleTextChange = useCallback((id: string, text: string) => {
    dispatch({
      type: 'update_subtitle_text',
      id,
      text,
    });
  }, []);

  const handleSourceSubtitleTextChange = useCallback((sourceId: string, text: string) => {
    dispatch({
      type: 'update_source_subtitle_text',
      sourceId,
      text,
    });
  }, []);

  const handleSubtitleVoiceStatusChange = useCallback((id: string, voiceStatus: string, needsTts: boolean) => {
    dispatch({
      type: 'update_subtitle_voice_status',
      id,
      voiceStatus,
      needsTts,
    });
  }, []);

  const handleResetTiming = useCallback((id: string, sourceId: string, startMs: number, endMs: number) => {
    dispatch({
      type: 'reset_timing',
      id,
      sourceId,
      startMs,
      endMs,
    });
  }, []);

  const resetDocumentSessionState = useCallback(() => {
    dispatch({ type: 'reset_document_session_state' });
  }, []);

  return {
    convertObj: state.convertObj,
    setConvertObj,
    videoTrack: state.videoTrack,
    bgmTrack: state.bgmTrack,
    subtitleTrack: state.subtitleTrack,
    subtitleTrackOriginal: state.subtitleTrackOriginal,
    pendingVoiceEntries: state.pendingVoiceEntries,
    setPendingVoiceEntries,
    playbackBlockedVoiceIds: state.playbackBlockedVoiceIds,
    setPlaybackBlockedVoiceIds,
    pendingTimingMap: state.pendingTimingMap,
    setPendingTimingMap,
    pendingTimingCount,
    serverLastMergedAtMs: state.serverLastMergedAtMs,
    setServerLastMergedAtMs,
    workstationDirty: state.workstationDirty,
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
  };
}
