import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback runtime effects module', () => {
  const source = readFileSync(new URL('./playback-runtime-effects.ts', import.meta.url), 'utf8');

  it('owns buffering event wiring and paused prefetch coordination', () => {
    expect(source).toContain("videoEl.addEventListener('waiting', onBufferStart);");
    expect(source).toContain("videoEl.addEventListener('stalled', onBufferStart);");
    expect(source).toContain("videoEl.addEventListener('playing', onBufferEnd);");
    expect(source).toContain("videoEl.addEventListener('pause', onPauseLike);");
    expect(source).toContain("args.prefetchVoiceAroundTime(anchor, { count: args.getAdaptivePrefetchCount('pause'), signal: controller.signal });");
    expect(source).toContain('args.pausePrefetchAbortRef.current?.abort(args.abortReason);');
  });

  it('owns bgm sync and abort suppression effects so the hook can stay focused on owner handlers', () => {
    expect(source).toContain("window.addEventListener('unhandledrejection', suppressAbort);");
    expect(source).toContain("window.addEventListener('error', suppressAbortSync, true);");
    expect(source).toContain('if (Math.abs(bgm.currentTime - transportTime) > 0.45) {');
    expect(source).toContain("console.error('BGM play failed', error);");
  });
});
