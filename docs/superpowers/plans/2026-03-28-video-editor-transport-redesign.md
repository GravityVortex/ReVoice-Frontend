# Video Editor Transport Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立单一 transport 内核与统一试听音频链路，解决视频编辑页字幕、视频、时间轴三者联动失稳，以及原音试听偶发失败的问题。

**Architecture:** 先收敛源音频 URL 与试听 ready 语义，再引入显式 `editor-transport` 作为播放真相源，并新增 `video-sync-controller` 驱动 `HTMLVideoElement`。译音试听继续复用现有 WebAudio 管线，但通过 adapter 接入统一的 transport / ready / cancel 语义。整个过程采用渐进迁移，优先稳定原音试听，再替换事件总线和 UI 联动。

**Tech Stack:** Next.js, React 19, TypeScript, HTMLMediaElement, WebAudio, Vitest, ESLint

---

## Chunk 0: 脏工作区前置检查

### Task 0: 在不覆盖现有未提交改动的前提下建立实施边界

**Files:**
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx`

- [ ] **Step 1: Inspect the dirty worktree**

Run: `git status --short`
Expected: See which target files already contain uncommitted changes.

- [ ] **Step 2: Read every dirty file that this plan will touch**

Run:
- `sed -n '1,220p' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx'`
- `sed -n '1,240p' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'`
- `sed -n '220,620p' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx'`

Expected: Understand the latest local state before changing any file.

- [ ] **Step 3: Do not stash, reset, or checkout away local changes**

Rule:

- keep existing uncommitted work intact
- adapt to it in-place when compatible
- if the intent directly conflicts, stop and ask the human before editing

- [ ] **Step 4: If the user requests isolation, create a worktree or branch before touching code**

Run if requested:
- `git worktree add ../ReVoice-web-shipany-two-transport-refactor -b codex/video-editor-transport-refactor`

Expected: An isolated workspace without modifying the original dirty checkout.

## Chunk 1: 稳定原音试听链路

### Task 1: 抽出统一的源音频解析器并清理所有编辑页 URL 拼接点

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx`
- Modify if needed: `src/shared/components/video-editor/types.ts`
- Reuse without duplicating: `src/shared/lib/timeline/split.ts`
- Re-run: `src/shared/lib/timeline/source-audition-mode.test.ts`

- [ ] **Step 1: Write the failing test for source audio URL priority**

```ts
it('prefers sourceEntry.audio_url over legacy front-end path concatenation', () => {
  const result = resolveSourceAuditionAudio({
    convertObj: {
      userId: 'owner-1',
      id: 'task-1',
      r2preUrl: 'https://pub.example.com',
      env: 'dev',
    } as any,
    sourceEntry: {
      id: 'clip-1',
      audio_url: 'split_audio/audio/clip-1.wav',
    },
  });

  expect(result.primary?.url).toContain('split_audio/audio/clip-1.wav');
  expect(result.primary?.url).not.toContain('/undefined/');
});
```

- [ ] **Step 2: Write the failing test that split-row mode still follows the shared helper**

```ts
it('reuses resolveSourcePlaybackMode semantics for split rows', () => {
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

- [ ] **Step 3: Write the failing regression test for `convertObj.userId` fallback**

```ts
it('uses convertObj.userId rather than runtime user context when building editor audio urls', () => {
  const result = resolveEditorPublicAudioUrl({
    convertObj: {
      userId: 'owner-1',
      id: 'task-1',
      r2preUrl: 'https://pub.example.com',
      env: 'dev',
    } as any,
    pathName: 'adj_audio_time/clip-1.wav',
    cacheBust: '123',
  });

  expect(result).toContain('/owner-1/task-1/adj_audio_time/clip-1.wav?t=123');
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts'`

Expected: FAIL because the resolver module does not exist yet.

- [ ] **Step 5: Implement `audio-source-resolver.ts`**

Requirements:

1. Reuse `resolveSourcePlaybackMode` from `src/shared/lib/timeline/split.ts`; do not fork mode rules.
2. Centralize `/api/storage/proxy` decisions.
3. Resolve current editor URL builders in one place.
4. Never read `user?.id`; use `convertObj.userId`.

- [ ] **Step 6: Replace the existing inline URL builders**

Replace these sites with resolver calls:

- source audition URL construction in `page.tsx`
- `buildPublicAudioUrl()` in `subtitle-workstation.tsx`
- playback and update URL builders in `panel-audio-list.tsx`

- [ ] **Step 7: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts'`
- `pnpm -s vitest run src/shared/lib/timeline/source-audition-mode.test.ts`

Expected: PASS

### Task 2: 抽出统一的试听 ready / timeout / abort 引擎

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Add a fake audio helper for engine tests**

Inside `audio-audition-engine.test.ts`, create a local helper such as:

```ts
function createFakeAuditionAudio(opts?: {
  readyAfterMs?: number;
  errorAfterMs?: number;
}) {
  // minimal event-target-like stub:
  // addEventListener / removeEventListener / dispatch
  // load / play / pause
}
```

The engine should depend on a minimal `AuditionAudioLike` interface so tests do not need a real `HTMLAudioElement`.

- [ ] **Step 2: Write the failing timeout / error / abort tests**

Examples:

```ts
it('returns timeout instead of error when audio is slow but not failed', async () => {
  const audio = createFakeAuditionAudio({ readyAfterMs: 4500 });

  await expect(waitForAuditionReady(audio, { timeoutMs: 1000 })).resolves.toEqual(
    expect.objectContaining({ status: 'timeout' })
  );
});

it('returns aborted when a newer audition cancels the current one', async () => {
  const controller = new AbortController();
  const audio = createFakeAuditionAudio();
  controller.abort();

  await expect(waitForAuditionReady(audio, {
    timeoutMs: 1000,
    signal: controller.signal,
  })).resolves.toEqual(expect.objectContaining({ status: 'aborted' }));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts'`

Expected: FAIL because the engine module does not exist yet.

- [ ] **Step 4: Implement `audio-audition-engine.ts`**

Export:

- `waitForAuditionReady`
- `primeAuditionAudio`
- result mapping: `ready | timeout | error | aborted`

Rules:

- timeout must not be collapsed into hard error
- `AbortSignal` support is required
- cleanup must remove listeners deterministically

- [ ] **Step 5: Integrate source / vocal fallback with the new engine**

Replace `waitForAudioReady()` usage in `page.tsx`.

- [ ] **Step 6: Wrap convert audition readiness with the same result shape**

Do not replace the existing WebAudio backend yet. Instead, adapt the current:

- `cacheGetVoice`
- `ensureVoiceBuffer`
- `syncVoicePlaybackWebAudio`

so convert audition also reports `ready | timeout | error | aborted` into transport / caller logic.

- [ ] **Step 7: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts'`

Expected: PASS

- [ ] **Step 8: Commit Chunk 1**

```bash
git add \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx \
  src/shared/components/video-editor/types.ts
git commit -m "refactor: centralize video editor audition audio resolution"
```

## Chunk 2: 建立单一 transport 状态源

### Task 3: 新增 transport reducer / state machine

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Write the failing test for source audition lifecycle**

```ts
it('moves from paused to buffering to playing in source audition mode', () => {
  const state0 = createInitialTransportState();
  const state1 = transportReducer(
    state0,
    startSourceAudition({ index: 3, timeSec: 12, stopAtSec: 15 })
  );
  const state2 = transportReducer(state1, auditionReady());

  expect(state1.mode).toBe('audition_source');
  expect(state1.status).toBe('buffering');
  expect(state2.status).toBe('playing');
});
```

- [ ] **Step 2: Write the failing test for natural-end auto-play-next**

```ts
it('schedules next clip only on natural end', () => {
  const state = {
    ...createInitialTransportState(),
    mode: 'audition_convert',
    status: 'playing',
    autoPlayNext: true,
    activeClipIndex: 2,
    pendingNextClipIndex: null,
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
    pendingNextClipIndex: null,
  };

  const next = transportReducer(state, stopAudition());
  expect(next.pendingNextClipIndex).toBeNull();
});
```

- [ ] **Step 4: Run transport tests to verify they fail**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`

Expected: FAIL because the reducer module does not exist yet.

- [ ] **Step 5: Implement `editor-transport.ts`**

Include:

- transport state type
- action creators
- reducer
- selectors for `isAuditioning`, `getAuditionStopAtSec`, `getActiveClipIndex`
- `pendingNextClipIndex` as explicit state instead of hidden callback-only behavior

- [ ] **Step 6: Replace the most fragile page-level booleans with transport state**

Start with:

- `auditionActiveType`
- `playingSubtitleIndex`
- `auditionStopAtMsRef`
- auto-play-next related refs

Keep the migration incremental; do not rewrite every playback ref in one pass.

- [ ] **Step 7: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`

Expected: PASS

### Task 4: 删除试听 DOM 事件总线，改成显式命令流

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`

- [ ] **Step 1: Mock `SubtitleRowItem` to capture callback props**

In `subtitle-workstation.test.tsx`, use `vi.mock('./subtitle-row-item', ...)` to capture each row’s props during render instead of reading raw source text.

- [ ] **Step 2: Write the failing behavioral test**

Example:

```ts
it('invokes onRequestAuditionPlay when the mocked row triggers source playback', () => {
  // render SubtitleWorkstation with one row
  // capture child props
  // call captured.onPlayPauseSource()
  // expect parent spy to be called with the row index and "source"
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'`

Expected: FAIL because the current implementation still relies on the document-event flow.

- [ ] **Step 4: Remove `revoice-audition-*` document events from `page.tsx`**

Replace:

- `revoice-audition-request-play`
- `revoice-audition-natural-stop`

with explicit callback wiring plus transport dispatch.

- [ ] **Step 5: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'`
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts'`

Expected: PASS

- [ ] **Step 6: Commit Chunk 2**

```bash
git add \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx
git commit -m "refactor: add video editor transport state machine"
```

## Chunk 3: 让视频、字幕、时间轴都订阅 transport

### Task 5: 新增 `video-sync-controller.ts` 并接管视频元素同步

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`

- [ ] **Step 1: Write the failing test for play / pause / seek sync**

```ts
it('applies transport snapshot to a video-like element', async () => {
  const video = createFakeVideoElement();
  const controller = createVideoSyncController(video);

  await controller.apply({
    status: 'playing',
    mode: 'timeline',
    transportTimeSec: 12,
  } as any);

  expect(video.currentTime).toBe(12);
  expect(video.play).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts'`

Expected: FAIL because the controller module does not exist yet.

- [ ] **Step 3: Implement `video-sync-controller.ts`**

Responsibilities:

- consume transport snapshot
- perform `play()`, `pause()`, `currentTime` sync
- isolate `HTMLVideoElement` side effects from `page.tsx`

- [ ] **Step 4: Route page video mutations through the controller**

After this step, scattered `videoEl.currentTime = ...` and ad-hoc `video.play()` usage should shrink toward the controller boundary.

- [ ] **Step 5: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts'`

Expected: PASS

### Task 6: 让时间轴、字幕工作台、视频预览只消费 transport snapshot

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Modify if needed: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: Keep the existing `renderToStaticMarkup` tests where they already fit**

Do not add a meaningless assertion like `expect(html).toContain('timeline')`.

Only extend `timeline-panel.test.tsx` if the prop contract or rendered markers actually change.

- [ ] **Step 2: Add focused prop-contract tests where needed**

Examples:

- `subtitle-workstation` highlights the active row from incoming props
- `video-preview-panel` highlights the active subtitle from incoming props

- [ ] **Step 3: Integrate snapshot-only wiring**

Make sure:

- `TimelinePanel` receives time / active clip / mute state as snapshot props
- `onSeek` dispatches transport seek intent only
- child components stop inferring a second playback truth from local timers or DOM state

- [ ] **Step 4: Run focused tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'`
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts'`

Expected: PASS

- [ ] **Step 5: Commit Chunk 3**

```bash
git add \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx
git commit -m "refactor: isolate video sync and transport subscribers"
```

## Chunk 4: 回归、观测、收尾

### Task 7: 增加结构化日志并完成整体验证

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts`

- [ ] **Step 1: Add structured debug logging**

Use prefixes:

- `[EditorTransport]`
- `[AudioResolver]`
- `[AudioAudition]`
- `[VideoSync]`

Each log should include clip id and mode where applicable.

- [ ] **Step 2: Run the focused suite**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts'`

Expected: PASS

- [ ] **Step 3: Run lint on touched files**

Run:
- `pnpm -s eslint 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx'`

Expected: PASS

- [ ] **Step 4: Manual smoke check**

Run: `pnpm dev`

Verify:

- 进入页面后第一次点击原音试听即可稳定出声
- 快速切换多条字幕原音时不会残留上一条声音
- 拖动时间轴后，视频、字幕高亮、试听开始点一致
- 原音和译音切换时不会出现双声道 / 双实例重叠
- auto-play-next 只在自然播放结束时触发
- split 行在 `fallback_vocal` 场景下能稳定播放

- [ ] **Step 5: Commit Chunk 4**

```bash
git add \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx
git commit -m "refactor: stabilize video editor transport and sync flow"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-28-video-editor-transport-redesign.md`. Ready to execute?
