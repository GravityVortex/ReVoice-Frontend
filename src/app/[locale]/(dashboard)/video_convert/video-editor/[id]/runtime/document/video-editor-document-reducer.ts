import type { ConvertObj, SubtitleTrackItem, TrackItem } from '@/shared/components/video-editor/types';

import type { EditorSubtitleTrackItem } from '../../subtitle-editor-state';
import {
  mapConvertObjToEditorDocument,
  type VideoEditorDocumentTrackLabels,
} from './video-editor-document-mappers';
import type { PendingTimingEntry, PendingVoiceEntry } from './video-editor-document-selectors';

type StateUpdate<T> = T | ((prev: T) => T);

export type VideoEditorDocumentState = {
  convertObj: ConvertObj | null;
  videoTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  pendingVoiceEntries: PendingVoiceEntry[];
  playbackBlockedVoiceIds: string[];
  pendingTimingMap: Record<string, PendingTimingEntry>;
  serverLastMergedAtMs: number;
  workstationDirty: boolean;
  mappedDocumentId: string | null;
};

export type VideoEditorDocumentAction =
  | {
      type: 'set_convert_obj';
      update: StateUpdate<ConvertObj | null>;
      trackLabels: VideoEditorDocumentTrackLabels;
    }
  | {
      type: 'set_pending_voice_entries';
      update: StateUpdate<PendingVoiceEntry[]>;
    }
  | {
      type: 'set_playback_blocked_voice_ids';
      update: StateUpdate<string[]>;
    }
  | {
      type: 'set_pending_timing_map';
      update: StateUpdate<Record<string, PendingTimingEntry>>;
      trackLabels: VideoEditorDocumentTrackLabels;
    }
  | {
      type: 'set_server_last_merged_at_ms';
      update: StateUpdate<number>;
    }
  | {
      type: 'set_workstation_dirty';
      update: StateUpdate<boolean>;
    }
  | {
      type: 'remap_document';
      trackLabels: VideoEditorDocumentTrackLabels;
    }
  | {
      type: 'update_subtitle_audio';
      id: string;
      url: string;
      previewAudioUrl?: string;
    }
  | {
      type: 'update_subtitle_text';
      id: string;
      text: string;
    }
  | {
      type: 'update_source_subtitle_text';
      sourceId: string;
      text: string;
    }
  | {
      type: 'update_subtitle_voice_status';
      id: string;
      voiceStatus: string;
      needsTts: boolean;
    }
  | {
      type: 'reset_timing';
      id: string;
      sourceId: string;
      startMs: number;
      endMs: number;
    }
  | {
      type: 'reset_document_session_state';
    }
  | {
      type: 'reset_for_convert_id';
    };

function resolveStateUpdate<T>(current: T, update: StateUpdate<T>) {
  return typeof update === 'function' ? (update as (prev: T) => T)(current) : update;
}

function remapDocumentState(args: {
  state: VideoEditorDocumentState;
  trackLabels: VideoEditorDocumentTrackLabels;
  nextConvertObj: ConvertObj | null;
  nextPendingTimingMap: Record<string, PendingTimingEntry>;
}) {
  const { state, trackLabels, nextConvertObj, nextPendingTimingMap } = args;
  const mappedDocument = mapConvertObjToEditorDocument({
    convertObj: nextConvertObj,
    previousDocumentId: state.mappedDocumentId,
    trackLabels,
    pendingTimingMap: nextPendingTimingMap,
    previousSubtitleTrack: state.subtitleTrack as EditorSubtitleTrackItem[],
    previousSubtitleTrackOriginal: state.subtitleTrackOriginal as EditorSubtitleTrackItem[],
  });

  return {
    ...state,
    convertObj: nextConvertObj,
    videoTrack: mappedDocument.videoTrack,
    bgmTrack: mappedDocument.bgmTrack,
    subtitleTrack: mappedDocument.subtitleTrack,
    subtitleTrackOriginal: mappedDocument.subtitleTrackOriginal,
    pendingTimingMap: nextPendingTimingMap,
    mappedDocumentId: typeof nextConvertObj?.id === 'string' ? nextConvertObj.id : null,
  };
}

export function createInitialVideoEditorDocumentState(): VideoEditorDocumentState {
  return {
    convertObj: null,
    videoTrack: [],
    bgmTrack: [],
    subtitleTrack: [],
    subtitleTrackOriginal: [],
    pendingVoiceEntries: [],
    playbackBlockedVoiceIds: [],
    pendingTimingMap: {},
    serverLastMergedAtMs: 0,
    workstationDirty: false,
    mappedDocumentId: null,
  };
}

export function videoEditorDocumentReducer(
  state: VideoEditorDocumentState,
  action: VideoEditorDocumentAction
): VideoEditorDocumentState {
  switch (action.type) {
    case 'set_convert_obj': {
      const nextConvertObj = resolveStateUpdate(state.convertObj, action.update);
      return remapDocumentState({
        state,
        trackLabels: action.trackLabels,
        nextConvertObj,
        nextPendingTimingMap: state.pendingTimingMap,
      });
    }

    case 'set_pending_voice_entries':
      return {
        ...state,
        pendingVoiceEntries: resolveStateUpdate(state.pendingVoiceEntries, action.update),
      };

    case 'set_playback_blocked_voice_ids':
      return {
        ...state,
        playbackBlockedVoiceIds: resolveStateUpdate(state.playbackBlockedVoiceIds, action.update),
      };

    case 'set_pending_timing_map': {
      const nextPendingTimingMap = resolveStateUpdate(state.pendingTimingMap, action.update);
      return remapDocumentState({
        state,
        trackLabels: action.trackLabels,
        nextConvertObj: state.convertObj,
        nextPendingTimingMap,
      });
    }

    case 'set_server_last_merged_at_ms':
      return {
        ...state,
        serverLastMergedAtMs: resolveStateUpdate(state.serverLastMergedAtMs, action.update),
      };

    case 'set_workstation_dirty':
      return {
        ...state,
        workstationDirty: resolveStateUpdate(state.workstationDirty, action.update),
      };

    case 'remap_document':
      return remapDocumentState({
        state,
        trackLabels: action.trackLabels,
        nextConvertObj: state.convertObj,
        nextPendingTimingMap: state.pendingTimingMap,
      });

    case 'update_subtitle_audio':
      return {
        ...state,
        subtitleTrack: state.subtitleTrack.map((item) =>
          item.id === action.id
            ? {
                ...item,
                audioUrl: action.url,
                previewAudioUrl: action.previewAudioUrl ?? action.url,
              }
            : item
        ),
      };

    case 'update_subtitle_text':
      return {
        ...state,
        subtitleTrack: state.subtitleTrack.map((item) => (item.id === action.id ? { ...item, text: action.text } : item)),
      };

    case 'update_source_subtitle_text':
      return {
        ...state,
        subtitleTrackOriginal: state.subtitleTrackOriginal.map((item) =>
          item.id === action.sourceId ? { ...item, text: action.text } : item
        ),
        convertObj: state.convertObj
          ? {
              ...state.convertObj,
              srt_source_arr: ((state.convertObj.srt_source_arr || []) as any[]).map((row) =>
                row?.id === action.sourceId ? { ...row, txt: action.text } : row
              ),
            }
          : state.convertObj,
      };

    case 'update_subtitle_voice_status':
      return {
        ...state,
        convertObj: state.convertObj
          ? {
              ...state.convertObj,
              srt_convert_arr: ((state.convertObj.srt_convert_arr || []) as any[]).map((row) =>
                row?.id === action.id
                  ? { ...row, vap_voice_status: action.voiceStatus, vap_needs_tts: action.needsTts }
                  : row
              ),
            }
          : state.convertObj,
      };

    case 'reset_timing': {
      const nextPendingTimingMap = {
        ...state.pendingTimingMap,
        [action.id]: {
          startMs: action.startMs,
          endMs: action.endMs,
        },
      };
      const sourceRows = ((state.convertObj?.srt_source_arr || []) as any[]) ?? [];
      const sourceRow = sourceRows.find((row) => row?.id === action.sourceId);

      return {
        ...state,
        pendingTimingMap: nextPendingTimingMap,
        convertObj: state.convertObj
          ? {
              ...state.convertObj,
              srt_convert_arr: ((state.convertObj.srt_convert_arr || []) as any[]).map((row) =>
                row?.id === action.id && sourceRow ? { ...row, start: sourceRow.start, end: sourceRow.end } : row
              ),
            }
          : state.convertObj,
        subtitleTrack: state.subtitleTrack.map((item) =>
          item.id === action.id
            ? {
                ...item,
                startTime: action.startMs / 1000,
                duration: Math.max(0, (action.endMs - action.startMs) / 1000),
              }
            : item
        ),
      };
    }

    case 'reset_document_session_state':
      return {
        ...state,
        pendingVoiceEntries: [],
        playbackBlockedVoiceIds: [],
        pendingTimingMap: {},
        serverLastMergedAtMs: 0,
        workstationDirty: false,
      };

    case 'reset_for_convert_id':
      return {
        ...state,
        mappedDocumentId: null,
        workstationDirty: false,
      };

    default:
      return state;
  }
}
