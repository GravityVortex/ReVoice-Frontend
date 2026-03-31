import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { selectVisibleVideoEditorBootstrapState } from './video-editor-bootstrap-state';

describe('use video editor bootstrap shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate bootstrap owner state to useVideoEditorBootstrap', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-bootstrap.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorBootstrap } from './runtime/bootstrap/use-video-editor-bootstrap';");
    expect(shellSource).toContain('} = useVideoEditorBootstrap({');
    expect(shellSource).not.toContain('createVideoEditorBootstrapState(');
    expect(shellSource).not.toContain('latestRequestRef');
    expect(shellSource).not.toContain('startVideoEditorBootstrapRequest(');
    expect(shellSource).not.toContain('resolveVideoEditorBootstrapSuccess(');

    expect(hookSource).toContain('const [bootstrapState, setBootstrapState] = useState(() => createVideoEditorBootstrapState(convertId));');
    expect(hookSource).toContain('const latestRequestRef = useRef({');
    expect(hookSource).toContain('startVideoEditorBootstrapRequest(prev, {');
    expect(hookSource).toContain('resolveVideoEditorBootstrapSuccess(prev, {');
    expect(hookSource).toContain('resolveVideoEditorBootstrapFailure(prev, {');
  });

  it('exposes the bootstrap api consumed by shell and merge/document hydration', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-bootstrap.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('isLoading,');
    expect(hookSource).toContain('error,');
    expect(hookSource).toContain('videoSource,');
    expect(hookSource).toContain('reloadConvertDetail,');
  });

  it('supports background detail reloads so workstation refresh cannot tear down unsaved local state', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-bootstrap.ts', import.meta.url), 'utf8');
    const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

    expect(hookSource).toContain("from '../../video-editor-reload-contract';");
    expect(hookSource).toContain('VideoEditorDetailReloadAction,');
    expect(hookSource).toContain('VideoEditorDetailReloadOptions,');
    expect(hookSource).toContain('VideoEditorDetailReloadResult,');
    expect(hookSource).toContain("const mode: VideoEditorDetailReloadResult['mode'] = options?.silent ? 'background' : 'blocking';");
    expect(hookSource).toContain("if (mode === 'blocking') {");
    expect(hookSource).toContain('return { ok: true, error: null, mode };');
    expect(hookSource).toContain("return { ok: false, error: err instanceof Error ? err.message : t('error.fetchFailed'), mode };");
    expect(shellSource).toContain('onReloadFromServer={() => reloadConvertDetail({ silent: true })}');
    expect(shellSource).toContain('onClick={() => void reloadConvertDetail()}');
  });

  it('publishes only the current task bootstrap state to the page shell', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-bootstrap.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('selectVisibleVideoEditorBootstrapState(bootstrapState, convertId)');
    expect(typeof selectVisibleVideoEditorBootstrapState).toBe('function');
  });

  it('times out and aborts stale bootstrap requests so the page cannot stay stuck on loading after a hanging network call', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-bootstrap.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain("import { fetchWithTimeout } from '../network/fetch-with-timeout';");
    expect(hookSource).toContain('const BOOTSTRAP_FETCH_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const bootstrapAbortRef = useRef<AbortController | null>(null);');
    expect(hookSource).toContain('bootstrapAbortRef.current?.abort();');
    expect(hookSource).toContain("const response = await fetchWithTimeout(`/api/video-task/editVideoAudiosubtitleDetail?taskMainId=${convertId}`, {");
    expect(hookSource).toContain('timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,');
    expect(hookSource).toContain('signal: abortController.signal,');
  });
});
