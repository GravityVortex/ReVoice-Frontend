# Video Editor Transport Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立单一 transport 内核与统一试听音频链路，解决视频编辑页字幕、视频、时间轴三者联动失稳，以及原音试听偶发失败的问题。

**Architecture:** 先把源音频 URL 解析、ready 语义、试听 fallback 从 `page.tsx` 中抽离成独立模块，再引入一个显式 transport reducer 作为播放真相源，最后让 `timeline-panel`、`subtitle-workstation`、`video-preview-panel` 只订阅 transport 快照并派发意图。整个过程采用渐进迁移，先稳定原音试听，再收敛整页联动。

**Tech Stack:** Next.js, React 19, TypeScript, HTMLMediaElement, WebAudio, Vitest, ESLint

---

## Chunk 1: 稳定原音试听链路

### Task 1: 抽出源音频解析器，禁止页面临时拼 URL

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/shared/components/video-editor/types.ts`

- [ ] **Step 1: Write the failing test for source audio URL priority**

```ts
it('prefers sourceItem.audio_url over front-end path concatenation', () => {
  const result = resolveSourceAuditionAudio({
    convertObj: { userId: 'owner-1', id: 'task-1', r2preUrl: 'https://pub.example.com', env: 'dev' } as any,
    sourceEntry: { id: 'clip-1', audio_url: 'split_audio/audio/clip-1.wav' },
  });

  expect(result.primary?.url).toContain('split_audio/audio/clip-1.wav');
  expect(result.primary?.url).not.toContain('/undefined/');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts'`
Expected: FAIL because the resolver module does not exist yet.

- [ ] **Step 3: Write the failing test for split-row fallback behavior**

```ts
it('routes split rows with fallback_vocal directly to vocal fallback', () => {
  const result = resolveSourceAuditionAudio({
    convertObj: { vocalAudioUrl: 'https://private.example.com/vocal.wav' } as any,
    sourceEntry: {
      id: 'clip-1',
      start: '00:00:10,000',
      end: '00:00:12,000',
      vap_source_mode: 'fallback_vocal',
    },
  });

  expect(result.primary?.source).toBe('vocal_fallback');
});
```

- [ ] **Step 4: Implement the resolver with explicit priority order**

Priority:

1. `resolved_*` fields if the API already provides them
2. `sourceEntry.audio_url`
3. `split_audio/audio/${id}.wav` only as a legacy fallback
4. `convertObj.vocalAudioUrl` for `fallback_vocal`

Hard rules:

- never read `user?.id`
- use `convertObj.userId`
- centralize `/api/storage/proxy` decision in the resolver

- [ ] **Step 5: Replace inline source URL concatenation in `page.tsx`**

Move the logic currently inside source audition playback into `audio-source-resolver.ts`, and keep `page.tsx` as a caller only.

- [ ] **Step 6: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts'`

Expected: PASS

### Task 2: 抽出统一的试听 ready / timeout / abort 语义

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Write the failing test that distinguishes timeout from hard error**

```ts
it('returns timeout instead of error when audio is slow but not failed', async () => {
  const audio = createFakeAudio({ readyAfterMs: 4500 });

  await expect(waitForAuditionReady(audio, { timeoutMs: 1000 })).resolves.toEqual(
    expect.objectContaining({ status: 'timeout' })
  );
});
```

- [ ] **Step 2: Write the failing test for abort semantics**

```ts
it('returns aborted when a newer audition cancels the current one', async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(waitForAuditionReady(createFakeAudio(), {
    timeoutMs: 1000,
    signal: controller.signal,
  })).resolves.toEqual(expect.objectContaining({ status: 'aborted' }));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts'`
Expected: FAIL because the engine module does not exist yet.

- [ ] **Step 4: Implement `audio-audition-engine.ts`**

Export helpers for:

- `waitForAuditionReady`
- `primeAuditionAudio`
- structured result mapping: `ready | timeout | error | aborted`

Rules:

- do not collapse timeout into error
- support `AbortSignal`
- clean event listeners deterministically

- [ ] **Step 5: Replace `waitForAudioReady()` in `page.tsx`**

`page.tsx` should consume structured results and only toast on hard errors, not on timeout + successful retry path.

- [ ] **Step 6: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts'`

Expected: PASS

## Chunk 2: 建立单一 transport 状态源

### Task 3: 新增 transport reducer/state machine

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Write the failing test for source audition lifecycle**

```ts
it('moves from paused to buffering to playing in source audition mode', () => {
  const state0 = createInitialTransportState();
  const state1 = transportReducer(state0, startSourceAudition({ index: 3, timeSec: 12, stopAtSec: 15 }));
  const state2 = transportReducer(state1, auditionReady());

  expect(state1.mode).toBe('audition_source');
  expect(state1.status).toBe('buffering');
  expect(state2.status).toBe('playing');
});
```

- [ ] **Step 2: Write the failing test for natural-end auto-play-next**

```ts
it('only auto-plays next clip when the current audition ended naturally', () => {
  const state = {
    ...createInitialTransportState(),
    mode: 'audition_convert',
    status: 'playing',
    autoPlayNext: true,
    activeClipIndex: 2,
  };

  const next = transportReducer(state, auditionEndedNaturally());
  expect(next.pendingNextClipIndex).toBe(3);
});
```

- [ ] **Step 3: Write the failing test for manual stop semantics**

```ts
it('does not schedule auto-play-next on manual stop', () => {
  const state = {
    ...createInitialTransportState(),
    mode: 'audition_convert',
    status: 'playing',
    autoPlayNext: true,
    activeClipIndex: 2,
  };

  const next = transportReducer(state, stopAudition());
  expect(next.pendingNextClipIndex).toBeNull();
});
```

- [ ] **Step 4: Run transport tests to verify they fail**

Run: `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`
Expected: FAIL because the reducer module does not exist yet.

- [ ] **Step 5: Implement `editor-transport.ts`**

Include:

- transport state type
- action creators
- reducer
- selectors for `isAuditioning`, `getAuditionStopAtSec`, `getActiveClipIndex`

- [ ] **Step 6: Replace the most fragile page-level booleans with transport state**

Start with:

- `auditionActiveType`
- `playingSubtitleIndex`
- `auditionStopAtMsRef`
- auto-play-next related refs

Do not try to migrate every playback ref in one pass.

- [ ] **Step 7: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`

Expected: PASS

### Task 4: 删除试听 DOM 事件总线，改成显式命令流

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`

- [ ] **Step 1: Write the failing test that `subtitle-workstation` only uses callback props**

```ts
it('requests audition via props instead of document events', () => {
  const source = readFileSync(new URL('./subtitle-workstation.tsx', import.meta.url), 'utf8');
  expect(source).not.toContain('document.dispatchEvent');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`
Expected: FAIL or remain unchanged until a new workstation-focused test file is added.

- [ ] **Step 3: Add a focused workstation regression test**

Create:

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`

Cover:

- clicking source play calls `onRequestAuditionPlay`
- clicking current playing item calls `onRequestAuditionToggle`

- [ ] **Step 4: Remove `revoice-audition-*` document events from `page.tsx`**

Replace:

- `revoice-audition-request-play`
- `revoice-audition-natural-stop`

with direct reducer dispatch + callback plumbing.

- [ ] **Step 5: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'`
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`

Expected: PASS

## Chunk 3: 让时间轴、字幕、视频都订阅 transport

### Task 5: 让时间轴只消费 transport 时间，不直接改媒体对象

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Write the failing regression test for timeline intent flow**

```ts
it('exposes seek as an intent callback instead of owning playback state', () => {
  const html = renderToStaticMarkup(
    <TimelinePanel
      totalDuration={60}
      currentTime={12}
      isPlaying={true}
      subtitleTrack={[]}
      zoom={1}
      volume={50}
      isBgmMuted={false}
      isSubtitleMuted={false}
      onPlayPause={() => {}}
      onSeek={() => {}}
      onZoomChange={() => {}}
      onVolumeChange={() => {}}
      onToggleBgmMute={() => {}}
      onToggleSubtitleMute={() => {}}
    />
  );

  expect(html).toContain('timeline');
});
```

- [ ] **Step 2: Implement transport-backed wiring**

Make sure:

- `TimelinePanel` only receives snapshot props
- `onSeek` dispatches transport seek intent
- media `currentTime` mutations stay inside controller code

- [ ] **Step 3: Run focused tests**

Run: `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`
Expected: PASS

### Task 6: 让视频预览和工作台都从 transport selector 派生当前片段

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Write the failing test for derived active clip rendering**

Add focused tests that verify:

- `subtitle-workstation` current playing row is driven by incoming props
- `video-preview-panel` active subtitle highlight is driven by incoming props

- [ ] **Step 2: Remove duplicated “current clip” calculations from child components**

Children should not infer their own playback truth from local timers or DOM state.

- [ ] **Step 3: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'`
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`

Expected: PASS

## Chunk 4: 回归、观测、收尾

### Task 7: 增加结构化日志和整体验证

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts`

- [ ] **Step 1: Add structured debug logging**

Use prefixes:

- `[EditorTransport]`
- `[AudioResolver]`
- `[AudioAudition]`
- `[VideoSync]`

Each log should include clip id and mode where applicable.

- [ ] **Step 2: Run the focused test suite**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`

Expected: PASS

- [ ] **Step 3: Run lint on touched files**

Run:
- `pnpm -s eslint 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx'`

Expected: PASS

- [ ] **Step 4: Manual smoke check**

Run: `pnpm dev`

Verify:

- 进入页面后第一次点击原音试听即可稳定出声
- 快速切换多条字幕原音时不会残留上一条声音
- 拖动时间轴后，视频、字幕高亮、试听开始点一致
- 原音和译音切换时不会出现双声道/双实例重叠
- auto-play-next 只在自然播放结束时触发
- split 行在 `fallback_vocal` 场景下能稳定播放

- [ ] **Step 5: Commit**

```bash
git add \
  docs/superpowers/specs/2026-03-28-video-editor-transport-redesign-design.md \
  docs/superpowers/plans/2026-03-28-video-editor-transport-redesign.md \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx \
  src/shared/components/video-editor/types.ts
git commit -m "refactor: stabilize video editor transport and audition flow"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-28-video-editor-transport-redesign.md`. Ready to execute?
