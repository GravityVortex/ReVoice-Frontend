# Video Editor Page Modularization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变当前视频编辑页业务逻辑、交互闭环与接口协议的前提下，将 `video-editor/[id]/page.tsx` 重构为页面壳层 + 领域控制器 + 纯视图组件结构。

**Architecture:** 先冻结现有关键行为，再按 `document -> merge/structural-edit -> playback -> page shell` 的顺序迁移状态 owner。迁移过程中优先复用已经抽出的纯模块，如 `editor-transport.ts`、`video-merge-state.ts`、`video-editor-structural-edit.ts`，避免语义重写。最终 `page.tsx` 只保留路由入口，业务控制逻辑下沉到 `runtime/*` 控制器中。

**Tech Stack:** Next.js App Router, React 19, TypeScript, HTMLMediaElement, WebAudio, Vitest

---

## Chunk 0: 行为冻结与文件边界盘点

### Task 0: 冻结现有关键链路，避免重构中逻辑漂移

**Files:**
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`

- [ ] **Step 1: 盘点当前主文件中的领域边界**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx'
rg -n "^  const |^  useEffect\\(|^  const handle|^function |^export default function" 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx'
```

Expected: 明确 page 中哪些状态和副作用属于 `document / merge / structural-edit / playback / shell`。

- [ ] **Step 2: 运行现有页面关键回归测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'
```

Expected: PASS，作为后续重构的行为基线。

- [ ] **Step 3: 新增一个页面壳层存在性测试**

Create test in:
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`

Failing test example:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor page shell structure', () => {
  it('keeps page.tsx as a thin route entry that delegates to page shell', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(source).toContain("import { VideoEditorPageShell } from './video-editor-page-shell';");
    expect(source).toContain('<VideoEditorPageShell');
  });
});
```

- [ ] **Step 4: 运行新增测试，确认它先失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts'
```

Expected: FAIL，因为壳层尚不存在。

---

## Chunk 1: 收拢 Document Owner

### Task 1: 新建 document 控制器，接管页面文档主状态

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/use-video-editor-document.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/video-editor-document-selectors.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/video-editor-document-mappers.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/use-video-editor-document.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-editor-state.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.ts`

- [ ] **Step 1: 写 document selectors 的失败测试**

Test file:
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/use-video-editor-document.test.ts`

Failing tests:

```ts
it('derives pending merge counts from local voice, local timing, and explicit missing voice sets', () => {
  const result = deriveDocumentPendingState({
    pendingVoiceEntries: [{ id: 'clip-1', updatedAtMs: 200 }],
    pendingTimingMap: { 'clip-2': { startMs: 1000, endMs: 2000 } },
    playbackBlockedVoiceIds: [],
    convertRows: [{ id: 'clip-3', vap_voice_status: 'missing', vap_needs_tts: false }],
    serverLastMergedAtMs: 100,
  });

  expect(result.pendingMergeCount).toBe(3);
  expect(result.pendingVoiceIdSet.has('clip-1')).toBe(true);
  expect(result.pendingTimingIdSet.has('clip-2')).toBe(true);
  expect(result.explicitMissingVoiceIdSet.has('clip-3')).toBe(true);
});
```

- [ ] **Step 2: 写 track/document 映射的失败测试**

Example:

```ts
it('maps convertObj subtitle arrays into unified converted and original tracks', () => {
  const result = mapConvertObjToEditorDocument({
    convertObj: {
      srt_source_arr: [{ id: 'source-1', start: '00:00:01,000', end: '00:00:02,000', txt: 'source' }],
      srt_convert_arr: [{ id: 'clip-1', start: '00:00:01,000', end: '00:00:02,000', txt: 'convert', audio_url: 'a.wav' }],
    } as any,
    locale: 'zh',
  });

  expect(result.subtitleTrackOriginal[0].id).toBe('source-1');
  expect(result.subtitleTrack[0].id).toBe('clip-1');
});
```

- [ ] **Step 3: 运行 document 测试，确认先失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/use-video-editor-document.test.ts'
```

Expected: FAIL，因为 document controller 尚不存在。

- [ ] **Step 4: 实现 selectors 与 mappers**

Implementation requirements:

1. `deriveDocumentPendingState()` 接管 page 中所有 pending set 的推导逻辑。
2. `mapConvertObjToEditorDocument()` 接管 `convertObj -> track` 的初始化映射。
3. 不改变现有 `sourceId`、`timing_rev_ms`、`audio_rev_ms`、`vap_*` 协议。

- [ ] **Step 5: 实现 `use-video-editor-document.ts`**

The hook must own:

- `convertObj`
- `videoTrack`
- `bgmTrack`
- `subtitleTrack`
- `subtitleTrackOriginal`
- `pendingVoiceEntries`
- `playbackBlockedVoiceIds`
- `pendingTimingMap`
- `workstationDirty`

It must expose handlers currently defined in `page.tsx`:

- `handleSubtitleTrackChange`
- `handleUpdateSubtitleAudio`
- `handleSubtitleTextChange`
- `handleSourceSubtitleTextChange`
- `handleSubtitleVoiceStatusChange`
- `handleResetTiming`

- [ ] **Step 6: 让 page 改为消费 document hook**

Replace direct state declarations in `page.tsx` with the new hook, but keep the external props to:

- `SubtitleWorkstation`
- `TimelinePanel`
- `VideoPreviewPanel`

unchanged.

- [ ] **Step 7: 回归文档相关测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/document/use-video-editor-document.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-editor-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx'
```

Expected: PASS

---

## Chunk 2: 收拢 Merge 与 Structural Edit

### Task 2: 新建 merge controller，接管顶部主按钮、轮询和下载门控

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/header-download-actions.tsx`

- [ ] **Step 1: 写 merge controller 的失败测试**

Example:

```ts
it('exposes retry-status as the primary action after repeated status polling failures', () => {
  const result = deriveMergeControllerState({
    taskStatus: 'pending',
    isGeneratingVideo: false,
    hasUnsavedChanges: false,
    serverActiveMergeJob: { jobId: 'job-1', createdAtMs: 1 },
    mergeStatusRequiresManualRetry: true,
  });

  expect(result.mergePrimaryAction.mode).toBe('retry-status');
  expect(result.mergePrimaryAction.disabled).toBe(false);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts'
```

Expected: FAIL because the controller does not exist yet.

- [ ] **Step 3: 实现 `use-video-editor-merge.ts`**

The hook must own:

- task status / progress / error
- `serverLastMergedAtMs`
- `serverActiveMergeJob`
- `mergeStatusRequiresManualRetry`
- polling / retry / timeout behavior
- primary CTA state
- download state and handlers

- [ ] **Step 4: 让 page 改为消费 merge hook**

Move out:

- metadata hydration
- merge status polling
- `handleGenerateVideo`
- `handleRetryMergeStatus`
- download handlers

- [ ] **Step 5: 回归 merge 相关测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/header-download-actions.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

### Task 3: 新建 structural-edit controller，接管 split / rollback / timing persist

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural-edit/use-video-editor-structural-edit.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural-edit/use-video-editor-structural-edit.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Modify if needed: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`

- [ ] **Step 1: 写 structural-edit controller 的失败测试**

Example:

```ts
it('forces structural preflight before split and rollback', async () => {
  const prepareForStructuralEdit = vi.fn().mockResolvedValue(true);
  const persistPendingTimingsIfNeeded = vi.fn().mockResolvedValue(true);

  const controller = createStructuralEditController({
    prepareForStructuralEdit,
    persistPendingTimingsIfNeeded,
  });

  await controller.beforeSplit();

  expect(prepareForStructuralEdit).toHaveBeenCalledTimes(1);
  expect(persistPendingTimingsIfNeeded).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural-edit/use-video-editor-structural-edit.test.ts'
```

Expected: FAIL because the controller does not exist yet.

- [ ] **Step 3: 实现 controller**

The hook must own:

- `isSplittingSubtitle`
- `isRollingBack`
- `hasUndoableOps`
- `undoCountdown`

and expose:

- `handleSubtitleSplit`
- `handleRollbackLatest`
- `handleUndoCancel`
- `persistPendingTimingsIfNeeded`
- UI flags for split/undo disablement

- [ ] **Step 4: page 改为消费 structural-edit hook**

Move out:

- `executeUndoNow`
- `handleRollbackLatest`
- `handleSubtitleSplit`
- timing persist logic
- split / undo tooltip state

- [ ] **Step 5: 回归 structural-edit 测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

---

## Chunk 3: 收拢 Playback Runtime

### Task 4: 抽出 playback controller 外壳，先不改变播放语义

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-audition-engine.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/audio-source-resolver.ts`
- Reuse: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.ts`

- [ ] **Step 1: 为 playback controller 写失败测试**

Example:

```ts
it('returns a transport snapshot and all public playback intents', () => {
  const result = createPlaybackControllerPublicApi();

  expect(result).toHaveProperty('transportSnapshot');
  expect(result).toHaveProperty('handlePlayPause');
  expect(result).toHaveProperty('handleSeek');
  expect(result).toHaveProperty('handleRetryBlockedPlayback');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts'
```

Expected: FAIL because the controller does not exist yet.

- [ ] **Step 3: 实现 `use-video-editor-playback.ts` 的第一版外壳**

Rule:

- 先把 page 中的播放状态、ref、callback 原样迁过去
- 暂时允许 controller 文件依旧较大
- 第一目标是 **page 薄下来**，不是立刻把 playback 也打磨成最优结构

- [ ] **Step 4: page 改为消费 playback hook**

Must move out:

- transport state / transport snapshot
- playback/buffering states
- all media refs
- `handlePlayPause`
- `handleSeek`
- audition actions
- blocked playback actions
- update loop / sync loop / warmup

- [ ] **Step 5: 回归 playback 关键测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

### Task 5: 拆 playback 内部纯实现文件

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/video-playback-cache.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/video-playback-sync.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/video-playback-engine.ts`
- Create tests if needed under same folder
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`

- [ ] **Step 1: 抽出 cache 纯函数**

Move:

- buffer policy
- cache get/set
- prefetch URL selection

- [ ] **Step 2: 抽出 sync 纯函数/适配器**

Move:

- video transport sync helpers
- transport time fallback
- stall / warmup helpers

- [ ] **Step 3: 抽出 engine helper**

Move:

- fetch/decode wrappers
- retry window helpers
- buffer orchestration helpers

- [ ] **Step 4: 运行 focused tests**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

---

## Chunk 4: 收口 Page Shell 与叶子组件装配

### Task 6: 新建页面壳层并将 page.tsx 收敛为路由入口

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/components/video-editor-header.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/components/video-editor-workspace.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/components/video-editor-timeline-dock.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/components/video-editor-dialogs.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`

- [ ] **Step 1: 写壳层的失败测试**

Example:

```ts
it('renders the page shell and delegates all business composition to it', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  expect(source).toContain("import { VideoEditorPageShell } from './video-editor-page-shell';");
  expect(source).toContain('return <VideoEditorPageShell');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts'
```

Expected: FAIL because shell does not exist yet.

- [ ] **Step 3: 创建 `VideoEditorPageShell`**

The shell must:

- instantiate document / merge / structural-edit / playback / layout hooks
- bridge outputs into leaf components
- keep current JSX structure visually unchanged

- [ ] **Step 4: 创建 header/workspace/timeline/dialogs 组件**

Rules:

- pure props only
- no business owner logic
- no polling / media refs / network requests

- [ ] **Step 5: 将 `page.tsx` 改成纯路由入口**

Target shape:

```tsx
export default function VideoEditorPage() {
  const params = useParams();
  return <VideoEditorPageShell params={params} />;
}
```

- [ ] **Step 6: 回归 shell 与页面测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-keybindings.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

---

## Chunk 5: 全量视频编辑页回归

### Task 7: 运行完整校验，确认重构未改变逻辑

**Files:**
- Verify entire video editor module

- [ ] **Step 1: 运行类型检查**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS

- [ ] **Step 2: 运行视频编辑页相关测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/header-download-actions.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-editor-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-state.test.ts'
```

Expected: PASS

- [ ] **Step 3: 运行构建**

Run:

```bash
pnpm build
```

Expected: PASS

- [ ] **Step 4: 人工核对 page.tsx 是否已真正变薄**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx'
```

Expected: `page.tsx` 明显下降到路由壳层级别，不再是业务主实现文件。

- [ ] **Step 5: 汇总迁移结果**

Checklist:

- `document` 是唯一文档 owner
- `merge` 是唯一合成 owner
- `structural-edit` 是唯一结构操作 owner
- `playback` 是唯一媒体运行时 owner
- `page.tsx` 只剩路由入口

---

Plan complete and saved to `docs/superpowers/plans/2026-03-30-video-editor-page-modularization.md`. Ready to execute?
