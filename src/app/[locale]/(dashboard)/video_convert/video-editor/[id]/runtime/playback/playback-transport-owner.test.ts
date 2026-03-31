import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback transport owner module', () => {
  const source = readFileSync(new URL('./playback-transport-owner.ts', import.meta.url), 'utf8');

  it('owns blocked playback cancel and retry logic instead of keeping that state machine inline in the hook', () => {
    expect(source).toContain("if (blockingState.kind === 'network_failed') {");
    expect(source).toContain("if (args.refs.subtitleBackendRef.current === 'media' || !resolved) {");
    expect(source).toContain("playReason: 'blocked-retry'");
    expect(source).toContain("dispatchTransport(nextMode === 'timeline' ? playTimeline() : markAuditionReady())");
    expect(source).toContain('args.scrollToItem(resolved.clip.id);');
    expect(source).toContain('args.handleSeek(resolved.clip.startTime, false);');
  });

  it('owns play-pause gatekeeping for blocking, unavailable voice, and missing video startup', () => {
    expect(source).toContain("if (blockingState?.kind === 'network_failed') {");
    expect(source).toContain("if (blockingState?.kind === 'voice_unavailable') {");
    expect(source).toContain("toast.error(args.t('videoEditor.toast.addVideoFirst'));");
    expect(source).toContain('if (url && !args.cacheGetVoice(url)) {');
    expect(source).toContain("playReason: 'user-play'");
  });
});
