import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback transport owner module', () => {
  const source = readFileSync(new URL('./playback-transport-owner.ts', import.meta.url), 'utf8');
  const blockingOwnerSource = readFileSync(new URL('./playback-blocking-owner.ts', import.meta.url), 'utf8');
  const blockingRetryControllerSource = readFileSync(new URL('./playback-blocking-retry-controller.ts', import.meta.url), 'utf8');

  it('delegates blocked playback actions to dedicated blocking owner and retry controller', () => {
    expect(source).toContain("if (blockingState?.kind === 'network_failed') {");
    expect(source).toContain('args.handleRetryBlockedPlayback();');
    expect(source).toContain('args.handleLocateBlockedClip();');
    expect(blockingOwnerSource).toContain('const handleCancelBlockedPlayback = () => {');
    expect(blockingOwnerSource).toContain('args.locateBlockedClip();');
    expect(blockingOwnerSource).toContain('void args.retryBlockedPlayback();');
    expect(blockingRetryControllerSource).toContain("if (args.getSubtitleBackend() === 'media' || !resolved) {");
    expect(blockingRetryControllerSource).toContain("playReason: 'blocked-retry'");
    expect(blockingRetryControllerSource).toContain("args.dispatchTransport(nextMode === 'timeline' ? playTimeline() : markAuditionReady())");
  });

  it('owns play-pause gatekeeping for blocking, unavailable voice, and missing video startup', () => {
    expect(source).toContain("if (blockingState?.kind === 'network_failed') {");
    expect(source).toContain("if (blockingState?.kind === 'voice_unavailable') {");
    expect(source).toContain("toast.error(args.t('videoEditor.toast.addVideoFirst'));");
    expect(source).toContain('if (url && !args.cacheGetVoice(url)) {');
    expect(source).toContain("playReason: 'user-play'");
  });
});
