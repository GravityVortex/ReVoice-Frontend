import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback seek owner module', () => {
  const source = readFileSync(new URL('./playback-seek-owner.ts', import.meta.url), 'utf8');

  it('owns drag lifecycle cleanup and paused transport syncing for seek interactions', () => {
    expect(source).toContain('seekDragActiveRef.current = true;');
    expect(source).toContain('args.cancelUpdateLoop();');
    expect(source).toContain('args.setPlaybackBlockingState(null);');
    expect(source).toContain('args.dispatchTransport(_seekTransport(dragTime));');
    expect(source).toContain('args.refs.seekDragRafRef.current = requestAnimationFrame(() => {');
    expect(source).toContain('args.stopAllSubtitleAudio();');
  });

  it('keeps subtitle seek as a thin wrapper over the same owner logic', () => {
    expect(source).toContain('handleSeek(time, false);');
    expect(source).toContain('return {');
    expect(source).toContain('handleSeek,');
    expect(source).toContain('handleSeekToSubtitle,');
  });
});
