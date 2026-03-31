'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { ConvertObj, SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';

import type { EditorSubtitleTrackItem } from '../../subtitle-editor-state';
import {
  mapConvertObjToEditorDocument,
  type VideoEditorDocumentTrackLabels,
} from './video-editor-document-mappers';
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
  const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);
  const [videoTrack, setVideoTrack] = useState<TrackItem[]>([]);
  const [bgmTrack, setBgmTrack] = useState<TrackItem[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);
  const [subtitleTrackOriginal, setSubtitleTrackOriginal] = useState<SubtitleTrackItem[]>([]);
  const [pendingVoiceEntries, setPendingVoiceEntries] = useState<Array<{ id: string; updatedAtMs: number }>>([]);
  const [playbackBlockedVoiceIds, setPlaybackBlockedVoiceIds] = useState<string[]>([]);
  const [pendingTimingMap, setPendingTimingMap] = useState<Record<string, { startMs: number; endMs: number }>>({});
  const [serverLastMergedAtMs, setServerLastMergedAtMs] = useState(0);
  const [workstationDirty, setWorkstationDirty] = useState(false);

  const subtitleTrackRef = useRef<SubtitleTrackItem[]>([]);
  const subtitleTrackOriginalRef = useRef<SubtitleTrackItem[]>([]);
  const mappedDocumentIdRef = useRef<string | null>(null);

  useEffect(() => {
    subtitleTrackRef.current = subtitleTrack;
  }, [subtitleTrack]);

  useEffect(() => {
    subtitleTrackOriginalRef.current = subtitleTrackOriginal;
  }, [subtitleTrackOriginal]);

  const pendingTimingCount = useMemo(() => Object.keys(pendingTimingMap).length, [pendingTimingMap]);

  const documentPendingState = useMemo(
    () =>
      deriveDocumentPendingState({
        pendingVoiceEntries,
        pendingTimingMap,
        playbackBlockedVoiceIds,
        convertRows: Array.isArray(convertObj?.srt_convert_arr) ? (convertObj?.srt_convert_arr as any[]) : [],
        workstationDirty,
        serverLastMergedAtMs,
      }),
    [convertObj?.srt_convert_arr, pendingTimingMap, pendingVoiceEntries, playbackBlockedVoiceIds, workstationDirty, serverLastMergedAtMs]
  );

  const documentDuration = convertObj?.processDurationSeconds ?? 0;

  useEffect(() => {
    mappedDocumentIdRef.current = null;
    setWorkstationDirty(false);
  }, [convertId]);

  useEffect(() => {
    const currentDocumentId = typeof convertObj?.id === 'string' ? convertObj.id : null;
    const mappedDocument = mapConvertObjToEditorDocument({
      convertObj,
      previousDocumentId: mappedDocumentIdRef.current,
      trackLabels,
      pendingTimingMap,
      previousSubtitleTrack: subtitleTrackRef.current as EditorSubtitleTrackItem[],
      previousSubtitleTrackOriginal: subtitleTrackOriginalRef.current as EditorSubtitleTrackItem[],
    });

    setVideoTrack(mappedDocument.videoTrack);
    setBgmTrack(mappedDocument.bgmTrack);
    setSubtitleTrack(mappedDocument.subtitleTrack);
    setSubtitleTrackOriginal(mappedDocument.subtitleTrackOriginal);
    mappedDocumentIdRef.current = currentDocumentId;
  }, [convertObj, pendingTimingMap, trackLabels.bgmTrackName, trackLabels.videoTrackName]);

  const handlePendingVoiceIdsChange = useCallback((entries: Array<{ id: string; updatedAtMs: number }>) => {
    setPendingVoiceEntries(entries);
  }, []);

  const handlePlaybackBlockedVoiceIdsChange = useCallback((ids: string[]) => {
    setPlaybackBlockedVoiceIds(ids);
  }, []);

  const handleUpdateSubtitleAudio = useCallback((id: string, url: string, previewAudioUrl?: string) => {
    setSubtitleTrack((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              audioUrl: url,
              previewAudioUrl: previewAudioUrl ?? url,
            }
          : item
      )
    );
  }, []);

  const handleSubtitleTextChange = useCallback((id: string, text: string) => {
    setSubtitleTrack((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)));
  }, []);

  const handleSourceSubtitleTextChange = useCallback((sourceId: string, text: string) => {
    setSubtitleTrackOriginal((prev) => prev.map((item) => (item.id === sourceId ? { ...item, text } : item)));

    setConvertObj((prevObj) => {
      if (!prevObj) return prevObj;
      const rows = (prevObj.srt_source_arr || []) as any[];
      const nextRows = rows.map((row) => (row?.id === sourceId ? { ...row, txt: text } : row));
      return { ...prevObj, srt_source_arr: nextRows };
    });
  }, []);

  const handleSubtitleVoiceStatusChange = useCallback((id: string, voiceStatus: string, needsTts: boolean) => {
    setConvertObj((prevObj) => {
      if (!prevObj) return prevObj;
      const rows = (prevObj.srt_convert_arr || []) as any[];
      const nextRows = rows.map((row) => (row?.id === id ? { ...row, vap_voice_status: voiceStatus, vap_needs_tts: needsTts } : row));
      return { ...prevObj, srt_convert_arr: nextRows };
    });
  }, []);

  const handleResetTiming = useCallback((id: string, sourceId: string, startMs: number, endMs: number) => {
    setPendingTimingMap((prev) => ({ ...prev, [id]: { startMs, endMs } }));

    setConvertObj((prevObj) => {
      if (!prevObj) return prevObj;
      const convertRows = (prevObj.srt_convert_arr || []) as any[];
      const sourceRows = (prevObj.srt_source_arr || []) as any[];
      const sourceRow = sourceRows.find((row) => row?.id === sourceId);
      if (!sourceRow) return prevObj;
      const nextRows = convertRows.map((row) => (row?.id === id ? { ...row, start: sourceRow.start, end: sourceRow.end } : row));
      return { ...prevObj, srt_convert_arr: nextRows };
    });

    setSubtitleTrack((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              startTime: startMs / 1000,
              duration: Math.max(0, (endMs - startMs) / 1000),
            }
          : item
      )
    );
  }, []);

  const resetDocumentSessionState = useCallback(() => {
    setPendingVoiceEntries([]);
    setPlaybackBlockedVoiceIds([]);
    setPendingTimingMap({});
    setServerLastMergedAtMs(0);
    setWorkstationDirty(false);
  }, []);

  return {
    convertObj,
    setConvertObj,
    videoTrack,
    bgmTrack,
    subtitleTrack,
    subtitleTrackOriginal,
    pendingVoiceEntries,
    setPendingVoiceEntries,
    playbackBlockedVoiceIds,
    setPlaybackBlockedVoiceIds,
    pendingTimingMap,
    setPendingTimingMap,
    pendingTimingCount,
    serverLastMergedAtMs,
    setServerLastMergedAtMs,
    workstationDirty,
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
