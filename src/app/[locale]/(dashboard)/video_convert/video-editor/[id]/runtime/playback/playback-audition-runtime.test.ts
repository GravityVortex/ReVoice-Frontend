import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback audition runtime module', () => {
  const source = readFileSync(new URL('./playback-audition-runtime.ts', import.meta.url), 'utf8');

  it('owns queued next-clip audition scheduling and logging instead of keeping that effect inline in the hook', () => {
    expect(source).toContain('const nextIndex = args.pendingNextClipIndex;');
    expect(source).toContain('const nextMode = args.pendingNextMode;');
    expect(source).toContain("args.logEditorTransport('debug', 'queue-next-audition', {");
    expect(source).toContain('args.dispatchTransport(clearPendingNextClip());');
    expect(source).toContain('void args.handleAuditionRequestPlay(nextIndex, nextMode);');
  });

  it('keeps audition stop ref wiring in one place for downstream owners', () => {
    expect(source).toContain('args.handleAuditionStopRef.current = args.handleAuditionStop;');
  });
});
