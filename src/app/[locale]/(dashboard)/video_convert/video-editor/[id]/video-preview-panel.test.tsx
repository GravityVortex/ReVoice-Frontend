import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/shared/hooks/use-paused-video-prefetch', () => ({
  usePausedVideoPrefetch: () => undefined,
}));

import { VideoPreviewPanel } from './video-preview-panel';

describe('VideoPreviewPanel', () => {
  const source = readFileSync(new URL('./video-preview-panel.tsx', import.meta.url), 'utf8');

  it('renders the active subtitle from the transport snapshot', () => {
    const html = renderToStaticMarkup(
      <VideoPreviewPanel
        transportSnapshot={{
          currentTimeSec: 4,
          playbackStatus: 'paused',
          activeTimelineClipIndex: 1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: null,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 2,
          },
          {
            id: 'clip-2',
            type: 'audio',
            name: 'clip-2',
            text: '第二条字幕',
            startTime: 2,
            duration: 2,
          },
        ]}
      />
    );

    expect(html).toContain('第二条字幕');
    expect(html).not.toContain('第一条字幕');
  });

  it('renders a blocking overlay when playback is paused on an unavailable clip', () => {
    const html = renderToStaticMarkup(
      <VideoPreviewPanel
        transportSnapshot={{
          currentTimeSec: 4,
          playbackStatus: 'paused',
          activeTimelineClipIndex: 1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: {
            kind: 'voice_unavailable',
            clipIndex: 1,
            subtitleId: 'clip-2',
            reason: 'needs_regen',
          },
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 2,
          },
          {
            id: 'clip-2',
            type: 'audio',
            name: 'clip-2',
            text: '第二条字幕',
            startTime: 2,
            duration: 2,
          },
        ]}
      />
    );

    expect(html).toContain('playbackGate.title.voiceUnavailable');
    expect(html).toContain('playbackGate.action.locateClip');
    expect(html).toContain('data-gate-state="voice_unavailable"');
    expect(html).not.toContain('playbackGate.badge.voiceUnavailable');
    expect(html).not.toContain('Preview');
  });

  it('renders preview subtitles as non-draggable overlays when position editing is disabled', () => {
    const html = renderToStaticMarkup(
      <VideoPreviewPanel
        transportSnapshot={{
          currentTimeSec: 4,
          playbackStatus: 'paused',
          activeTimelineClipIndex: 0,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: null,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 2,
          },
        ]}
      />
    );

    expect(html).not.toContain('cursor-grab');
    expect(html).not.toContain('touch-none');
  });

  it('locks preview editing to the originally edited clip instead of remounting on active clip changes', () => {
    expect(source).toContain("import { resolvePreviewEditingSubtitle, resolvePreviewSubtitleCommitOutcome } from './video-preview-edit-session';");
    expect(source).toContain('resolvePreviewEditingSubtitle({');
    expect(source).toContain('editingSubtitleId: editingSubtitle,');
    expect(source).not.toContain('key={activeSubtitle.id}');
  });

  it('keeps the preview editor open when the workstation refuses the commit', () => {
    expect(source).toContain('const outcome = resolvePreviewSubtitleCommitOutcome({');
    expect(source).toContain("if (outcome.action === 'keep_editing') {");
    expect(source).toContain('subtitleInputRef.current?.focus();');
    expect(source).not.toContain('onSubtitleUpdate?.(activeSubtitle.id, editingText.trim());');
  });
});
