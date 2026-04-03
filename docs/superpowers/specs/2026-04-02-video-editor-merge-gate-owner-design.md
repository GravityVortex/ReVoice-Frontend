# 视频编辑页 Merge Session 与 Page Gate Owner 设计

> 日期：2026-04-02
> 主题：在不改变当前视频编辑页业务闭环与接口协议的前提下，完成 `merge session` 的完全 owner 化，并将 page 级门控收敛为显式 gate owner

## 背景

当前视频编辑页已经完成了 `document / playback / structural / timing` 的部分模块化，但 `merge` 与 page 级门控仍处于“半收口”状态：

- `merge` 相关状态散落在 [use-video-editor-merge.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts)
  - `taskStatus`
  - `taskErrorMessage`
  - `taskProgress`
  - `taskCurrentStep`
  - `serverActiveMergeJob`
  - `mergeStatusRequiresManualRetry`
  - `isGeneratingVideo`
- merge 纯规则虽然已有一部分抽到 [video-merge-state.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.ts)，但“状态 owner”还没有统一
- page shell 仍在 [video-editor-page-shell.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx) 内拼装大量跨域布尔值，再分别传给 header、timeline、workspace、structural

这导致两个典型问题：

1. **merge 状态漂移**
   metadata 恢复、详情 hydrate、发起合成、轮询状态、手动重试都可能分别影响 merge UI，但缺少统一 phase owner
2. **page 门控泛滥**
   `isTaskRunning / isMergeJobActive / hasUnsavedChanges / mergeStatusRequiresManualRetry / structuralEditBlockReason / headerDownloadState` 分散计算，页面要理解太多跨域细节

## 目标

- 将 merge 域收口为显式 `merge session owner`
- 保持现有业务语义不变：
  - 发起合成前必须完成 preflight
  - timing 未持久化时必须先保存
  - merge 状态轮询失败需要有限重试与显式失败出口
  - 下载入口只能在已有成功产物时显示
- 将 page 级门控从“散落布尔判断”改为“统一 capability/gate owner”
- 让 page shell 继续做 assembler，但不再自行理解 merge 内部状态组合

## 非目标

- 不引入 Zustand / Redux / XState
- 不改变后端 API、metadata 协议、下载协议、轮询频率
- 不重写 header / timeline / workspace UI
- 不把整个编辑页做成一个超级 reducer 或超级状态机

## 核心判断

### 一、merge 必须完全 owner 化

merge 是天然的单业务域，具备明确生命周期：

```text
idle
  -> preparing
  -> requesting_merge
  -> polling_status
  -> manual_retry_required
  -> completed / failed
```

这类状态如果继续靠多个 `useState + useEffect + ref` 维护，后续任何恢复逻辑或网络兜底都容易再次出现“按钮锁死/状态不一致”。

### 二、page 不应该 owner 化所有原始状态，只应该 owner 化“门控决策结果”

page 的职责不是再次拥有 `document / playback / timing / merge / structural` 的状态事实源，而是消费这些 session 的稳定输出，生成统一的 capability 结果：

- `canGenerateVideo`
- `canRetryMergeStatus`
- `canSplitSubtitle`
- `canRollback`
- `canDownload`
- `showBusySpinner`
- `blockedReason`
- `preferredAction`

也就是说，page 只 owner 化 **gate result**，不 owner 化 **domain state**。

## 目标架构

```text
[documentSession]      [timingSession]      [playbackSession]      [structuralSession]
        \                     |                     |                       /
         \                    |                     |                      /
          \                   |                     |                     /
                    [mergeSession]
                          |
                          v
                 [pageGateOwner / capability selectors]
                          |
                          v
                 [video-editor-page-shell]
                          |
        ┌─────────────────┼─────────────────┐
        v                 v                 v
   [Header]          [Workspace]       [Timeline]
```

## 模块规划

### 1. Merge Session

#### `runtime/merge/merge-session-owner.ts`

职责：

- 定义 merge domain 的显式 state 与 reducer
- 统一 phase：
  - `idle`
  - `preparing`
  - `requesting_merge`
  - `polling_status`
  - `manual_retry_required`
  - `completed`
  - `failed`
- 保存 merge 相关运行数据：
  - `taskStatus`
  - `taskErrorMessage`
  - `taskProgress`
  - `taskCurrentStep`
  - `activeJob`
  - `failureCount`
  - `lastMergedAtMs`

#### `runtime/merge/video-editor-merge-session.ts`

职责：

- 对外定义 merge session 协议
- 将 reducer state + actions 封装为 page 可消费的稳定接口

#### `runtime/merge/use-video-editor-merge.ts`

职责：

- 保留副作用：
  - metadata hydrate
  - task detail hydrate
  - merge status polling
  - generate / retry / download handlers
- 不再直接拼装分散的 merge 布尔值
- 所有 merge UI 派生值改为基于 merge owner 输出计算

### 2. Page Gate Owner

#### `runtime/orchestration/video-editor-page-gates.ts`

职责：

- 纯函数 gate selector
- 输入：
  - merge session view
  - timing session view
  - document pending state
  - structural state
  - playback blocked state
- 输出：
  - header gate
  - structural gate
  - download gate
  - page busy state

#### `runtime/orchestration/use-video-editor-page-orchestration.ts`

职责调整：

- 继续 owner：
  - unsaved changes guard
  - back navigation
  - labels / tooltip text
- 不再承担跨域门控逻辑
- 只消费 `pageGateOwner` 的结果

### 3. Page Shell

#### `video-editor-page-shell.tsx`

调整目标：

- 继续作为 assembler
- 不再自己理解如下组合：
  - `isGeneratingVideo || isTaskRunning || isMergeJobActive`
  - `isMergeJobActive && mergeStatusRequiresManualRetry`
  - `headerDownloadState + tooltip + primary action`
- 只负责：
  - 创建各 session
  - 调用 gate selector
  - 将 session/gate 传给 header/workspace/timeline

## 迁移策略

### 阶段 1：冻结 merge 现有边界

- 先补 boundary test
- 锁定 merge state owner 不应继续散落在 page
- 锁定 page shell 不应继续直接消费 merge 内部细节

### 阶段 2：引入 merge owner，但不改 UI 协议

- 新增 merge owner / session 文件
- `useVideoEditorMerge` 改为内部消费 owner
- 对外返回字段先保持兼容，降低迁移风险

### 阶段 3：引入 page gate owner

- 将跨域布尔组合收口到纯 selector
- header、structural、download 的 capability 都从 gate owner 出

### 阶段 4：压缩 page shell

- 去掉散落在 shell 的 capability 组装逻辑
- shell 只做 session + gate assembler

## 预期收益

- merge 状态不再漂移，失败出口更清晰
- 页面门控不再泛滥，按钮和 tooltip 的语义统一
- page shell 明显瘦身，跨域依赖收敛
- 回归测试更容易围绕 phase/gate 进行验证

## 主要风险

- 若迁移期保留双事实源，会导致 merge 状态被新旧 owner 同时写入
- 若 page gate owner 设计过大，可能把 page 再次做成新的超级 owner
- 若 phase 设计过细，会提升维护成本并放大迁移噪音

## 风险控制

- 每次只迁一个 owner
- 先加 failing test，再迁实现
- 先保持外部 UI 协议稳定，再做 page shell 收薄
- 每个 chunk 后都跑视频编辑页全链路回归和 `tsc`
