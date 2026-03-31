import { describe, expect, it } from 'vitest';

import {
  createVideoEditorBootstrapState,
  resolveVideoEditorBootstrapFailure,
  startVideoEditorBootstrapRequest,
} from './video-editor-bootstrap-state';

describe('video-editor-bootstrap-state', () => {
  it('keeps the current detail visible during a background reload', () => {
    const initial = {
      ...createVideoEditorBootstrapState('task-1'),
      isLoading: false,
      videoSource: { fileName: 'demo.mp4' },
      loadedTaskMainItem: { status: 20 },
    };

    const next = startVideoEditorBootstrapRequest(initial, {
      requestId: 1,
      convertId: 'task-1',
      mode: 'background',
    });

    expect(next.isLoading).toBe(false);
    expect(next.error).toBeNull();
    expect(next.videoSource).toEqual({ fileName: 'demo.mp4' });
    expect(next.loadedTaskMainItem).toEqual({ status: 20 });
  });

  it('surfaces a blocking reload failure but keeps background reload failures non-destructive', () => {
    const initial = {
      ...createVideoEditorBootstrapState('task-1'),
      isLoading: false,
      videoSource: { fileName: 'demo.mp4' },
      loadedTaskMainItem: { status: 20 },
    };

    const blocking = startVideoEditorBootstrapRequest(initial, {
      requestId: 1,
      convertId: 'task-1',
      mode: 'blocking',
    });
    const blockingFailure = resolveVideoEditorBootstrapFailure(blocking, {
      requestId: 1,
      convertId: 'task-1',
      error: 'boom',
    });

    expect(blockingFailure.error).toBe('boom');
    expect(blockingFailure.videoSource).toBeNull();
    expect(blockingFailure.loadedTaskMainItem).toBeNull();

    const background = startVideoEditorBootstrapRequest(initial, {
      requestId: 2,
      convertId: 'task-1',
      mode: 'background',
    });
    const backgroundFailure = resolveVideoEditorBootstrapFailure(background, {
      requestId: 2,
      convertId: 'task-1',
      error: 'boom',
    });

    expect(backgroundFailure.error).toBeNull();
    expect(backgroundFailure.videoSource).toEqual({ fileName: 'demo.mp4' });
    expect(backgroundFailure.loadedTaskMainItem).toEqual({ status: 20 });
  });
});
