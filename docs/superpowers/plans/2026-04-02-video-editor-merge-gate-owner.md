# Video Editor Merge Gate Owner Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变视频编辑页现有业务语义、接口协议和用户闭环的前提下，完成 `merge session` 的完全 owner 化，并将 page 级跨域门控收口为显式 gate owner。

**Architecture:** 保留现有 `document / timing / playback / structural` session，不新增全局 store；先把 merge 域变成单一事实源，再新增纯 gate selector 聚合跨域 capability，最后压薄 page shell。全过程先补边界测试，再迁移实现，再跑编辑页全量回归。

**Tech Stack:** Next.js App Router, React 19 hooks/useReducer, TypeScript, Vitest, next-intl, Sonner

---

## File Structure

### Create

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/video-editor-merge-session.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.test.ts`

### Modify

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`

---

## Chunk 1: Freeze Merge Owner Boundary

### Task 1: 用测试冻结 merge owner 的职责边界

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`

- [ ] **Step 1: 先写 merge owner failing test**

```ts
it('transitions from requesting_merge to polling_status to manual_retry_required', () => {
  const state = createInitialMergeSessionState();
  const requesting = mergeSessionReducer(state, { type: 'merge_request_started' });
  const polling = mergeSessionReducer(requesting, {
    type: 'merge_request_succeeded',
    job: { jobId: 'job-1', createdAtMs: 123 },
  });
  const retry = mergeSessionReducer(polling, {
    type: 'status_poll_network_failed',
    failureCount: 3,
  });
  expect(retry.phase).toBe('manual_retry_required');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts'
```

Expected: FAIL，因为 owner 文件尚不存在。

- [ ] **Step 3: 补 boundary test，锁定 merge state 不应继续只靠裸 useState 组合**

Minimum assertions:

- `use-video-editor-merge.ts` 应导入 `merge-session-owner`
- page shell 不应自己声明 merge runtime state
- merge 的主 CTA / retry / download gate 应由 merge owner 或纯 selector 派生

- [ ] **Step 4: 运行边界测试确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: FAIL

---

## Chunk 2: Introduce Merge Session Owner

### Task 2: 实现最小 merge session owner

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/video-editor-merge-session.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts`

- [ ] **Step 1: 实现 owner state 和 reducer**

要求：

- phase 至少包含：
  - `idle`
  - `preparing`
  - `requesting_merge`
  - `polling_status`
  - `manual_retry_required`
  - `completed`
  - `failed`
- state 至少包含：
  - `taskStatus`
  - `taskErrorMessage`
  - `taskProgress`
  - `taskCurrentStep`
  - `activeJob`
  - `failureCount`
  - `lastMergedAtMs`

- [ ] **Step 2: 运行 owner 单测确认通过**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/merge-session-owner.test.ts'
```

Expected: PASS

---

## Chunk 3: Move useVideoEditorMerge onto Owner

### Task 3: 让 merge hook 内部消费 owner，但保持外部协议稳定

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts`

- [ ] **Step 1: 先补 failing test，锁定 hook 通过 owner 维护 merge phase**

Minimum assertions:

- `use-video-editor-merge.ts` 导入 `merge-session-owner`
- metadata hydrate / task hydrate / polling success / polling fail / manual retry 都通过 owner dispatch
- `mergePrimaryAction` 与 `headerDownloadState` 仍保持现有行为

- [ ] **Step 2: 运行相关测试确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts'
```

Expected: FAIL

- [ ] **Step 3: 实现最小迁移**

要求：

- `useState` 零散 merge state 尽量收口到 owner
- 轮询网络错误达到上限时进入 `manual_retry_required`
- `handleRetryMergeStatus` 只能解除手动重试锁，不得重置其它真实状态
- 不改下载处理函数的外部行为

- [ ] **Step 4: 运行相关测试确认通过**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

---

## Chunk 4: Introduce Page Gate Owner

### Task 4: 新增纯 gate selector，收口 page 级跨域 capability

**Files:**
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.ts`
- Create: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.ts`

- [ ] **Step 1: 先写 failing test**

```ts
it('prefers retry-status as the primary page action when merge polling requires manual recovery', () => {
  const gates = buildVideoEditorPageGates({
    merge: {
      phase: 'manual_retry_required',
      isTaskRunning: true,
      isMergeJobActive: true,
      mergeStatusRequiresManualRetry: true,
    },
    document: {
      hasUnsavedChanges: false,
    },
    structural: {
      blockReason: 'video-updating',
    },
  });

  expect(gates.header.primaryActionMode).toBe('retry-status');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.test.ts'
```

Expected: FAIL

- [ ] **Step 3: 实现最小 gate selector**

要求：

- 输出至少覆盖：
  - header primary action
  - header busy spinner
  - download gate
  - structural blocked reason
- 纯函数实现，不得直接依赖 React state

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.test.ts'
```

Expected: PASS

---

## Chunk 5: Compress Page Shell

### Task 5: 让 shell 只组装 session 与 gate

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts`

- [ ] **Step 1: 先补 failing boundary test**

Minimum assertions:

- page shell 导入 `video-editor-page-gates`
- shell 不再自己拼 header busy / retry / download / structural gate 组合
- shell 只消费 merge session + gate result

- [ ] **Step 2: 运行边界测试确认失败**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: FAIL

- [ ] **Step 3: 实现 shell 收薄**

要求：

- 保持 header / workspace / timeline 的 props 语义不变
- 不更改用户可见交互逻辑
- shell 只保留 assembler 职责

- [ ] **Step 4: 运行边界测试确认通过**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

Expected: PASS

---

## Chunk 6: Full Regression

### Task 6: 全量验证 merge + gate owner 迁移没有打断闭环

**Files:**
- Verify only

- [ ] **Step 1: 跑编辑页关键回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/use-video-editor-page-orchestration.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/orchestration/video-editor-page-gates.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-user-journeys.test.ts' \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page-playback-guards.test.ts'
```

- [ ] **Step 2: 跑整页与接口回归**

Run:

```bash
pnpm exec vitest run \
  'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]' \
  'tests/integration/video-task-generate-subtitle-voice.test.ts' \
  'tests/integration/generate-subtitle-voice-platform-errors.test.ts' \
  'tests/integration/video-task-split-subtitle.test.ts' \
  'tests/integration/video-task-update-subtitle-item-by-id.test.ts'
```

- [ ] **Step 3: 跑类型检查**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: 全绿

---

Plan complete and saved to `docs/superpowers/plans/2026-04-02-video-editor-merge-gate-owner.md`. Ready to execute?
