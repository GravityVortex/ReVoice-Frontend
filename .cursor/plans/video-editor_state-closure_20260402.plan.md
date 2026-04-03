# Video Editor State Closure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将视频编辑页的 `timing 持久化域` 与 `merge 域` 收口为显式 session owner，压缩 page 级编排复杂度，并用全链路回归验证“编辑 -> 试听 -> 切割 -> 回滚 -> 合成 -> 刷新恢复”的稳定闭环。

**Architecture:** 保留现有页面行为与 UI 协议，优先做“内部 owner 收口”。`documentSession` 继续作为页面文档事实源；新增 `timingSession` 管理时间轴本地脏数据、autosave、persist、rollback reconcile；将 `merge` 从分散状态拼装改为显式 phase/session。最后将 page shell 继续压成 session assembler，减少跨域门控散落。

**Tech Stack:** Next.js App Router, React hooks/useReducer, Vitest, TypeScript, next-intl

---

## File Structure

### 新增文件

- `.cursor/plans/video-editor_state-closure_20260402.plan.md`
  本计划文件。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/video-editor-timing-session.ts`
  timing session 对外协议构建器，给 page shell / structural edit / timeline 使用。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.ts`
  timing session reducer/state owner，统一管理 pending timing、autosave phase、last persist result、latest idMap。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.ts`
  纯逻辑控制器，负责 autosave、显式 persist、rollback reconcile、id remap。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/use-video-editor-timing-session.ts`
  timing 域公共 hook，外部返回稳定协议。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts`
  timing owner 的 reducer / phase 测试。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts`
  timing persist/reconcile 纯逻辑测试。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/video-editor-merge-session.ts`
  merge session 对外协议。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.ts`
  merge phase owner，统一 `preparing/requesting/polling/manual-retry/completed/failed`。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts`
  merge owner phase 测试。

### 重点修改文件

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.ts`
  去掉 timing 域 owner 职责，只保留 split/undo/blocking/prepare。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.ts`
  从“转发一个 handler”升级为消费 timing session 的 merge 前持久化协议，或在 owner 收口后删除。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
  收口为 merge session wrapper，内部改走 merge owner。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
  从直接拼装 timing/merge 内部细节，改为消费 `timingSession` 与 `mergeSession`。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-timeline-session.ts`
  timeline session 改为直接消费 timing/structural 协议，而不是 page shell 传散装字段。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace-capabilities.ts`
  workspace capability 收口 timing/merge 相关输入。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`
  更新对新 session owner 边界的约束。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts`
  更新 structural hook 只负责 structural action 的边界测试。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
  更新 merge session 行为测试。
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts`
  增补 timing/merge 场景回归。

---

## Chunk 1: Timing Session 收口

### Task 1: 定义 timing session 协议与 owner state

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/video-editor-timing-session.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts`

- [ ] **Step 1: 写 failing test，锁定 timing phase 和 owner state**

```ts
it('tracks timing phase across dirty autosaving save_failed and idle', () => {
  const state = createInitialTimingSessionState();
  const dirty = timingSessionReducer(state, stagePendingTiming({ id: 'clip-1', startMs: 1000, endMs: 2000 }));
  expect(dirty.phase).toBe('dirty');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts'`

Expected: FAIL，提示缺少 owner/reducer 文件或 phase/action 未实现。

- [ ] **Step 3: 实现最小 owner state 与 reducer**

要求：
- phase 至少包含 `idle / dirty / autosaving / save_failed / persisting_for_split / rollbacking`
- state 至少包含 `pendingTimingMap / latestPersistIdMap / lastPersistError / lastPersistedAtMs`
- action 至少包含 `stage_timing / autosave_start / autosave_success / autosave_failed / persist_start / persist_success / persist_failed / rollback_start / rollback_finish / reset_for_convert`

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts'`

Expected: PASS

- [ ] **Step 5: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/video-editor-timing-session.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts'
git commit -m "refactor: add timing session owner"
```

### Task 2: 抽出 timing persist controller

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.ts`

- [ ] **Step 1: 写 failing test，覆盖 persist 与 reconcile 行为**

```ts
it('reconciles pending timing and remapped ids after persist', () => {
  const next = reconcileTimingAfterPersist(...);
  expect(next.pendingTimingMap).toEqual({});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts'`

Expected: FAIL

- [ ] **Step 3: 实现最小 controller**

要求：
- 迁移 `reconcilePendingTimingAfterPersist / reconcilePendingTimingMap / remapSubtitleIdAfterTimingSave` 的 orchestration 逻辑
- controller 只接受纯输入，不直接依赖 React state
- 输出必须显式返回 `nextPendingTimingMap / nextConvertRows / nextIdMap / phase`

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts'`

Expected: PASS

- [ ] **Step 5: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.ts'
git commit -m "refactor: extract timing persist controller"
```

### Task 3: 新建 useVideoEditorTimingSession 并瘦身 structural hook

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/use-video-editor-timing-session.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.test.ts`

- [ ] **Step 1: 先改结构测试到失败**

需要新增断言：
- `useVideoEditorStructuralEdit` 不再自己拥有 autosave timer owner
- `persistPendingTimingsIfNeeded` 改由 timing session 提供
- bridge 不再保存裸函数，而是适配 timing session 的稳定方法

- [ ] **Step 2: 运行局部测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.test.ts'`

Expected: FAIL

- [ ] **Step 3: 实现最小 timing session hook**

要求：
- 输入仍兼容当前 page 侧数据
- 对外暴露 `pendingTimingMap / pendingTimingCount / phase / persistPendingTimingsIfNeeded / stageTiming / reconcileAfterRollback`
- 保持现有 UI 行为不变

- [ ] **Step 4: 重写 structural hook，使其只保留 structural action owner**

要求：
- `splitDisabled / undoDisabled / blockReason / split / undo`
- 不再直接拥有 autosave/persist phase
- split 前仍必须通过 timing session 做显式 persist

- [ ] **Step 5: 运行局部测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.test.ts'`

Expected: PASS

- [ ] **Step 6: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/use-video-editor-timing-session.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/bridge/use-video-editor-structural-timing-bridge.test.ts'
git commit -m "refactor: move timing persistence into timing session"
```

---

## Chunk 2: Merge Session 收口

### Task 4: 定义 merge session owner phase

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/video-editor-merge-session.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts`

- [ ] **Step 1: 写 failing test，锁定 merge phase**

```ts
it('enters manual_retry_required after repeated status polling failures', () => {
  const next = mergeSessionReducer(state, statusPollFailed());
  expect(next.phase).toBe('manual_retry_required');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts'`

Expected: FAIL

- [ ] **Step 3: 实现最小 merge owner**

要求：
- phase 至少包含 `idle / ready_to_generate / preparing / requesting_merge / polling_status / manual_retry_required / completed / failed`
- 保留 `activeJob / failureCount / taskState / downloadState` 所需信息
- `video-merge-state.ts` 继续只做纯计算

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts'`

Expected: PASS

- [ ] **Step 5: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/video-editor-merge-session.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts'
git commit -m "refactor: add merge session owner"
```

### Task 5: 将 useVideoEditorMerge 改为 merge session wrapper

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`

- [ ] **Step 1: 先改测试到失败**

需要新增断言：
- `useVideoEditorMerge` 内部消费 merge session owner
- `mergePrimaryAction` 由 session phase 推导
- `manual retry`、`active job hydrate`、`terminal clear` 都由 owner 驱动

- [ ] **Step 2: 运行局部测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'`

Expected: FAIL

- [ ] **Step 3: 做最小实现**

要求：
- 对外仍保留 `handleGenerateVideo / handleRetryMergeStatus / handleDownloadVideo / handleDownloadAudio / handleDownloadSrt`
- UI 不感知内部 phase 重构
- 非 0 response、网络失败、超时、刷新恢复都必须落到明确 phase

- [ ] **Step 4: 运行局部测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'`

Expected: PASS

- [ ] **Step 5: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
git commit -m "refactor: route merge flow through merge session"
```

---

## Chunk 3: Page Shell 压缩与跨域编排收口

### Task 6: page shell 改成消费 timingSession / mergeSession

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-timeline-session.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace-capabilities.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts`

- [ ] **Step 1: 先改测试到失败**

需要新增断言：
- page shell 不再直接理解 timing autosave 内部状态
- page shell 不再拼 merge 内部标志位
- timeline/workspace 消费 session 协议，而不是散装字段

- [ ] **Step 2: 运行局部测试确认失败**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts'`

Expected: FAIL

- [ ] **Step 3: 做最小实现**

要求：
- page shell 只做 session assembler
- 继续保留 `documentSession / playbackSession / timingSession / mergeSession / workspaceCapabilities / timelineSession`
- 现有组件 props 协议如无必要不改

- [ ] **Step 4: 运行局部测试确认通过**

Run: `pnpm exec vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts'`

Expected: PASS

- [ ] **Step 5: 提交一个小步 commit**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-timeline-session.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace-capabilities.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
        'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts'
git commit -m "refactor: assemble editor page from stable sessions"
```

---

## Chunk 4: 全链路验证

### Task 7: 跑 timing/merge/structural 局部验证

**Files:**
- Test only

- [ ] **Step 1: 跑 timing 局部测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-session-owner.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/timing/timing-persist-controller.test.ts'
```

Expected: PASS

- [ ] **Step 2: 跑 merge/structural 局部测试**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

### Task 8: 跑完整编辑页与接口回归

**Files:**
- Test only

- [ ] **Step 1: 跑完整视频编辑页回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]' \
  'tests/integration/video-task-generate-subtitle-voice.test.ts' \
  'tests/integration/generate-subtitle-voice-platform-errors.test.ts' \
  'tests/integration/video-task-split-subtitle.test.ts' \
  'tests/integration/video-task-update-subtitle-item-by-id.test.ts'
```

Expected: PASS，且 `video-editor-user-journeys`、`page-playback-guards`、`subtitle-workstation-merge-flow` 全绿。

- [ ] **Step 2: 跑类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

- [ ] **Step 3: 人工验证以下场景**

1. 进入页面后刷新恢复，merge 状态与下载态正确。
2. 修改字幕文本，退出拦截正确。
3. 调整时间轴后等待 autosave，再刷新，pending timing 不漂移。
4. 调整时间轴后立即 split，split 前先 persist，子字幕 id 映射正确。
5. split 后重新生成译音，convert audition 可用，不出现“音频没准备好但再点不触发请求”。
6. rollback 后 pending timing / pending voice / blocked voice 与文档态一致。
7. merge 轮询网络失败后进入 manual retry，页面不锁死。
8. merge 状态接口返回非 0 时，页面明确失败并解锁。

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "refactor: close timing and merge state loops in video editor"
```

---

## 执行顺序约束

1. 必须先做 `Chunk 1`
2. `Chunk 2` 依赖 `Chunk 1` 完成后的 timing session 稳定协议
3. `Chunk 3` 只能在 `Chunk 1 + Chunk 2` 通过局部测试后执行
4. 每个 chunk 结束都要跑对应局部验证，不能直接跳到全量回归

## 非目标

- 本轮不改播放域已有的 transport / audition / blocking 设计
- 本轮不恢复时间轴拖动能力
- 本轮不新增新的用户可见功能，只做稳定性收口与职责重构

## 风险提示

- `split` 与 `timing persist` 都会改写 `convertObj.srt_convert_arr`，实现时必须严格保持 `documentSession` 为唯一文档事实源
- `merge` phase 重构不能影响现有下载入口可见性计算
- `page shell` 压缩不能把 capability builder 重新变成散装 props 中转站

## 完成标准

- `timing` 与 `merge` 都有显式 owner/session
- `page shell` 只负责组装 session，不再掌握 timing/merge 内部细节
- 全部编辑页测试与集成测试通过
- 复杂路径人工验证通过，尤其是：
  `调 timing -> split -> 生成译音 -> convert audition -> merge -> 刷新恢复`
