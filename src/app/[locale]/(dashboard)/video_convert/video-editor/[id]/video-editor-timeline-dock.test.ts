import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor timeline dock shell boundary', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate timeline dock rendering to VideoEditorTimelineDock', () => {
    const dockSource = readFileSync(new URL('./video-editor-timeline-dock.tsx', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { VideoEditorTimelineDock } from './video-editor-timeline-dock';");
    expect(shellSource).toContain('<VideoEditorTimelineDock');
    expect(shellSource).not.toContain('<TimelinePanel');
    expect(shellSource).not.toContain('role="separator"');

    expect(dockSource).toContain('export function VideoEditorTimelineDock(');
    expect(dockSource).toContain('role="separator"');
    expect(dockSource).toContain('<TimelinePanel');
    expect(dockSource).toContain('splitTooltipText={props.splitTooltipText}');
    expect(dockSource).not.toContain('onSubtitleTrackChange={props.onSubtitleTrackChange}');
    expect(dockSource).not.toContain('timingChangedHint={props.timingChangedHint}');
  });
});
