import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor loading state shell boundary', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate loading skeleton rendering to VideoEditorLoadingState', () => {
    const loadingSource = readFileSync(new URL('./video-editor-loading-state.tsx', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { VideoEditorLoadingState } from './video-editor-loading-state';");
    expect(shellSource).toContain('if (isLoading) return <VideoEditorLoadingState />;');
    expect(shellSource).not.toContain('function LoadingSkeleton()');
    expect(shellSource).not.toContain('<Skeleton className="h-14 w-full" />');

    expect(loadingSource).toContain('export function VideoEditorLoadingState()');
    expect(loadingSource).toContain('<Skeleton className="h-14 w-full" />');
  });
});
