import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback session owner module', () => {
  const source = readFileSync(new URL('./playback-session-owner.ts', import.meta.url), 'utf8');

  it('owns playback session ref synchronization and media bootstrap effects', () => {
    expect(source).toContain('args.refs.transportStateRef.current = args.transportState;');
    expect(source).toContain('args.refs.isAutoPlayNextRef.current = args.transportState.autoPlayNext;');
    expect(source).toContain('args.refs.bgmAudioRef.current = new Audio();');
    expect(source).toContain('args.audioRefArr.forEach((ref) => {');
    expect(source).toContain('args.refs.lastBgmUrlRef.current = url;');
    expect(source).toContain('const key = `revoice-preconnect:${origin}`;');
  });

  it('owns convert-task reset and audio context cleanup so the shell hook stays thin', () => {
    expect(source).toContain('args.abortAllVoiceInflight();');
    expect(source).toContain('args.stopWebAudioVoice();');
    expect(source).toContain('args.clearVoiceCache();');
    expect(source).toContain('args.setCurrentTime(0);');
    expect(source).toContain('args.refs.auditionTokenRef.current += 1;');
    expect(source).toContain('args.dispatchTransport(resetTransport({ autoPlayNext: args.refs.isAutoPlayNextRef.current }));');
    expect(source).toContain('void ctx.close();');
  });
});
