import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor playback shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');
  const auditionFlowSource = readFileSync(new URL('./playback-audition-flow.ts', import.meta.url), 'utf8');
  const auditionRuntimeSource = readFileSync(new URL('./playback-audition-runtime.ts', import.meta.url), 'utf8');
  const transportOwnerSource = readFileSync(new URL('./playback-transport-owner.ts', import.meta.url), 'utf8');
  const controlOwnerSource = readFileSync(new URL('./playback-control-owner.ts', import.meta.url), 'utf8');
  const sessionOwnerSource = readFileSync(new URL('./playback-session-owner.ts', import.meta.url), 'utf8');
  const videoSyncSource = readFileSync(new URL('./playback-video-sync.ts', import.meta.url), 'utf8');
  const subtitleAudioEngineSource = readFileSync(new URL('./subtitle-audio-engine.ts', import.meta.url), 'utf8');

  it('lets the page shell delegate playback owner state to useVideoEditorPlayback', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-playback.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorPlayback } from './runtime/playback/use-video-editor-playback';");
    expect(shellSource).toContain('} = useVideoEditorPlayback({');
    expect(shellSource).not.toContain('const [isPlaying, setIsPlaying] = useState(false);');
    expect(shellSource).not.toContain('const [isSubtitleBuffering, setIsSubtitleBuffering] = useState(false);');
    expect(shellSource).not.toContain('const [isVideoBuffering, setIsVideoBuffering] = useState(false);');
    expect(shellSource).not.toContain('const [currentTime, setCurrentTime] = useState(0);');
    expect(shellSource).not.toContain('const [totalDuration, setTotalDuration] = useState(60);');
    expect(shellSource).not.toContain('const [volume, setVolume] = useState(80);');
    expect(shellSource).not.toContain('const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);');
    expect(shellSource).not.toContain('const [transportState, dispatchTransport] = useReducer(transportReducer, undefined, () => createInitialTransportState());');
    expect(shellSource).not.toContain('const voiceAudioCtxRef = useRef<AudioContext | null>(null);');
    expect(shellSource).not.toContain('const videoPreviewRef = useRef<VideoPreviewRef>(null);');
    expect(shellSource).not.toContain('const timelineHandleRef = useRef<TimelineHandle>(null);');
    expect(shellSource).not.toContain('const handlePlayPause = useCallback(() => {');
    expect(shellSource).not.toContain('const handleSeek = useCallback(');
    expect(shellSource).not.toContain('const handleAuditionRequestPlay = useCallback(');
    expect(shellSource).not.toContain('const handleRetryBlockedPlayback = useCallback(() => {');

    expect(hookSource).toContain('const [isPlaying, setIsPlaying] = useState(false);');
    expect(hookSource).toContain('const [isSubtitleBuffering, setIsSubtitleBuffering] = useState(false);');
    expect(hookSource).toContain('const [isVideoBuffering, setIsVideoBuffering] = useState(false);');
    expect(hookSource).toContain('const [currentTime, setCurrentTime] = useState(0);');
    expect(hookSource).toContain('const [totalDuration, setTotalDuration] = useState(60);');
    expect(hookSource).toContain('const [volume, setVolume] = useState(80);');
    expect(hookSource).toContain('const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);');
    expect(hookSource).toContain('const [transportState, dispatchTransport] = useReducer(transportReducer, undefined, () => createInitialTransportState());');
    expect(hookSource).toContain('const videoPreviewRef = useRef<VideoPreviewRef>(null);');
    expect(hookSource).toContain('const timelineHandleRef = useRef<TimelineHandle>(null);');
    expect(hookSource).toContain('const handlePlayPause = useCallback(() => {');
    expect(hookSource).toContain('const handleSeek = useCallback(');
    expect(hookSource).toContain('const handleAuditionRequestPlay = useCallback(');
    expect(hookSource).toContain('const handleRetryBlockedPlayback = useCallback(() => {');
    expect(hookSource).toContain("import { usePlaybackSessionOwner } from './playback-session-owner';");
    expect(hookSource).toContain('usePlaybackSessionOwner({');
  });

  it('exposes the public playback api consumed by shell, preview, timeline, and workstation', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-playback.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('transportSnapshot,');
    expect(hookSource).toContain('timelineHandleRef,');
    expect(hookSource).toContain('videoPreviewRef,');
    expect(hookSource).toContain('currentTime,');
    expect(hookSource).toContain('totalDuration,');
    expect(hookSource).toContain('volume,');
    expect(hookSource).toContain('isBgmMuted,');
    expect(hookSource).toContain('isSubtitleMuted,');
    expect(hookSource).toContain('isPlaying,');
    expect(hookSource).toContain('handlePlayPause,');
    expect(hookSource).toContain('handleSeek,');
    expect(hookSource).toContain('handleSeekToSubtitle,');
    expect(hookSource).toContain('handleGlobalVolume,');
    expect(hookSource).toContain('handleToggleBgmMute,');
    expect(hookSource).toContain('handleToggleSubtitleMute,');
    expect(hookSource).toContain('handleAutoPlayNextChange,');
    expect(hookSource).toContain('handleAuditionRequestPlay,');
    expect(hookSource).toContain('handleAuditionToggle,');
    expect(hookSource).toContain('handleAuditionStop,');
    expect(hookSource).toContain('handleRetryBlockedPlayback,');
    expect(hookSource).toContain('handleCancelBlockedPlayback,');
    expect(hookSource).toContain('handleLocateBlockedClip,');
    expect(hookSource).toContain('clearVoiceCache,');
    expect(hookSource).toContain('clearActiveTimelineClip,');
  });

  it('resets playback owner state when the editor switches to another convert task', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-playback.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain('convertId,');
    expect(hookSource).toContain('convertId: string;');
    expect(hookSource).toContain('usePlaybackSessionOwner({');
    expect(sessionOwnerSource).toContain('args.dispatchTransport(resetTransport({ autoPlayNext: args.refs.isAutoPlayNextRef.current }));');
    expect(sessionOwnerSource).toContain('args.setCurrentTime(0);');
    expect(sessionOwnerSource).toContain('args.clearVoiceCache();');
  });

  it('routes convert audition through a dedicated gate that still blocks pending or missing rows from auditioning stale audio', () => {
    expect(auditionFlowSource).toContain("if (mode === 'convert') {");
    expect(auditionFlowSource).toContain('const gate = args.evaluateConvertAuditionGateForClipIndex(index);');
    expect(auditionFlowSource).toContain("if (gate.kind === 'voice_unavailable') {");
    expect(auditionFlowSource).toContain('args.setPlayingSubtitleIndex(index);');
    expect(auditionFlowSource).toContain(
      'await args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), item.startTime);'
    );
    expect(auditionFlowSource).toContain("const voiceUrl = (seg?.previewAudioUrl || seg?.audioUrl || '').trim();");
  });

  it('releases convert audition ownership when the video clock is unavailable or fails to start', () => {
    expect(auditionFlowSource).toContain('if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {');
    expect(auditionFlowSource).toContain("toast.error(args.t('videoEditor.toast.addVideoFirst'));");
    expect(auditionFlowSource).toContain('releaseAuditionController();');
    expect(auditionFlowSource).toContain('const syncStarted = await args.applyVideoTransportSnapshot(');
    expect(auditionFlowSource).toContain('if (!syncStarted) {');
    expect(auditionFlowSource).toContain('args.handleAuditionStopFallback(false);');
  });

  it('stops video startup when warmup times out instead of calling play() on an unready element', () => {
    expect(videoSyncSource).toContain('const warmedUp = await waitForVideoWarmup({');
    expect(videoSyncSource).toContain('timeoutMs: 12_000,');
    expect(videoSyncSource).toContain('if (!warmedUp || gateToken !== args.getVideoStartGateToken()) {');
  });

  it('keeps user-initiated playback in a retryable blocked state when video startup fails', () => {
    expect(transportOwnerSource).toContain('if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {');
    expect(transportOwnerSource).toMatch(
      /const syncStarted = await args\.applyVideoTransportSnapshot\([\s\S]*?playReason: 'user-play'[\s\S]*?if \(!syncStarted\) \{[\s\S]*?args\.handlePlaybackStartFailure\(/
    );
  });

  it('shows retrying state during blocked retry and restores network_failed when the restart still cannot begin', () => {
    expect(transportOwnerSource).toMatch(
      /blockingState\.kind === 'network_failed'[\s\S]*?setPlaybackBlockingState\(\{[\s\S]*?kind: 'retrying'[\s\S]*?playReason: 'blocked-retry'[\s\S]*?if \(!syncStarted\) \{[\s\S]*?handlePlaybackStartFailure\(/
    );
  });

  it('falls back to the retryable network_failed card when buffering resume cannot restart playback', () => {
    expect(subtitleAudioEngineSource).toContain('const syncStarted = await args.applyVideoTransportSnapshot(');
    expect(subtitleAudioEngineSource).toContain("playReason: 'subtitle-buffering-resume'");
    expect(subtitleAudioEngineSource).toContain('if (!syncStarted) {');
    expect(subtitleAudioEngineSource).toContain('args.handlePlaybackStartFailure({');
  });

  it('keeps retry available when network_failed has no resolvable subtitle clip and falls back to current transport time', () => {
    expect(transportOwnerSource).toContain('const retryContext = args.resolveRetryablePlaybackContext(');
    expect(transportOwnerSource).toContain('resolved?.clipIndex ?? blockingState.clipIndex,');
    expect(transportOwnerSource).toContain('resolved?.clip.id ?? blockingState.subtitleId');
    expect(transportOwnerSource).toContain("if (args.refs.subtitleBackendRef.current === 'media' || !resolved) {");
  });

  it('delegates control fanout and queued audition runtime effects to focused modules', () => {
    expect(controlOwnerSource).toContain('args.setVolume(vol);');
    expect(controlOwnerSource).toContain('args.dispatchTransport(setTransportAutoPlayNext(value));');
    expect(auditionRuntimeSource).toContain("args.logEditorTransport('debug', 'queue-next-audition', {");
    expect(auditionRuntimeSource).toContain('args.handleAuditionStopRef.current = args.handleAuditionStop;');
  });
});
