'use client';

type TaskMainHydratePayload = {
  status?: unknown;
  errorMessage?: unknown;
  progress?: unknown;
  currentStep?: unknown;
} | null;

export type VideoEditorBootstrapState = {
  requestId: number;
  requestConvertId: string;
  requestMode: 'blocking' | 'background';
  isLoading: boolean;
  error: string | null;
  videoSource: Record<string, any> | null;
  loadedTaskMainItem: TaskMainHydratePayload;
};

export function createVideoEditorBootstrapState(convertId: string): VideoEditorBootstrapState {
  return {
    requestId: 0,
    requestConvertId: convertId,
    requestMode: 'blocking',
    isLoading: Boolean(convertId),
    error: null,
    videoSource: null,
    loadedTaskMainItem: null,
  };
}

export function startVideoEditorBootstrapRequest(
  state: VideoEditorBootstrapState,
  args: {
    requestId: number;
    convertId: string;
    mode: 'blocking' | 'background';
  }
): VideoEditorBootstrapState {
  if (args.mode === 'background') {
    return {
      ...state,
      requestId: args.requestId,
      requestConvertId: args.convertId,
      requestMode: args.mode,
      isLoading: false,
      error: null,
    };
  }

  return {
    ...state,
    requestId: args.requestId,
    requestConvertId: args.convertId,
    requestMode: args.mode,
    isLoading: true,
    error: null,
    videoSource: null,
    loadedTaskMainItem: null,
  };
}

export function resolveVideoEditorBootstrapSuccess(
  state: VideoEditorBootstrapState,
  args: {
    requestId: number;
    convertId: string;
    videoSource: Record<string, any> | null;
    loadedTaskMainItem: TaskMainHydratePayload;
  }
): VideoEditorBootstrapState {
  if (state.requestId !== args.requestId || state.requestConvertId !== args.convertId) {
    return state;
  }

  return {
    ...state,
    requestMode: 'blocking',
    isLoading: false,
    error: null,
    videoSource: args.videoSource,
    loadedTaskMainItem: args.loadedTaskMainItem,
  };
}

export function resolveVideoEditorBootstrapFailure(
  state: VideoEditorBootstrapState,
  args: {
    requestId: number;
    convertId: string;
    error: string;
  }
): VideoEditorBootstrapState {
  if (state.requestId !== args.requestId || state.requestConvertId !== args.convertId) {
    return state;
  }

  return {
    ...state,
    requestMode: 'blocking',
    isLoading: false,
    error: state.requestMode === 'background' ? null : args.error,
    videoSource: state.requestMode === 'background' ? state.videoSource : null,
    loadedTaskMainItem: state.requestMode === 'background' ? state.loadedTaskMainItem : null,
  };
}

export function selectVisibleVideoEditorBootstrapState(state: VideoEditorBootstrapState, activeConvertId: string) {
  if (state.requestConvertId !== activeConvertId) {
    return {
      isLoading: true,
      error: null,
      videoSource: null,
      loadedTaskMainItem: null,
    };
  }

  return {
    isLoading: state.isLoading,
    error: state.error,
    videoSource: state.videoSource,
    loadedTaskMainItem: state.loadedTaskMainItem,
  };
}
