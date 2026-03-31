---
name: stuck-playback-fix
overview: 在「配音即闭环」前提下修复卡死与交互断裂：未就绪段必须停在原地，不跳过、不播原声；同时区分网络抖动、网络失败、业务未就绪，并把时间轴锚点、预览区说明卡、播放控件恢复动作一起纳入闭环。
todos:
  - id: add-playback-gate-state
    content: 新增播放门控状态模型，显式区分 loading / retrying / network_failed / voice_unavailable / ready
    status: pending
  - id: fix-abort-cleanup
    content: 修复 beginSubtitleBuffering 的 abort 路径：始终清理 isSubtitleBuffering + 立即同步 ref
    status: pending
  - id: fix-cancel-queue
    content: 修复 handlePlayPause 的 isSubtitleBuffering 取消分支：增加 abortAllVoiceInflight()
    status: pending
  - id: fix-fetch-timeout
    content: 给 fetchAudioArrayBuffer 添加超时与分段重试窗口；网络抖动先自动重试，再进入显式失败
    status: pending
  - id: separate-network-vs-unavailable
    content: 区分网络失败与业务未就绪，禁止把两类问题混成一个“播不出来”
    status: pending
  - id: fix-retry-limit
    content: 失败 URL 计数：达到上限后停止自动死循环，进入网络失败态并提供重试，不静默跳过
    status: pending
  - id: fix-transport-fallback
    content: 修复 getVideoTransportTimeSec 回退逻辑，防止回到 0
    status: pending
  - id: transport-blocking-snapshot
    content: 扩展 transport snapshot，携带阻塞段索引、阻塞原因、重试阶段与恢复动作
    status: pending
  - id: ui-timeline-anchor
    content: 时间轴问题段锚定 UI：段块高亮 + 短状态标签（加载中/重试中/加载失败/需配音）
    status: pending
  - id: ui-preview-overlay
    content: 预览区轻遮罩状态卡：解释当前阻塞原因、显示段信息、提供继续等待/重试/取消/去生成
    status: pending
  - id: ui-playback-controls
    content: 播放按钮与控制区联动阻塞态，在等待/失败时切换为可恢复动作而非普通播放/暂停
    status: pending
  - id: ui-copy-and-i18n
    content: 增补阻塞态文案与 i18n，避免技术化报错文案直接暴露给用户
    status: pending
  - id: ux-buffering-closed-loop
    content: 闭环 UX：loading→retrying→failed / unavailable 的完整时序可见；成功才继续配音播放
    status: pending
  - id: add-tests
    content: 增加播放门控、transport 阻塞态、时间轴/预览区阻塞 UI 的测试覆盖
    status: pending
  - id: verify-all
    content: 运行 TypeScript 类型检查和所有 video-editor 测试
    status: pending
isProject: false
---

# 修复：在「配音闭环」语义下消除卡死、误导与交互断裂

## 产品约束（用户反馈，不可违背）

用户明确：**不能接受**「配音未就绪 → 静默跳过或播放原声」作为默认策略。

理由：编辑页的核心闭环是 **「时间轴上的每一段 = 对应配音可审听」**。若未告知就跳过或换原声，审听链路断裂，用户无法判断「这段配音是否合格」，**不是完整闭环**。

因此本方案 **不采用**：

- 时间轴连续播放时，未缓存段「静音继续走画面 / 后台解码下次再说」作为主要策略；
- 失败后用原声「假装播完」；
- 失败 N 次后「静默跳过」且界面仍像成功。

本方案 **采用**：

- **未就绪**：在该段语义下 **暂停等待配音**（与当前产品意图一致），但等待必须 **可结束、可取消、可解释**（loading、超时、失败文案、重试），绝不能进入僵尸态。
- **失败**：**显式**告知（toast 或段落级状态），提供 **重试**，播放头与时间轴 **不丢、不跳 0**。
- **成功**：再继续配音播放，闭环完整。

## 新增产品约束（UE 确认后固化）

用户补充：很多场景是 **网络波动**，不能把所有「播不出来」都解释为「这段没有配音」。

因此阻塞体验必须再细分为：

- **网络短抖动**：系统先自己恢复，用户看到的是「正在加载这段配音…」。
- **网络持续不稳**：升级为「网络不稳定，正在重试这段配音…」，但仍保持停在当前段，不能继续往后走。
- **网络失败**：超过重试窗口后进入明确失败态，用户可以 **重试本段 / 取消播放**。
- **业务未就绪**：该段本身没有可审听配音（未生成、需重配、服务端失败），直接进入阻塞态，用户可以 **去生成配音 / 取消播放**。

推荐默认时序：

- `0~2 秒`：`loading`
- `2~8 秒`：`retrying`
- `8 秒后`：`network_failed`
- 业务未就绪：不走上面时序，直接 `voice_unavailable`

注意：即便是网络问题，也必须 **停在当前段起点**；用户要感知到系统在恢复，而不是误以为播放器坏了或已经听过该段。

## 根因分析（技术）

场景：播放到某字幕段时永久冻结；之后无法播放或从头播。

共有 **6 个相互关联的 bug**，叠加后表现为「卡住 / 失控」：

### Bug 1：`beginSubtitleBuffering` abort 后未清理 `isSubtitleBuffering`

abort 路径 return 前未 `setIsSubtitleBuffering(false)` 且未同步 ref → 缓冲态永久为 true。

### Bug 2：`handlePlayPause` 取消路径未清空 `voiceDecodeQueue`

未调用 `abortAllVoiceInflight()` → 队列堵死，后续解码全部挂起。

### Bug 3：音频 fetch 无超时

挂起连接 → `beginSubtitleBuffering` 永不结束 → 用户看到「永远 loading」。

### Bug 4：同一失败 URL 无限重试

无上限、无显式失败态 → 用户反复点播放，永远在死循环里，体验上仍是「坏掉的闭环」。

### Bug 5：播放器没有建模「网络失败 vs 业务未就绪」

当前播放门控主要依赖 `subtitleTrack.audioUrl` 和 WebAudio cache：

- 有 URL 但网络抖动时，只能表现成「卡住 / 解码失败」；
- 没有可用配音但业务上未就绪时，又容易被误判成普通加载失败。

结果是：**同样是“播不出来”，系统无法告诉用户到底是在等、在重试，还是这段根本还没好。**

### Bug 6：阻塞状态没有锚定到具体段与恢复动作

当前阻塞主要靠 buffering 布尔值和 toast：

- 用户看到播放器停住，但不知道是哪一段；
- 也不知道系统是会自动恢复，还是需要自己干预；
- 播放按钮、时间轴、预览区没有形成统一语义。

### 为什么「从头播放」

`videoEl.currentTime` 异常为 `NaN` 时，回退链落到过期的 React `currentTime`（可能为 0）→ seek 到 0。

## 修复方案（与闭环一致）

### 0. 先补门控状态模型，再谈修 bug

本次不能只修 `isSubtitleBuffering` 或 fetch 超时，而是要先补一个播放专用门控状态：

```ts
type PlaybackGateState =
  | { kind: 'ready' }
  | { kind: 'loading'; clipIndex: number; sinceMs: number }
  | { kind: 'retrying'; clipIndex: number; retryCount: number; sinceMs: number }
  | { kind: 'network_failed'; clipIndex: number; retryCount: number; failedAtMs: number }
  | { kind: 'voice_unavailable'; clipIndex: number; reason: 'missing' | 'needs_regen' | 'server_failed' };
```

用途：

- **播放引擎** 决定是否允许 timeline 继续走；
- **transport snapshot** 暴露给时间轴、预览区、控制按钮；
- **UI** 根据门控态展示短标签、说明卡和恢复动作。

注意：**不要直接复用** 现有 `deriveSubtitleVoiceUiState` 作为播放门控。  
原因：它主要服务于字幕编辑工作流，且对非 split 行的 `missing/failed` 判定不足，不能直接代表“这段当前能否审听”。

### 1. 状态与队列：可取消、可恢复

- **abort 路径**：`setIsSubtitleBuffering(false)` + `isSubtitleBufferingRef.current = false`（立即同步）。
- `handlePlayPause` 取消缓冲：`abortAllVoiceInflight()` + 清理 buffering abort + ref 同步。

→ 保证用户随时能「取消等待」并恢复可操作，**不靠跳过配音**。

### 2. fetch 超时与重试窗口：网络问题先自动恢复

- `fetchAudioArrayBuffer` 增加单次超时（例如 2s）；
- 播放门控层包一层总重试窗口（例如累计 8s），期间状态按 `loading → retrying` 演进；
- 短抖动优先自动恢复，不立即打断用户；
- 超过窗口后进入 `network_failed`，**不**静默当作已播放。

用户点击重试后：

- 重置该 URL 失败计数；
- 清理该段 network_failed 状态；
- 重新进入 `loading` / `retrying` 流程。

### 3. 区分网络失败与业务未就绪：不给用户错误解释

进入阻塞前，先判断当前段属于哪一类：

- **业务未就绪**：无可播放配音、`vap_needs_tts=true`、`vap_voice_status in {missing, failed}`、或分割后明确待重新配音；
- **网络失败**：业务上应当有可播放配音，但拉取/解码在重试窗口内外持续失败；
- **ready**：有可用 URL 且缓存/拉取成功。

业务未就绪时：

- 直接进入 `voice_unavailable`；
- 不做长时间网络重试假动作；
- 给出 `去生成配音` 或等价入口。

### 4. 失败计数：止循环，不假装成功

- `voiceFailedUrlsRef` 或等价：记录失败次数。
- 达到上限：**停止自动重试**，界面进入 `network_failed`，需用户触发明确重试逻辑。
- **禁止**用「静默跳过」作为止循环手段。

### 5. transport snapshot：把阻塞原因带到 UI

扩展 `editor-transport.ts` / `transportSnapshot`，至少新增：

- `blockingClipIndex`
- `blockingState`
- `blockingLabelKey`
- `blockingActions`

示意：

```ts
type TransportBlockingState =
  | null
  | {
      kind: 'loading' | 'retrying' | 'network_failed' | 'voice_unavailable';
      clipIndex: number;
      retryCount?: number;
      reason?: 'missing' | 'needs_regen' | 'server_failed';
    };
```

这样 `timeline-panel`、`video-preview-panel`、播放控制区看到的是同一个事实，不会再各自猜测。

### 6. 播放头：`getVideoTransportTimeSec` 回退链

- 在 `videoTime` 无效时，优先 `transportStateRef.current.transportTimeSec`，再 `currentTime`，避免误回 0。

### 7. 闭环 UX（与实现绑定）

#### 7.1 时间轴段块锚定状态

`timeline-panel.tsx` 中，问题段必须成为主锚点：

- 阻塞段高亮；
- 段块上显示短状态标签：
  - `加载中`
  - `重试中`
  - `加载失败`
  - `需配音`
- 标签短、解释长：详细说明留给预览区状态卡。

#### 7.2 预览区轻遮罩状态卡

`video-preview-panel.tsx` 中新增轻遮罩，不使用大弹窗。

卡片内容：

- 标题：例如 `正在等待配音`
- 说明：例如 `第 12 段的配音还没准备好，播放已暂停在这里。`
- 补充说明：
  - 网络态：`网络恢复后会自动继续播放`
  - 业务态：`请先生成这段配音后再继续审听`
- 操作按钮：
  - `继续等待`
  - `重试本段`
  - `取消播放`
  - `去生成配音`

#### 7.3 播放按钮与控制区语义切换

控制区不能在阻塞时继续显示普通播放/暂停语义。

- `loading/retrying`：主按钮语义是“等待中”或“取消等待”
- `network_failed`：主按钮切成 `重试`
- `voice_unavailable`：主按钮切成 `去生成`

#### 7.4 文案要求

必须使用用户语言，避免暴露技术报错：

- ✅ `正在加载这段配音…`
- ✅ `网络不稳定，正在重试这段配音…`
- ✅ `这段配音暂时加载失败`
- ✅ `这段还没有可审听的配音`

禁止：

- ❌ `Audio load failed`
- ❌ `Unknown error`
- ❌ `Fallback`
- ❌ `Resource unavailable`
- ❌ `Segment not ready`

- **缓冲中**：明确 loading（现有或加强），用户能理解「在等配音」。
- **重试中**：明确系统仍在恢复，而不是卡死。
- **成功**：恢复播放，听到的是 **配音**，闭环成立。
- **网络失败**：可见反馈 + 重试；**不**用原声或静默跳过冒充闭环。
- **业务未就绪**：可见反馈 + 去生成；不假装这是网络问题。

## 已移除的旧方案

以下内容 **不再作为本计划目标**：

- 「未缓存段视频继续走、该段静音、后台解码」作为主要体验；
- 「失败 2 次静默跳过继续播」；
- 默认「原声兜底」作为未就绪策略。

若将来需要「试听原声」模式，应作为 **用户显式开关**，与「配音审听闭环」区分，不写入本 bugfix 的默认行为。

## 测试与验证要求（新增）

除原有卡死问题验证外，必须新增以下覆盖：

- **门控状态单测**：`ready / loading / retrying / network_failed / voice_unavailable`
- **transport reducer 单测**：阻塞态写入与清理、重试动作、取消等待
- **时间轴 UI 测试**：阻塞段是否正确高亮并显示短标签
- **预览区 UI 测试**：不同阻塞态是否渲染正确标题、说明和按钮
- **回归验证**：
  - 命中未就绪段时播放头停在当前段起点
  - 网络恢复后可自动续播
  - 用户取消等待后不卡死
  - 失败后不会回到 0，不会误播原声，不会静默跳过

## 验收标准（心理与行为）

- 用户为 **审听配音** 而来：等待配音时 **知道在等**，不会无限转圈；失败时 **知道失败**，能重试，**不会**误以为已听过配音。
- 用户能分清 **网络问题** 和 **配音未生成/需重配**，不会被错误解释误导。
- 播放控制 **始终可恢复**：取消、暂停、再播 **不会**卡死或莫名从头。
- 时间轴、预览区、播放按钮三处看到的是 **同一阻塞事实**，不互相矛盾。
- **不**引入「静默跳过 / 默认原声」作为修复手段。
