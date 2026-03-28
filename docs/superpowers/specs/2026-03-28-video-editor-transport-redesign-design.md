# 视频编辑器联动内核重构设计

> 日期：2026-03-28
> 主题：重构视频编辑页字幕、视频、时间轴三者联动的播放内核与试听链路

## 背景

当前视频编辑页的核心问题，不是某一个按钮偶发失效，而是整套播放联动模型已经进入高耦合状态：

- `page.tsx` 同时承担 transport、播放控制、试听、预加载、时间轴联动、工作台联动
- 页面里同时存在 `currentTime state`、`video.currentTime`、多个 `HTMLAudioElement`、WebAudio、`playingSubtitleIndex state/ref`
- 原音试听、译音试听、视频播放、BGM 走的是不同加载链路，稳定性不一致
- 通过 `document.dispatchEvent(...)` 在组件之间传播放事件，时序不可验证
- 原音 URL 由前端临时拼接，甚至依赖 `user?.id` 这样的不稳定运行时数据

这会导致几个重复出现的现象：

- 点击“播放原音频段”偶发 `Audio load failed`
- 多点几次又恢复，说明有大量“超时误判”而不是真故障
- seek 后字幕高亮、视频位置、试听音频经常不同步
- auto-play-next、试听 stop、拖动时间轴之间会互相打架

## 目标

- 建立单一播放真相源，彻底收敛字幕、视频、时间轴三者联动
- 统一原音试听与译音试听的加载、就绪、超时、取消、重试语义
- 移除前端临时拼接源音频 URL 的做法，改为消费稳定解析结果
- 让 `timeline-panel`、`subtitle-workstation`、`video-preview-panel` 变成纯视图 + 意图输入层
- 把当前 `page.tsx` 中的大量隐式时序逻辑拆成可测试模块

## 非目标

- 本次不重做整体 UI 外观
- 不在本次设计中重写字幕拖拽/碰撞算法
- 不引入新的后端存储协议，只在现有接口基础上补足“可播放 URL / 模式”字段
- 不追求一次性改完所有旧逻辑；允许按阶段迁移，但每阶段都必须可回归验证

## 核心判断

### 一、根因不是单点 bug，而是多时钟并存

当前页面至少有以下“时间源”参与决策：

- React `currentTime`
- `video.currentTime`
- BGM `audio.currentTime`
- 原音试听 `sourceAuditionAudioRef.currentTime`
- WebAudio `AudioContext.currentTime`

当一个页面允许多个时钟同时决定“当前播放到哪”，联动问题就不可能稳定收敛。

### 二、原音试听不应是特殊分支

原音试听现在是“单独 new 一个 `Audio()`，再自己拼 URL、自行 wait ready、自行 fallback”的旁路实现。  
这意味着：

- 无法复用译音那套更稳定的预加载能力
- 无法复用私桶 URL 的代理/稳定拉流策略
- 无法统一区分“超时”“取消”“404”“用户切换片段”

### 三、UI 不应直接控制媒体实例

`timeline-panel`、`subtitle-workstation`、`video-preview-panel` 现在实际上都在不同程度上影响播放状态。  
这会把“显示层”和“媒体控制层”缠死，结果就是任何一个互动点都可能把另一个互动点的状态覆盖掉。

## 设计原则

### 1. 单一 Transport 内核

页面内只能有一个负责解释以下语义的核心模块：

- 当前 transport 时间
- 当前播放状态
- 当前激活片段
- 当前试听模式
- 当前缓冲状态

所有 UI 只能读取它，不能绕过它直接改媒体对象。

### 2. 单向数据流

所有交互都必须走统一命令入口，例如：

- `play`
- `pause`
- `seek`
- `startSourceAudition`
- `startConvertAudition`
- `stopAudition`
- `toggleAutoPlayNext`

先更新 transport 状态，再由 transport 驱动媒体层，而不是让各组件互相发 DOM 事件。

### 3. 统一音频解析与加载策略

原音、译音、vocal fallback 都必须经过同一套 resolver / loader：

- 先拿稳定可播放 URL
- 再执行 ready 探测
- 失败时返回结构化原因
- 可取消、可重试、可记录耗时

### 4. 状态机优先于散落布尔值

禁止继续扩散“多个布尔 + 多个 ref + 多个 token”来表示播放器状态。  
联动状态必须收敛成明确有限状态机。

### 5. 渐进替换，不和现有未完成改动硬冲突

当前工作区已有未提交改动，本次重构计划应优先新增模块，再逐步把旧逻辑导向新内核，避免一次性大拆。

## 目标架构

```text
[TimelinePanel] --------┐
[SubtitleWorkstation] --┼--> dispatch(intent) --> [EditorTransport]
[VideoPreviewPanel] ----┘                            │
                                                    │ derives
                                                    v
                                      [Transport Snapshot / Selectors]
                                                    │
                           ┌────────────────────────┼────────────────────────┐
                           v                        v                        v
                [Video Sync Controller]   [Audio Audition Engine]   [Track Highlight Resolver]
                           │                        │
                           v                        v
                    HTMLVideoElement        WebAudio / HTMLAudio fallback
```

### 模块边界

#### 1. `editor-transport.ts`

职责：

- 维护 transport 状态
- 接收命令并做状态迁移
- 产出派生选择器：当前片段、是否 buffering、是否 audition、目标停止点等

不负责：

- 直接发网络请求
- 直接操作 DOM

#### 2. `audio-source-resolver.ts`

职责：

- 统一解析原音、译音、vocal fallback 的播放地址
- 优先消费后端提供的稳定字段
- 仅在必要时基于 `audio_url` / `vap_source_mode` 做兜底解释

不负责：

- 真正播放音频

#### 3. `audio-audition-engine.ts`

职责：

- 统一处理试听 ready / timeout / abort / retry
- 隔离“超时”和“真实加载失败”
- 暴露结构化结果：`ready | timeout | error | aborted`

要求：

- 原音试听与译音试听共用一套语义
- fallback 策略内聚，不分散在页面回调里

#### 4. `video-sync-controller.ts`

职责：

- 让视频元素跟随 transport 状态播放、暂停、seek
- 只消费 transport，不直接读取工作台组件状态

#### 5. 视图层组件

- `timeline-panel.tsx`
- `subtitle-workstation.tsx`
- `video-preview-panel.tsx`

职责收敛为：

- 展示 transport snapshot
- 发送用户意图
- 不再自行维护另一套播放事实

## 数据模型

### Transport State

建议状态结构：

```ts
type PlaybackMode = 'timeline' | 'audition_source' | 'audition_convert';

type PlaybackStatus =
  | 'idle'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'error';

type EditorTransportState = {
  status: PlaybackStatus;
  mode: PlaybackMode;
  transportTimeSec: number;
  activeClipIndex: number;
  auditionStopAtSec: number | null;
  autoPlayNext: boolean;
  bufferingReason: 'video' | 'audio' | 'seek' | null;
  errorCode: string | null;
};
```

### Audio Resolve Result

```ts
type ResolvedAudioCandidate = {
  url: string;
  source: 'source_segment' | 'convert_segment' | 'vocal_fallback';
  viaProxy: boolean;
};

type ResolveAudioResult = {
  primary: ResolvedAudioCandidate | null;
  fallback: ResolvedAudioCandidate | null;
  stopAtSec: number | null;
};
```

### Audio Ready Result

```ts
type AudioReadyResult =
  | { status: 'ready'; latencyMs: number }
  | { status: 'timeout'; latencyMs: number }
  | { status: 'error'; latencyMs: number; code: string }
  | { status: 'aborted'; latencyMs: number };
```

重点：  
`timeout` 和 `error` 必须分开。当前 `Audio load failed` 的核心误判就在这里。

## 音频地址策略

### 原则

- 前端不再基于 `r2preUrl/env/userId/taskId/...` 临时拼接原音 URL
- 优先使用后端字幕数据中的稳定字段
- 私桶/签名 URL 统一走解析层决定是否走 `/api/storage/proxy`

### 服务端建议补充

在编辑页接口中，为 `srt_source_arr` / `srt_convert_arr` 补齐可直接消费的解析信息，例如：

- `resolved_source_audio_url`
- `resolved_source_audio_via_proxy`
- `resolved_source_fallback_url`
- `resolved_source_mode`

如果暂时不能加字段，前端 resolver 也必须：

- 优先读 `sourceItem.audio_url`
- 使用 `convertObj.userId`，禁止依赖 `user?.id`
- 统一封装代理规则，不允许各处自行 `new URL` 判断

## 播放状态机

### 主要状态

```text
idle
  -> buffering
  -> playing
  -> paused
  -> seeking
  -> error
```

### 关键约束

- `audition_source` 与 `audition_convert` 只是 `mode`，不是另一套播放器实现
- seek 时必须先进入 `seeking`，完成后再回到 `playing` 或 `paused`
- 试听 stop 不能靠 DOM 自定义事件广播，必须是 transport 命令
- auto-play-next 只能由 transport 根据“自然结束”决定，不能由 UI 推测

## 联动策略

### 时间轴

- 时间轴只显示 `transportTimeSec`
- 用户拖动时间轴时只 dispatch `seek`
- 不再直接改 video/audio 的 `currentTime`

### 字幕工作台

- 当前播放行、当前试听类型都从 transport selector 派生
- 点击播放原音 / 译音只 dispatch 对应 audition intent
- 不再感知底层 `Audio()` 生命周期

### 视频预览

- 视频预览只消费 transport 指令与快照
- 当前高亮字幕由 transport 当前片段派生

## 迁移策略

### Phase 1：先收敛音频解析与 ready 语义

目标：

- 解决 `Audio load failed` 的主要误判来源
- 去掉前端拼源音 URL 的逻辑

### Phase 2：抽出 Transport Reducer / Store

目标：

- 把 `page.tsx` 中的播放状态、试听状态、seek 状态迁移出去
- 建立单一真相源

### Phase 3：替换试听事件总线

目标：

- 删除 `document.dispatchEvent('revoice-audition-*')`
- 改为显式命令调用

### Phase 4：UI 只保留订阅与意图输入

目标：

- `timeline-panel`、`subtitle-workstation`、`video-preview-panel` 只做视图
- 页面容器只负责装配，不再承担状态细节

## 测试策略

### 单元测试

必须新增：

- `audio-source-resolver.test.ts`
- `audio-audition-engine.test.ts`
- `editor-transport.test.ts`

重点覆盖：

- 原音 URL 解析优先级
- timeout / error / abort 区分
- seek 与 audition 状态迁移
- auto-play-next 只在自然结束时触发

### 组件测试

保留并扩展：

- `timeline-panel.test.tsx`
- `subtitle-workstation` 相关联动测试

重点验证：

- 选中、播放、高亮都来自 transport 快照
- 组件本身不再触发隐式 document event

### 手工回归

必须覆盖：

- 页面初次进入立即播放原音
- 快速连续切换不同字幕的原音试听
- 拖动时间轴后立刻播放试听
- 原音 / 译音切换
- auto-play-next 打开和关闭
- source split 行走 fallback vocal 的场景

## 可观测性

建议增加结构化日志前缀：

- `[EditorTransport]`
- `[AudioResolver]`
- `[AudioAudition]`
- `[VideoSync]`

并统一记录：

- clip id
- mode
- resolve source
- ready latency
- timeout/error code

这样后续再出现“偶发不同步”时，能快速定位断在哪一层。

## 风险与控制

### 风险 1：迁移期新旧逻辑并存

控制方式：

- 每阶段都以 feature boundary 收口
- 新内核先接管原音试听，再接管整个 transport

### 风险 2：现有未提交改动与重构冲突

控制方式：

- 优先新增文件
- 最后再小心改 `page.tsx` 的接线层

### 风险 3：WebAudio 与 HTMLMediaElement 行为差异

控制方式：

- 先统一上层语义，再决定底层是否全量切 WebAudio
- 不在第一阶段追求“底层播放引擎完全统一”

## 成功标准

达到以下标准才算完成：

- 原音试听不再出现“多点几次才有声音”的高频故障
- `Audio load failed` 只在真实失败时出现，不再把 timeout 当 error
- seek 后字幕高亮、视频位置、试听音频保持单一事实
- 删除试听相关 DOM 自定义事件总线
- `page.tsx` 中播放联动职责显著收缩，核心状态迁出为独立模块
