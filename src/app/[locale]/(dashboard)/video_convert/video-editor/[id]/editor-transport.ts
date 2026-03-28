export type EditorTransportMode = 'timeline' | 'audition_source' | 'audition_convert';

export type EditorTransportStatus = 'paused' | 'buffering' | 'playing';

export type EditorAuditionMode = 'source' | 'convert';

export type EditorTransportState = {
  mode: EditorTransportMode;
  status: EditorTransportStatus;
  transportTimeSec: number;
  activeClipIndex: number | null;
  auditionStopAtSec: number | null;
  autoPlayNext: boolean;
  pendingNextClipIndex: number | null;
  pendingNextMode: EditorAuditionMode | null;
};

export type EditorTransportSnapshot = {
  currentTimeSec: number;
  playbackStatus: EditorTransportStatus;
  activeTimelineClipIndex: number;
  activeAuditionClipIndex: number | null;
  auditionMode: EditorAuditionMode | null;
  autoPlayNext: boolean;
};

type StartAuditionPayload = {
  index: number;
  timeSec: number;
  stopAtSec: number | null;
};

export type EditorTransportAction =
  | { type: 'start_source_audition'; payload: StartAuditionPayload }
  | { type: 'start_convert_audition'; payload: StartAuditionPayload }
  | { type: 'audition_ready' }
  | { type: 'audition_ended_naturally' }
  | { type: 'stop_audition' }
  | { type: 'set_auto_play_next'; payload: { value: boolean } }
  | { type: 'clear_pending_next_clip' }
  | { type: 'sync_transport_time'; payload: { timeSec: number } }
  | { type: 'seek_transport'; payload: { timeSec: number } }
  | { type: 'set_active_clip_index'; payload: { index: number | null } }
  | { type: 'play_timeline' }
  | { type: 'pause_timeline' };

export function createInitialTransportState(
  overrides?: Partial<EditorTransportState>
): EditorTransportState {
  return {
    mode: 'timeline',
    status: 'paused',
    transportTimeSec: 0,
    activeClipIndex: null,
    auditionStopAtSec: null,
    autoPlayNext: false,
    pendingNextClipIndex: null,
    pendingNextMode: null,
    ...overrides,
  };
}

function finishAudition(
  state: EditorTransportState,
  opts?: { naturalEnd?: boolean }
): EditorTransportState {
  const shouldQueueNext =
    Boolean(opts?.naturalEnd) &&
    state.autoPlayNext &&
    state.activeClipIndex != null &&
    isAuditioning(state);

  return {
    ...state,
    mode: 'timeline',
    status: 'paused',
    activeClipIndex: null,
    auditionStopAtSec: null,
    pendingNextClipIndex: shouldQueueNext ? state.activeClipIndex + 1 : null,
    pendingNextMode: shouldQueueNext
      ? state.mode === 'audition_source'
        ? 'source'
        : 'convert'
      : null,
  };
}

export function transportReducer(
  state: EditorTransportState,
  action: EditorTransportAction
): EditorTransportState {
  switch (action.type) {
    case 'start_source_audition':
      return {
        ...state,
        mode: 'audition_source',
        status: 'buffering',
        transportTimeSec: action.payload.timeSec,
        activeClipIndex: action.payload.index,
        auditionStopAtSec: action.payload.stopAtSec,
        pendingNextClipIndex: null,
        pendingNextMode: null,
      };
    case 'start_convert_audition':
      return {
        ...state,
        mode: 'audition_convert',
        status: 'buffering',
        transportTimeSec: action.payload.timeSec,
        activeClipIndex: action.payload.index,
        auditionStopAtSec: action.payload.stopAtSec,
        pendingNextClipIndex: null,
        pendingNextMode: null,
      };
    case 'audition_ready':
      if (!isAuditioning(state)) return state;
      return {
        ...state,
        status: 'playing',
      };
    case 'audition_ended_naturally':
      return finishAudition(state, { naturalEnd: true });
    case 'stop_audition':
      return finishAudition(state);
    case 'set_auto_play_next':
      return {
        ...state,
        autoPlayNext: action.payload.value,
      };
    case 'clear_pending_next_clip':
      return {
        ...state,
        pendingNextClipIndex: null,
        pendingNextMode: null,
      };
    case 'sync_transport_time':
    case 'seek_transport':
      return {
        ...state,
        transportTimeSec: action.payload.timeSec,
      };
    case 'set_active_clip_index':
      return {
        ...state,
        activeClipIndex: action.payload.index,
      };
    case 'play_timeline':
      if (isAuditioning(state)) return state;
      return {
        ...state,
        mode: 'timeline',
        status: 'playing',
      };
    case 'pause_timeline':
      if (isAuditioning(state)) return state;
      return {
        ...state,
        mode: 'timeline',
        status: 'paused',
      };
    default:
      return state;
  }
}

export function startSourceAudition(payload: StartAuditionPayload): EditorTransportAction {
  return { type: 'start_source_audition', payload };
}

export function startConvertAudition(payload: StartAuditionPayload): EditorTransportAction {
  return { type: 'start_convert_audition', payload };
}

export function auditionReady(): EditorTransportAction {
  return { type: 'audition_ready' };
}

export function auditionEndedNaturally(): EditorTransportAction {
  return { type: 'audition_ended_naturally' };
}

export function stopAudition(): EditorTransportAction {
  return { type: 'stop_audition' };
}

export function setAutoPlayNext(value: boolean): EditorTransportAction {
  return { type: 'set_auto_play_next', payload: { value } };
}

export function clearPendingNextClip(): EditorTransportAction {
  return { type: 'clear_pending_next_clip' };
}

export function syncTransportTime(timeSec: number): EditorTransportAction {
  return { type: 'sync_transport_time', payload: { timeSec } };
}

export function seekTransport(timeSec: number): EditorTransportAction {
  return { type: 'seek_transport', payload: { timeSec } };
}

export function setActiveClipIndex(index: number | null): EditorTransportAction {
  return { type: 'set_active_clip_index', payload: { index } };
}

export function playTimeline(): EditorTransportAction {
  return { type: 'play_timeline' };
}

export function pauseTimeline(): EditorTransportAction {
  return { type: 'pause_timeline' };
}

export function isAuditioning(state: EditorTransportState) {
  return state.mode === 'audition_source' || state.mode === 'audition_convert';
}

export function getAuditionStopAtSec(state: EditorTransportState) {
  return isAuditioning(state) ? state.auditionStopAtSec : null;
}

export function getActiveClipIndex(state: EditorTransportState) {
  return state.activeClipIndex;
}
