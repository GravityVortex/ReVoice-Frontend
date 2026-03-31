# 视频编辑页整体模块化重构设计

> 日期：2026-03-30
> 主题：在保持当前业务逻辑与交互闭环不变的前提下，对 `video-editor/[id]/page.tsx` 进行整体模块化重构

## 背景

当前视频编辑页的主文件 [page.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx) 已经增长到 `5033` 行，并且同时承担了以下多类职责：

- 页面级数据 owner：`convertObj`、视频轨道、译音轨道、原字幕轨道、pending 变更、任务状态
- 播放运行时 owner：WebAudio、`HTMLVideoElement`、试听、transport reducer、阻塞态、缓存与预取
- 结构编辑 owner：split、rollback、timing persist、source autosave、结构编辑门控
- 合成链路 owner：merge 发起、状态恢复、轮询、下载门控、顶部主按钮
- 页面装配 owner：header、preview、timeline、workstation、快捷键、离开保护、布局存储

这不是“一个大文件难读”这么简单，而是 **状态 owner 与副作用边界已经交织在一起**。  
当前代码存在以下结构性问题：

- `convertObj / subtitleTrack / subtitleTrackOriginal / subtitleItems` 有多份主状态来源
- 播放链路与结构编辑链路共享大量 `ref / state / effect`，互相依赖顺序
- 工作台、时间轴、预览区虽然已经拆成组件，但 page 仍是巨大 orchestrator
- 任何一个功能修复都容易扫到整个页面的其它链路

## 目标

- 将视频编辑页重构为 **页面壳层 + 领域控制器 + 纯视图组件** 的结构
- 保持当前所有业务逻辑、闭环约束、交互语义、接口协议不变
- 明确每条功能链路的唯一状态 owner，消除“同一事实由多处维护”的问题
- 让未来的修复与功能迭代可以落在局部模块，不再频繁触碰整个 page 文件
- 为后续补全更强行为测试提供稳定边界

## 非目标

- 本次不重做 UI 视觉
- 不改变后端 API、轮询协议、字幕数据协议、音频路径协议
- 不重写播放引擎语义，不把现有逻辑整体替换成全新状态机框架
- 不追求一次性“最优架构”，而是追求 **逻辑不变前提下的可迁移模块化**

## 现状分析

### 1. 当前已经出现的“正确抽离方向”

目前代码里已经有几个抽离成功的种子模块：

- [editor-transport.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts)
- [playback-gate.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.ts)
- [video-merge-state.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-merge-state.ts)
- [video-editor-structural-edit.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-structural-edit.ts)
- [subtitle-editor-state.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-editor-state.ts)
- [header-download-actions.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/header-download-actions.tsx)

这些模块已经证明：  
**应该继续抽“规则、协议、纯状态迁移”，而不是继续把所有时序与 UI 粘在 page.tsx。**

### 2. 当前最危险的耦合点

#### A. 文档状态与视图状态混杂

页面里同时维护：

- `convertObj`
- `subtitleTrack`
- `subtitleTrackOriginal`
- `pendingVoiceEntries`
- `pendingTimingMap`
- `playbackBlockedVoiceIds`

而 [subtitle-workstation.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx) 内部又维护：

- `subtitleItems`
- `pendingAppliedVoiceMap`
- `pendingSourceSaveMap`
- `invalidatedDraftAudioIds`
- `textPreparedForVoiceIds`

这意味着“字幕文档事实”并不是单一 owner。

#### B. 播放引擎逻辑全部堆在页面

播放链路占用了 page 的最大体积，包括：

- 音频缓存、解码、预加载
- WebAudio / media fallback
- transport 与 audition 协议
- 视频同步与 update loop
- gate state 与 blocked clip 行为

这些逻辑内部强依赖很多 DOM ref 和时序控制，但对外并没有形成单一控制器边界。

#### C. merge / structural edit / document 三条链路互相咬合

例如：

- `handleGenerateVideo()` 依赖 workstation preflight + timing persist
- `handleSubtitleSplit()` 依赖 structural preflight + timing persist + playback stop
- `executeUndoNow()` 依赖 structural preflight + operation-history + rollback restore + timing reconcile

这些链路其实已经是独立业务域，但目前都写在页面函数内部。

## 核心设计判断

### 一、这次应该做“整体重排”，不是“零散抽组件”

只拆 header、timeline、dialogs 这类 UI 组件，不会真正减少复杂度，因为：

- 状态 owner 还在 page
- 副作用还在 page
- 各链路依赖顺序还在 page

所以这次必须把 **状态 owner 与副作用 owner 一起迁出**。

### 二、不能直接上全局 store 或外部状态机框架

当前播放引擎里有大量与浏览器媒体实例绑定的 `ref`、`AudioContext`、`HTMLAudioElement`、`HTMLVideoElement`。  
如果这一轮直接切 Zustand/XState/Redux，逻辑变更风险太高。

因此本次采用：

- 领域 hook / controller
- 内部仍允许使用 `useRef + useEffect + useReducer`
- 但必须让外部依赖通过明确接口暴露

### 三、文档状态必须先收 owner，再拆播放

播放链虽然最大，但播放依赖文档状态。  
如果字幕文档 owner 还不稳定，播放控制器抽出去仍然会继续引用 page 的大量状态。

所以迁移顺序必须是：

1. 先收 `document`
2. 再收 `merge` 与 `structural-edit`
3. 最后抽 `playback`

## 目标架构

```text
[page.tsx]
    ↓
[VideoEditorPageShell]
    ↓ consumes
┌────────────────────────────────────────────────────────────┐
│                     VideoEditor Controllers                │
├────────────────────────────────────────────────────────────┤
│ useVideoEditorDocument                                    │
│ useVideoEditorMerge                                       │
│ useVideoEditorStructuralEdit                              │
│ useVideoEditorPlayback                                    │
│ useVideoEditorLayout / useVideoEditorShortcuts            │
└────────────────────────────────────────────────────────────┘
    ↓ passes props
┌────────────────────┬──────────────────────┬────────────────┐
│ VideoEditorHeader  │ SubtitleWorkstation  │ VideoPreview   │
│ TimelineDock       │ Dialogs              │                │
└────────────────────┴──────────────────────┴────────────────┘
```

## 模块规划

### 1. 页面入口层

#### `page.tsx`

职责：

- 保留 Next.js route 入口
- 只负责取 `params`
- 渲染 `VideoEditorPageShell`

要求：

- 不再持有业务状态
- 不再包含媒体控制、网络轮询、结构编辑逻辑

#### `video-editor-page-shell.tsx`

职责：

- 组装所有 controller
- 将 controller 输出装配给 header / workstation / preview / timeline / dialogs
- 处理 controller 之间的桥接，而不是业务细节

这是新的页面 orchestrator，但必须保持在“薄壳层”。

---

### 2. 文档状态域

#### `runtime/document/use-video-editor-document.ts`

职责：

- 管理页面级字幕/轨道文档状态
- 统一持有：
  - `convertObj`
  - `videoTrack`
  - `bgmTrack`
  - `subtitleTrack`
  - `subtitleTrackOriginal`
  - `pendingVoiceEntries`
  - `pendingTimingMap`
  - `playbackBlockedVoiceIds`
  - `workstationDirty`
- 暴露所有文档更新动作：
  - `handleSubtitleTrackChange`
  - `handleUpdateSubtitleAudio`
  - `handleSubtitleTextChange`
  - `handleSourceSubtitleTextChange`
  - `handleSubtitleVoiceStatusChange`
  - `handleResetTiming`

要求：

- 这里成为“文档主状态唯一 owner”
- [subtitle-workstation.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx) 不再维护独立字幕文档真相，只保留工作台内部 UI 局部状态

#### `runtime/document/video-editor-document-selectors.ts`

职责：

- 提供纯 selector：
  - `pendingVoiceIdSet`
  - `pendingTimingIdSet`
  - `pendingMergeIdSet`
  - `pendingMergeCount`
  - `explicitMissingVoiceIdSet`
  - `localPendingVoiceIdSet`
  - `serverMergePending`
  - `hasUnsavedChanges`

要求：

- page 不再自己手写大量 `useMemo(set)` 派生逻辑

#### `runtime/document/video-editor-document-mappers.ts`

职责：

- 处理 `convertObj -> tracks` 的映射
- 处理 `update-subtitle-timings`、reload、rollback 后的数据归并
- 收拢现有 `formatSecondsToSrtTime`、track 初始化、subtitleData merge 等细节

---

### 3. merge 域

#### `runtime/merge/use-video-editor-merge.ts`

职责：

- 持有：
  - `serverLastMergedAtMs`
  - `serverActiveMergeJob`
  - `mergeStatusRequiresManualRetry`
- 封装：
  - metadata 恢复
  - merge status 轮询
  - retry 状态
  - primary CTA 状态
  - download state / tooltip
  - `handleGenerateVideo`

输入：

- document selectors
- workstation preflight
- timing persist

输出：

- `mergePrimaryAction`
- `headerDownloadState`
- `headerDownloadLabels`
- `headerDownloadTooltipText`
- `handleGenerateVideo`
- `handleRetryMergeStatus`
- `handleDownloadVideo/Audio/Srt`
- `taskStatus/taskProgress/taskErrorMessage`

要求：

- merge 状态成为独立 owner
- header 不再直接读 page 里的零散状态

---

### 4. structural-edit 域

#### `runtime/structural-edit/use-video-editor-structural-edit.ts`

职责：

- 持有：
  - `isSplittingSubtitle`
  - `isRollingBack`
  - `hasUndoableOps`
  - `undoCountdown`
  - `latestOperationId`
- 封装：
  - `handleSubtitleSplit`
  - `handleRollbackLatest`
  - `executeUndoNow`
  - `handleUndoCancel`
  - `persistPendingTimingsIfNeeded`
  - structural preflight
  - rollback 后 timing reconcile

输入：

- document owner
- workstation `prepareForStructuralEdit`
- playback stop / seek state
- merge gate state

输出：

- split / undo 的 UI 状态
- structural edit blocked 文案
- 操作回调

要求：

- 结构编辑逻辑不再散落在 page 中部
- split 与 rollback 必须共用同一套 preflight

---

### 5. playback 域

#### `runtime/playback/use-video-editor-playback.ts`

职责：

- 聚合现有 page 里所有播放运行时逻辑
- 管理：
  - `isPlaying`
  - `isSubtitleBuffering`
  - `isVideoBuffering`
  - `currentTime`
  - `totalDuration`
  - `volume`
  - `playingSubtitleIndex`
  - `isAutoPlayNext`
  - `transportState`
- 管理所有媒体相关 ref 与 effect
- 对外暴露：
  - `transportSnapshot`
  - `handlePlayPause`
  - `handleSeek`
  - `handleGlobalVolume`
  - `handleToggleBgmMute`
  - `handleToggleSubtitleMute`
  - `handleAuditionRequestPlay`
  - `handleAuditionStop`
  - `handleRetryBlockedPlayback`
  - `handleCancelBlockedPlayback`
  - `handleLocateBlockedClip`

#### `runtime/playback/video-playback-engine.ts`

职责：

- 承载当前 page 中 WebAudio / fetch / decode / prefetch / sync 的纯实现函数
- 尽可能将可测试的计算逻辑从 hook 中抽出

#### `runtime/playback/video-playback-sync.ts`

职责：

- 封装 video transport 同步、warmup、stall、gate 逻辑

#### `runtime/playback/video-playback-cache.ts`

职责：

- 封装 voice cache / inflight request / buffer policy / prefetch policy

关键要求：

- 这次不是重写播放逻辑，而是 **原样迁移 + 抽边界**
- [editor-transport.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/editor-transport.ts) 继续作为 transport 纯状态内核
- [playback-gate.ts](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.ts) 和 [playback-gate-card.tsx](/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate-card.tsx) 继续保留为播放 gate 子模块

---

### 6. 视图装配层

#### `components/video-editor-header.tsx`

职责：

- 只渲染 header UI
- 输入：
  - 文件名
  - 语言 badge
  - status badge
  - pending merge 文本
  - merge 主按钮状态
  - download action props

#### `components/video-editor-workspace.tsx`

职责：

- 只组装：
  - `SubtitleWorkstation`
  - `VideoPreviewPanel`

#### `components/video-editor-timeline-dock.tsx`

职责：

- 只组装：
  - resize handle
  - `TimelinePanel`

#### `components/video-editor-dialogs.tsx`

职责：

- 统一承接离开确认弹窗等页面级 dialog

## 关键边界约束

为了保持逻辑完全不变，本次重构必须遵守以下不变量：

### 1. document 是唯一事实源

- `convertObj / subtitleTrack / subtitleTrackOriginal / pending map` 只能有一个 owner
- workstation 不能再维护另一份主字幕文档真相

### 2. merge 是唯一页面级合成 owner

- workstation 只能执行 preflight 与触发请求
- merge 成功/失败/轮询恢复都必须由 merge controller 负责

### 3. structural-edit 是唯一结构修改入口

- split / rollback 必须走统一 preflight
- 不允许再出现某个结构操作绕过 source save / timing persist / merge gate

### 4. playback 是唯一媒体运行时入口

- 视图层不能直接控制 `video`、`audio`、`AudioContext`
- 所有播放动作只走 playback controller 暴露的命令

## 迁移策略

采用“保持行为冻结的整体重排”：

### 阶段 1：冻结行为

- 先补 controller 级纯函数测试
- 冻结 merge / structural-edit / playback 关键行为

### 阶段 2：抽 document

- 先把最基础的文档 owner 迁出
- 不动 UI，不动播放语义

### 阶段 3：抽 merge 与 structural-edit

- 因为这两块已经有种子模块，迁移风险较低

### 阶段 4：抽 playback

- 这是最大块，但在 document owner 稳定后才适合迁

### 阶段 5：收口 page shell

- 最后把 page 变成纯路由壳层

## 测试策略

本次重构不能依赖“人工点点看”，必须分层验证：

### 纯函数/协议测试

- `editor-transport.test.ts`
- `video-merge-state.test.ts`
- `video-editor-structural-edit.test.ts`
- `subtitle-editor-state.test.ts`
- `subtitle-workstation-state.test.ts`

### 组件/集成测试

- `subtitle-workstation.test.tsx`
- `subtitle-workstation-merge-flow.test.ts`
- `timeline-panel.test.tsx`
- `video-preview-panel.test.tsx`
- `header-download-actions.test.tsx`

### 页面行为回归

- `page-playback-guards.test.ts`
- 新增 controller 测试，替代一部分源码字符串断言

### 最终校验

- `pnpm exec tsc --noEmit --pretty false`
- 相关 vitest
- `pnpm build`

## 风险与控制

### 风险 1：迁移中 owner 短暂双写

控制：

- 每个阶段只允许一个 owner 生效
- 新 controller 接管后，旧逻辑立即删掉，不保留双轨兼容

### 风险 2：播放链抽离导致时序漂移

控制：

- 先冻结现有行为测试
- playback 采用“原样迁移 + 局部纯函数抽离”，不做语义升级

### 风险 3：工作区现有改动冲突

控制：

- 本次计划必须基于当前已存在的抽离成果继续推进
- 不能回滚现有未提交改动

## 结论

这次应该直接做 **整体模块化重排**，但不是推倒重写。

推荐路径是：

1. 先把 `page.tsx` 里的领域边界正式锁定
2. 以 `document -> merge/structural-edit -> playback -> page-shell` 的顺序迁移
3. 每迁移一层都用测试冻结行为
4. 最终把 `page.tsx` 收敛为路由壳层

这样可以在不改变当前逻辑的前提下，真正解除视频编辑页的结构性耦合。  
下一步应进入实施计划，明确每一阶段改哪些文件、补哪些测试、如何验收。
