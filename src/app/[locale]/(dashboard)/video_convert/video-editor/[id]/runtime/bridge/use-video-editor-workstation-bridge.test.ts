import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor workstation bridge shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate workstation ref bridge actions to useVideoEditorWorkstationBridge', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-workstation-bridge.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain(
      "import { useVideoEditorWorkstationBridge } from './runtime/bridge/use-video-editor-workstation-bridge';"
    );
    expect(shellSource).toContain('useVideoEditorWorkstationBridge();');
    expect(shellSource).not.toContain('const workstationRef = useRef<SubtitleWorkstationHandle>(null);');
    expect(shellSource).not.toContain('prepareForVideoMerge: async () => workstationRef.current?.prepareForVideoMerge(),');
    expect(shellSource).not.toContain('requestVideoSave: async () => workstationRef.current?.onVideoSaveClick(),');
    expect(shellSource).not.toContain('prepareForStructuralEdit: async () => workstationRef.current?.prepareForStructuralEdit(),');
    expect(shellSource).not.toContain('workstationRef.current?.scrollToItem(id);');

    expect(hookSource).toContain('const workstationRef = useRef<SubtitleWorkstationHandle>(null);');
    expect(hookSource).toContain('const prepareForVideoMerge = useCallback(async () => workstationRef.current?.prepareForVideoMerge(), []);');
    expect(hookSource).toContain('const requestVideoSave = useCallback(async () => workstationRef.current?.onVideoSaveClick(), []);');
    expect(hookSource).toContain('const prepareForStructuralEdit = useCallback(async () => workstationRef.current?.prepareForStructuralEdit(), []);');
    expect(hookSource).toContain('const scrollToWorkstationItem = useCallback((id: string) => {');
  });

  it('exposes the workstation bridge api consumed by playback, merge, structural, and workspace', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-workstation-bridge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('workstationRef,');
    expect(hookSource).toContain('scrollToWorkstationItem,');
    expect(hookSource).toContain('prepareForVideoMerge,');
    expect(hookSource).toContain('requestVideoSave,');
    expect(hookSource).toContain('prepareForStructuralEdit,');
  });
});
