import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('VideoEditorPage keybindings', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('registers global editor shortcuts through a dedicated keybindings hook', () => {
    const hookSource = readFileSync(new URL('./runtime/keybindings/use-video-editor-keybindings.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorKeybindings } from './runtime/keybindings/use-video-editor-keybindings';");
    expect(shellSource).toContain('useVideoEditorKeybindings({');
    expect(shellSource).not.toContain("window.addEventListener('keydown', handleEditorKeyDown);");
    expect(shellSource).not.toContain("e.code === 'Space'");
    expect(shellSource).not.toContain("e.code === 'KeyZ'");

    expect(hookSource).toContain("window.addEventListener('keydown', handleEditorKeyDown);");
    expect(hookSource).toContain("e.code === 'Space'");
    expect(hookSource).toContain("e.code === 'KeyZ'");
  });

  it('ignores shortcut handling when focus is inside interactive controls such as buttons, dialogs, or menus', () => {
    const hookSource = readFileSync(new URL('./runtime/keybindings/use-video-editor-keybindings.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('function shouldIgnoreEditorKeybindingTarget(');
    expect(hookSource).toContain('target.closest(');
    expect(hookSource).toContain('button, a[href], summary');
    expect(hookSource).toContain("[role=\"dialog\"]");
    expect(hookSource).toContain("[role=\"menuitem\"]");
    expect(hookSource).toContain("if (shouldIgnoreEditorKeybindingTarget(target)) return;");
  });
});
