# Video Editor Remaining Modularization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变当前视频编辑页业务逻辑、交互闭环、失败出口与接口协议的前提下，继续拆掉剩余超大模块，让播放、工作台、时间轴和页面壳层都收敛成明确的 owner + coordinator 结构。

**Architecture:** 保留现有 `document / merge / structural-edit / bootstrap` owner，不再引入新的全局 store 或状态机框架；对剩余重模块采用“先冻结行为，再抽纯逻辑，再抽副作用控制器，最后收薄 orchestrator”的顺序。所有拆分必须先补 contract test，再迁移实现，最后跑编辑页全量回归，确保逻辑不变。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, HTMLMediaElement, WebAudio, Sonner

---

## Current Risk Targets

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
  - 当前约 `3630` 行
  - 同时承担 transport、video sync、subtitle engine、audition、voice cache、blocking retry
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
  - 当前约 `1560` 行
  - 同时承担 source 文案草稿、配音任务恢复、行级动作、聚焦滚动、过滤与列表渲染
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
  - 当前约 `791` 行
  - 同时承担 waveform 加载、blocked clip 展示、segment click 行为和渲染
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
  - 当前约 `453` 行
  - 仍然承载过多 selector、bridge glue 和 controller 组装细节

## Hard Constraints

- 不改变任何后端 API、metadata 协议、字幕 timing 协议、音频 URL 协议
- 不改变当前弱网交互语义
  - `retrying`
  - `network_failed`
  - `voice_unavailable`
- 不恢复时间轴拖动
- 不恢复字幕位置拖拽
- 不引入 Zustand / Redux / XState 等新框架
- 拆分过程中允许整体调整文件布局，但必须以测试守住闭环

## Target Boundaries

### Playback Target

- `use-video-editor-playback.ts` 只保留：
  - 页面级 state owner
  - DOM ref owner
  - 子模块装配
  - 对 shell 暴露的 public handlers
- 低层逻辑拆到独立文件：
  - `playback-blocking.ts`
  - `playback-video-sync.ts`
  - `playback-voice-cache.ts`
  - `playback-subtitle-engine.ts`
  - `playback-audition-controller.ts`
  - `playback-time-loop.ts`

### Workstation Target

- `subtitle-workstation.tsx` 只保留：
  - props 适配
  - `SubtitleWorkstationHandle` 暴露
  - 顶层布局与列表拼装
- 工作台内部逻辑拆到独立模块：
  - `subtitle-workstation-source-drafts.ts`
  - `subtitle-workstation-pending-jobs.ts`
  - `subtitle-workstation-row-actions.ts`
  - `subtitle-workstation-focus.ts`

### Timeline Target

- `timeline-panel.tsx` 只保留：
  - timeline 容器布局
  - `TimelineHandle` 暴露
  - 各轨道渲染装配
- 时间轴内部逻辑拆到独立模块：
  - `timeline-waveform-loader.ts`
  - `timeline-blocked-state.ts`
  - `timeline-track-layers.tsx`

### Shell Target

- `video-editor-page-shell.tsx` 只保留：
  - route params / i18n
  - 调用 controller hooks
  - 渲染 header / workspace / timeline / dialogs
- 跨 controller glue 收口到：
  - `runtime/orchestration/use-video-editor-shell-coordination.ts`

## File Structure Plan

### Create

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-subtitle-engine.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-subtitle-engine.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-audition-controller.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-audition-controller.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-time-loop.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-time-loop.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-split-boundary.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-boundary.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.test.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel-boundary.test.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.test.ts`

### Modify

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.ts`

---

## Chunk 0: Freeze Remaining Boundaries

### Task 0: 建立剩余大模块的边界基线

**Files:**
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-split-boundary.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-boundary.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel-boundary.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`

- [ ] **Step 1: 记录当前文件体量**

Run:

```bash
wc -l \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx'
```

Expected: 记录基线，后续每个 chunk 结束后重新对比。

- [ ] **Step 2: 运行当前关键回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts'
```

Expected: PASS，作为拆分前行为冻结样本。

- [ ] **Step 3: 新增 playback boundary 测试**

Failing test example:

```ts
it('delegates blocking, video sync, voice cache, subtitle engine and audition logic to dedicated modules', () => {
  const source = readFileSync(new URL('./runtime/playback/use-video-editor-playback.ts', import.meta.url), 'utf8');
  expect(source).toContain("from './playback-blocking'");
  expect(source).toContain("from './playback-video-sync'");
  expect(source).toContain("from './playback-voice-cache'");
  expect(source).toContain("from './playback-subtitle-engine'");
  expect(source).toContain("from './playback-audition-controller'");
});
```

- [ ] **Step 4: 新增 workstation / timeline / shell boundary 测试**

Minimum assertions:

- `subtitle-workstation.tsx` 应导入 source drafts、pending jobs、row actions、focus helpers
- `timeline-panel.tsx` 应导入 waveform loader、blocked state、track layers
- `video-editor-page-shell.tsx` 不应再自己做 active document selector 拼装和多段 bridge glue

- [ ] **Step 5: 运行新增边界测试，确认先失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-split-boundary.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-boundary.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel-boundary.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts'
```

Expected: FAIL，因为边界尚未完成。

---

## Chunk 1: Split Playback Pure Infrastructure

### Task 1: 先抽播放里的纯逻辑和可独立测试的工具模块

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts`

- [ ] **Step 1: 为 blocking helpers 写失败测试**

Cover:

- `resolveRetryablePlaybackContext`
- `createNetworkFailedBlockingState`
- 启动失败时的 retry context 选择顺序：`preferredClipIndex -> subtitleId -> currentTime -> nextClip`

Example:

```ts
it('falls back from preferred clip to current time and then next clip for retry context', () => {
  const track = [
    { id: 'a', startTime: 1, duration: 1 },
    { id: 'b', startTime: 4, duration: 1 },
  ] as any;

  expect(resolveRetryablePlaybackContext(track, 3.2, 99, undefined)).toEqual({
    clipIndex: 1,
    subtitleId: 'b',
  });
});
```

- [ ] **Step 2: 为 video sync helpers 写失败测试**

Cover:

- `waitForVideoWarmup`
- `playVideoWithGate`
- `applyVideoTransportSnapshot` 返回真实启动结果

- [ ] **Step 3: 为 voice cache helpers 写失败测试**

Cover:

- buffer policy
- cache eviction
- prefetch start index
- fetch timeout / retry window 行为

- [ ] **Step 4: 运行纯逻辑测试，确认先失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.test.ts'
```

Expected: FAIL，因为新模块尚不存在。

- [ ] **Step 5: 实现三个纯模块**

Module responsibilities:

- `playback-blocking.ts`
  - retry context 解析
  - blocking state builders
  - `network_failed / retrying / voice_unavailable` 的纯决策逻辑
- `playback-video-sync.ts`
  - `waitForVideoWarmup`
  - `playVideoWithGate`
  - video transport snapshot apply 封装
- `playback-voice-cache.ts`
  - fetch / decode / cache / prefetch 的纯规则

- [ ] **Step 6: 让 `use-video-editor-playback.ts` 改为消费纯模块**

Hard rule:

- 不改 public API
- 不改 test names
- 不改 transport reducer 协议

- [ ] **Step 7: 回归 playback 纯逻辑与原 hook 测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-blocking.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-video-sync.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-voice-cache.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

- [ ] **Step 8: 记录阶段目标**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts'
```

Expected: 目标降到 `<= 2600` 行。

- [ ] **Step 9: Commit**

```bash
git add \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
git commit -m "refactor: extract playback infrastructure modules"
```

---

## Chunk 2: Split Playback Runtime Controllers

### Task 2: 把 subtitle engine、audition、time loop 从 playback hook 里拆出来

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-subtitle-engine.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-subtitle-engine.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-audition-controller.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-audition-controller.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-time-loop.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-time-loop.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-split-boundary.test.ts`

- [ ] **Step 1: 为 subtitle engine 写失败测试**

Cover:

- `beginSubtitleBuffering`
- media fallback 恢复
- `subtitle-buffering-resume` 启动失败回落到 `network_failed`

- [ ] **Step 2: 为 audition controller 写失败测试**

Cover:

- convert audition gate
- source audition fallback
- `syncStarted` 失败时回收 audition owner

- [ ] **Step 3: 为 time loop 写失败测试**

Cover:

- currentTime 更新
- active clip 更新
- video stall / resume
- BGM kick 节流

- [ ] **Step 4: 运行三个新测试，确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-subtitle-engine.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-audition-controller.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/playback-time-loop.test.ts'
```

Expected: FAIL

- [ ] **Step 5: 实现三个运行时模块**

Module responsibilities:

- `playback-subtitle-engine.ts`
  - subtitle buffering
  - media / webaudio 双后端同步
  - media failure pause / retry 决策
- `playback-audition-controller.ts`
  - source / convert audition request
  - audition stop / toggle
  - owner cleanup
- `playback-time-loop.ts`
  - update loop
  - active clip 驱动
  - stall detection / resume

- [ ] **Step 6: 收薄 `use-video-editor-playback.ts`**

Checklist:

- hook 中不再直接定义 fetch/decode 细节
- hook 中不再直接定义 audition 低层启动流程
- hook 中不再直接定义 update loop 细节

- [ ] **Step 7: 运行 playback 全回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-sync-controller.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

- [ ] **Step 8: 记录阶段目标**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts'
```

Expected: 目标降到 `<= 1200` 行。

- [ ] **Step 9: Commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback'
git commit -m "refactor: split playback runtime controllers"
```

---

## Chunk 3: Split Subtitle Workstation

### Task 3: 把工作台内部逻辑拆成 source drafts、pending jobs、row actions、focus helpers

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-boundary.test.ts`

- [ ] **Step 1: 为 source drafts 写失败测试**

Cover:

- convert text debounce autosave
- source text debounce autosave
- pending source save flush

- [ ] **Step 2: 为 pending jobs 写失败测试**

Cover:

- 恢复未完成 job
- 任务轮询终态归并
- 无效草稿音频清理

- [ ] **Step 3: 为 row actions / focus 写失败测试**

Cover:

- `handleConvert`
- `handleSave`
- `scrollToItem`
- merge blocked item focus

- [ ] **Step 4: 运行新测试，确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.test.ts'
```

Expected: FAIL

- [ ] **Step 5: 实现四个工作台子模块**

Module responsibilities:

- `subtitle-workstation-source-drafts.ts`
  - source / convert 文案自动保存
- `subtitle-workstation-pending-jobs.ts`
  - resume pending jobs
  - polling
  - preview audio / pending state reconcile
- `subtitle-workstation-row-actions.ts`
  - convert / save / refresh 行级动作
- `subtitle-workstation-focus.ts`
  - scroll / focus / merge blocking target resolve

- [ ] **Step 6: 保持 `SubtitleWorkstationHandle` 协议不变**

Must remain:

- `scrollToItem`
- `prepareForVideoMerge`
- `onVideoSaveClick`
- `prepareForStructuralEdit`
- `commitPreviewSubtitleText`

- [ ] **Step 7: 回归工作台测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-source-drafts.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-pending-jobs.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-row-actions.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-focus.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-merge-flow.test.ts'
```

Expected: PASS

- [ ] **Step 8: 记录阶段目标**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'
```

Expected: 目标降到 `<= 700` 行。

- [ ] **Step 9: Commit**

```bash
git add \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-'*
git commit -m "refactor: split subtitle workstation controllers"
```

---

## Chunk 4: Split Timeline Panel

### Task 4: 把 timeline 的 waveform、blocked-state、track 渲染层拆开

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.test.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.tsx`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel-boundary.test.tsx`

- [ ] **Step 1: 为 waveform loader 写失败测试**

Cover:

- duration load queue
- abort cleanup
- proxy url 派生

- [ ] **Step 2: 为 blocked-state 写失败测试**

Cover:

- blocked converted item id
- blocked label
- gate banner props

- [ ] **Step 3: 为 track layers 写失败测试**

Cover:

- original / converted segment click
- auto follow anchor
- disabled drag constraint remains intact

- [ ] **Step 4: 运行 timeline 新测试，确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.test.tsx'
```

Expected: FAIL

- [ ] **Step 5: 实现三个 timeline 子模块**

Rules:

- `timeline-panel.tsx` 不再直接持有 waveform duration queue
- `timeline-panel.tsx` 不再直接拼 blocked clip 文案
- 时间轴拖动相关能力保持禁用，不做恢复

- [ ] **Step 6: 回归 timeline 测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-waveform-loader.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-blocked-state.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-track-layers.test.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'
```

Expected: PASS

- [ ] **Step 7: 记录阶段目标**

Run:

```bash
wc -l 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx'
```

Expected: 目标降到 `<= 350` 行。

- [ ] **Step 8: Commit**

```bash
git add \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-'*
git commit -m "refactor: split timeline panel modules"
```

---

## Chunk 5: Thin Page Shell Coordination

### Task 5: 让页面壳层只做 controller 装配，跨域桥接下沉到 orchestration

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`

- [ ] **Step 1: 为 shell coordination 写失败测试**

Cover:

- `activeDocument` selector 不再写在 shell
- bootstrap detail hydrate 不再写在 shell
- header tooltip / unsaved dialog / back click / bridge glue 统一由 orchestration 暴露

Example:

```ts
it('keeps page shell as a thin composition layer over orchestration and controllers', () => {
  const source = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');
  expect(source).toContain("useVideoEditorShellCoordination");
  expect(source).not.toContain('getActiveVideoEditorDocumentState(');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts'
```

Expected: FAIL

- [ ] **Step 3: 实现 `use-video-editor-shell-coordination.ts`**

This hook must own:

- active document selection
- bootstrap -> merge hydrate sync
- document session reset on convert switch
- header labels / tooltip
- unsaved leave dialog behavior
- shell-level derived props for header / workspace / timeline

- [ ] **Step 4: 收薄 `video-editor-page-shell.tsx`**

Hard target:

- shell 不再直接处理大段 `useMemo` selector glue
- shell 不再自己写多个跨域 `useEffect`
- shell 文件控制在 `<= 250` 行

- [ ] **Step 5: 回归 shell 与 orchestration 测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-shell-coordination.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-header.test.ts'
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration'
git commit -m "refactor: thin video editor page shell"
```

---

## Chunk 6: Full Verification and Acceptance Gate

### Task 6: 用完整回归验证“拆分了，但逻辑没有变”

**Files:**
- Modify: `docs/superpowers/plans/2026-03-31-video-editor-remaining-modularization.md`
- Inspect: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/**/*`

- [ ] **Step 1: 运行编辑页整组回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]' \
  'src/app/api/video-task/auto-save-draft/route.test.ts'
```

Expected: PASS

- [ ] **Step 2: 运行类型检查**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: 对比最终文件体量**

Run:

```bash
wc -l \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/playback/use-video-editor-playback.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx'
```

Expected:

- `use-video-editor-playback.ts <= 1200`
- `subtitle-workstation.tsx <= 700`
- `timeline-panel.tsx <= 350`
- `video-editor-page-shell.tsx <= 250`

- [ ] **Step 4: 手动核对四条关键闭环**

Checklist:

- 主播放启动失败 -> `network_failed`
- blocked retry 失败 -> 回到 `network_failed`
- subtitle buffering resume 失败 -> 回到 `network_failed`
- merge status 恢复失败 / 网络失败 -> 页面不锁死

- [ ] **Step 5: 更新计划文档结果区**

Record:

- each chunk verification result
- final line counts
- any residual risks

- [ ] **Step 6: Final Commit**

```bash
git add docs/superpowers/plans/2026-03-31-video-editor-remaining-modularization.md
git commit -m "docs: record remaining video editor modularization plan"
```

---

## Acceptance Criteria

- 行为层：
  - 用户可见交互语义不变
  - 失败出口不减少
  - 任何一个播放启动分支都必须“确认成功再进入播放态”
- 结构层：
  - shell / playback / workstation / timeline 都不再是超大混合职责文件
  - 每个新增模块职责单一、可独立测试
- 验证层：
  - 编辑页整组测试通过
  - `tsc --noEmit` 通过
  - boundary tests 能明确卡住未来回退

## Recommended Execution Order

1. Chunk 0
2. Chunk 1
3. Chunk 2
4. Chunk 3
5. Chunk 4
6. Chunk 5
7. Chunk 6

不要跳步。  
尤其不要在 Chunk 1 之前就直接碰 shell，否则只会把现有耦合转移位置，不会真的减少复杂度。
