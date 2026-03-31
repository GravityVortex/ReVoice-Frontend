import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor workspace shell boundary', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate workstation and preview composition to VideoEditorWorkspace', () => {
    const workspaceSource = readFileSync(new URL('./video-editor-workspace.tsx', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { VideoEditorWorkspace } from './video-editor-workspace';");
    expect(shellSource).toContain('<VideoEditorWorkspace');
    expect(shellSource).not.toContain('<ResizableSplitPanel');
    expect(shellSource).not.toContain('\n            <SubtitleWorkstation');
    expect(shellSource).not.toContain('<VideoPreviewPanel');

    expect(workspaceSource).toContain('export function VideoEditorWorkspace(');
    expect(workspaceSource).toContain('<ResizableSplitPanel');
    expect(workspaceSource).toContain('<SubtitleWorkstation');
    expect(workspaceSource).toContain('<VideoPreviewPanel');
    expect(workspaceSource).toContain('onVideoMergeStarted={props.onVideoMergeStarted}');
    expect(workspaceSource).toContain('onReloadFromServer={props.onReloadFromServer}');
    expect(workspaceSource).toContain('onSubtitleUpdate={props.onPreviewSubtitleCommit}');
    expect(workspaceSource).not.toContain('onSubtitleUpdate={props.onSubtitleTextChange}');
  });
});
