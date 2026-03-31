import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor layout shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate layout owner state to useVideoEditorLayout', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-layout.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorLayout } from './runtime/layout/use-video-editor-layout';");
    expect(shellSource).toContain('} = useVideoEditorLayout({');
    expect(shellSource).not.toContain('const [zoom, setZoom] = useState(2);');
    expect(shellSource).not.toContain("const [timelineHeightPx, setTimelineHeightPx] = useState(175);");
    expect(shellSource).not.toContain('const bodyRef = useRef<HTMLDivElement | null>(null);');
    expect(shellSource).not.toContain('const handleTimelineResizePointerDown = useCallback(');

    expect(hookSource).toContain('const [zoom, setZoom] = useState(2);');
    expect(hookSource).toContain('const [timelineHeightPx, setTimelineHeightPx] = useState(175);');
    expect(hookSource).toContain('const bodyRef = useRef<HTMLDivElement | null>(null);');
    expect(hookSource).not.toContain('const [timingChangedHint, setTimingChangedHint] = useState(false);');
    expect(hookSource).not.toContain('const handleDocumentTimingTrackChanged = useCallback(() => {');
    expect(hookSource).toContain('const handleTimelineResizePointerDown = useCallback(');
  });

  it('exposes the layout api consumed by document, workspace, and timeline dock', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-layout.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('zoom,');
    expect(hookSource).toContain('setZoom,');
    expect(hookSource).toContain('bodyRef,');
    expect(hookSource).toContain('timelineHeightPx,');
    expect(hookSource).toContain('timelineResizeHandleLabel,');
    expect(hookSource).toContain('handleTimelineResizePointerDown,');
    expect(hookSource).toContain('handleTimelineResizePointerMove,');
    expect(hookSource).toContain('handleTimelineResizePointerUp,');
    expect(hookSource).toContain('handleTimelineResizePointerCancel,');
  });
});
