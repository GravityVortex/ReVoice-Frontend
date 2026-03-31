import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor unsaved dialog shell boundary', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate unsaved leave dialog rendering to VideoEditorUnsavedDialog', () => {
    const dialogSource = readFileSync(new URL('./video-editor-unsaved-dialog.tsx', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { VideoEditorUnsavedDialog } from './video-editor-unsaved-dialog';");
    expect(shellSource).toContain('<VideoEditorUnsavedDialog');
    expect(shellSource).not.toContain('<DialogContent showCloseButton={false} className="sm:max-w-md">');
    expect(shellSource).not.toContain("onOpenChange={(open) => {");

    expect(dialogSource).toContain('export function VideoEditorUnsavedDialog(');
    expect(dialogSource).toContain('open={props.open}');
    expect(dialogSource).toContain("showCloseButton={false}");
    expect(dialogSource).toContain('onClick={props.onConfirmLeave}');
  });
});
