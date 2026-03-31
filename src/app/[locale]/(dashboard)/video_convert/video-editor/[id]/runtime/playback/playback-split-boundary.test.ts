import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor playback modularization boundary', () => {
  const hookSource = readFileSync(new URL('./use-video-editor-playback.ts', import.meta.url), 'utf8');

  it('keeps transport owner inside the hook while delegating specialized playback flows to dedicated modules', () => {
    expect(hookSource).toContain("import { createPlaybackTransportOwner } from './playback-transport-owner';");
    expect(hookSource).toContain("import { createPlaybackControlOwner } from './playback-control-owner';");
    expect(hookSource).toContain("import { createPlaybackVideoSync } from './playback-video-sync';");
    expect(hookSource).toContain("import { createPlaybackBlockingRetryController } from './playback-blocking-retry-controller';");
    expect(hookSource).toContain("import { createPlaybackSeekOwner } from './playback-seek-owner';");
    expect(hookSource).toContain("import { usePlaybackAuditionRuntime } from './playback-audition-runtime';");
    expect(hookSource).toContain("import { createSubtitleAudioEngine } from './subtitle-audio-engine';");
    expect(hookSource).toContain("import { createPlaybackAuditionFlow } from './playback-audition-flow';");
    expect(hookSource).toContain("import { createPlaybackVoiceCache } from './playback-voice-cache';");
    expect(hookSource).toContain("import { createPlaybackTimeLoop } from './playback-time-loop';");
    expect(hookSource).toContain("import { usePlaybackRuntimeEffects } from './playback-runtime-effects';");

    expect(hookSource).toContain('const [transportState, dispatchTransport] = useReducer(transportReducer, undefined, () => createInitialTransportState());');
    expect(hookSource).toContain('const timelineHandleRef = useRef<TimelineHandle>(null);');
    expect(hookSource).toContain('const videoPreviewRef = useRef<VideoPreviewRef>(null);');
  });

  it('wires the extracted playback modules back into the hook public api', () => {
    expect(hookSource).toContain('createPlaybackTransportOwner({');
    expect(hookSource).toContain('createPlaybackControlOwner({');
    expect(hookSource).toContain('createPlaybackVideoSync({');
    expect(hookSource).toContain('createPlaybackBlockingRetryController({');
    expect(hookSource).toContain('createPlaybackSeekOwner({');
    expect(hookSource).toContain('usePlaybackAuditionRuntime({');
    expect(hookSource).toContain('createSubtitleAudioEngine({');
    expect(hookSource).toContain('createPlaybackAuditionFlow({');
    expect(hookSource).toContain('createPlaybackVoiceCache({');
    expect(hookSource).toContain('createPlaybackTimeLoop({');
    expect(hookSource).toContain('usePlaybackRuntimeEffects({');

    expect(hookSource).toContain('handleRetryBlockedPlayback,');
    expect(hookSource).toContain('handleCancelBlockedPlayback,');
    expect(hookSource).toContain('handleLocateBlockedClip,');
    expect(hookSource).toContain('handleAuditionRequestPlay,');
    expect(hookSource).toContain('handleAuditionStop,');
  });

  it('does not duplicate abort suppression inside the hook after runtime effects takes ownership', () => {
    expect(hookSource).not.toContain("window.addEventListener('unhandledrejection', suppressAbort);");
    expect(hookSource).not.toContain("window.addEventListener('error', suppressAbortSync, true);");
  });
});
