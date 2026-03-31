import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor page shell structure', () => {
  it('keeps page.tsx as a thin route entry that delegates to page shell', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

    expect(source).toContain("import { VideoEditorPageShell } from './video-editor-page-shell';");
    expect(source).toContain('<VideoEditorPageShell');
  });

  it('consumes only the active document snapshot before handing state to downstream runtime owners', () => {
    const source = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

    expect(source).toContain('getActiveVideoEditorDocumentState({');
    expect(source).toContain('convertObj: activeConvertObj,');
    expect(source).toContain('videoTrack: activeVideoTrack,');
    expect(source).toContain('bgmTrack: activeBgmTrack,');
    expect(source).toContain('subtitleTrack: activeSubtitleTrack,');
    expect(source).toContain('subtitleTrackOriginal: activeSubtitleTrackOriginal,');
    expect(source).toContain('pendingTimingMap: activePendingTimingMap,');
    expect(source).toContain('serverLastMergedAtMs: activeServerLastMergedAtMs,');
  });
});
