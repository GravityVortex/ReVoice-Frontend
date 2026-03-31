import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('playback control owner module', () => {
  const source = readFileSync(new URL('./playback-control-owner.ts', import.meta.url), 'utf8');

  it('owns volume fanout across preview, bgm, subtitle audio, and audition audio', () => {
    expect(source).toContain('args.setVolume(vol);');
    expect(source).toContain('if (args.refs.videoPreviewRef.current?.videoElement) {');
    expect(source).toContain('args.refs.videoPreviewRef.current.videoElement.volume = output;');
    expect(source).toContain('if (args.refs.bgmAudioRef.current) {');
    expect(source).toContain('args.refs.bgmAudioRef.current.volume = output;');
    expect(source).toContain('args.audioRefArr.forEach((ref) => {');
    expect(source).toContain('args.refs.sourceAuditionAudioRef.current.volume = output;');
  });

  it('owns mute and auto-play toggles while leaving hook wrappers thin', () => {
    expect(source).toContain('args.setIsBgmMuted((value) => !value);');
    expect(source).toContain('args.setIsSubtitleMuted((value) => !value);');
    expect(source).toContain('args.setIsAutoPlayNext(value);');
    expect(source).toContain('args.dispatchTransport(setTransportAutoPlayNext(value));');
    expect(source).toContain('args.handlePlayPause();');
  });
});
