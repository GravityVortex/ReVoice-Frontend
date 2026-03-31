# 微字幕时间轴 Dense Run 设计

> 日期：2026-03-27
> 主题：视频编辑页字幕时间轴在高密度相邻字幕场景下的专业表示模型

## 背景

当前问题不是某 3 条字幕的特殊 case，而是单轨时间轴的通用显示极限：

- 当一串字幕在当前缩放下只有 `2px ~ 5px` 宽
- 且它们的时间边界首尾相接、像素间隔趋近于 `0px`
- 单纯按“每条字幕一个独立视觉块”去画，必然会在以下几种错误之间摇摆：
  - 为了可见性人为拉宽，导致伪重叠
  - 为了真实宽度保持极窄，导致视觉熔成一段
  - 为了区分边界给单条 micro 加样式补丁，结果越修越像 case-by-case

这说明问题根不在某个样式值，而在**表示模型**本身。

## 目标

- 保证字幕 `startTime / duration` 的时间映射始终真实
- 不再用“单条 micro 特判”处理局部高密度字幕
- 在低像素密度下，用通用的 `dense run` 模型表达相邻微字幕
- 保持 item 级交互能力：点击、选中、拖拽、播放定位仍然针对单条字幕
- 保持 split 字幕、剪刀线、播放态、选中态的专业编辑器语义

## 非目标

- 不改字幕数据源
- 不改碰撞算法和拖拽时序规则
- 不引入新的多轨字幕结构
- 不在本次课题中重做整个时间轴外观系统

## 核心判断

### 这是 run 级问题，不是 item 级问题

对高密度相邻字幕，专业方案不应继续问：

- “这一条 micro 怎么画？”

而应改成：

- “这一串局部密度过高的字幕，在当前 `pxPerSec` 下应如何整体表达？”

因此，本设计从“单条 `normal / compact / micro` 渲染”升级为：

- `item entries` 继续负责交互与真实几何
- `dense runs` 负责局部高密度区段的显示表达

## 设计方向

### 视觉主题

继续沿用现有暗色专业编辑器语言，但把高密度字幕区段收敛成“时序总线 / 监看刻线带”的视觉：

- 正常密度：仍是字幕块
- 高密度区段：显示为一条连续带状区段
- 区段内部通过边界刻线、起点针标、选中局部高亮来表达单条字幕

这比“把每条 micro 硬画成独立小块”更接近专业工具在低分辨率时间轴下的思路。

### 记忆点

用户应该直观感受到：

- 这不是几条挤坏的字幕块
- 而是一段高密度字幕区，内部有精确边界

## 表示模型

### 一、Item Entry

`entry` 仍表示单条字幕的真实几何：

- `itemId`
- `startTime`
- `duration`
- `leftPct`
- `widthPct`
- `leftPx`
- `widthPx`

它的职责只有两个：

- 保留真实时间边界
- 提供点击、选中、拖拽所需的 item 级锚点

### 二、Run

`run` 表示渲染层消费的局部时间段：

- `mode: normal | compact | dense`
- `leftPct / widthPct`
- `leftPx / widthPx`
- `itemIds`
- `boundaries`

`dense` run 不是数据实体，只是**视觉聚合段**。

### 三、Dense Boundary

每个 dense run 内部需要保留边界信息：

- `itemId`
- `leftPct`
- `leftPx`
- `splitOperationId?`

用于：

- 画内部刻线
- 画选中边界或局部高亮
- 对齐 splitOperationId 剪刀线

## Run 判定原则

run 的判定不能只看单条 `widthPx`，还要看局部密度。

### 判定输入

- `item.widthPx`
- `gapPx`
- `连续 item 数`
- `run 总宽度`
- `边界可分辨预算`

### 推荐规则

相邻两条字幕进入同一个 dense run 候选，当：

- `gapPx <= 1`
- 且至少一条字幕 `widthPx < compactMinPx`

然后对候选 run 做收敛判断：

- 若 run 内 item 数 `>= 2`
- 且边界预算不足以稳定区分单条块状表达
- 则该 run 标记为 `dense`

这条规则可以覆盖：

- 首尾相接的微字幕串
- 低缩放下连续密集短字幕
- 不会误伤有明显 gap 的短字幕

## 渲染策略

### `normal`

- 仍然按单条字幕块渲染
- 显示文本
- 保留现有选中、播放、hover 样式

### `compact`

- 仍然按单条渲染
- 隐藏文本，保留简化块和中心亮点
- 用于“还能分清边界，但不适合完整块内容”的场景

### `dense`

- 渲染一个连续带状区段，而不是多个独立 micro 块
- 内部使用边界刻线表达每条字幕的起点
- 当前选中 item 只高亮对应局部边界或小区段
- 播放态在 dense run 内只强调当前边界，不把整段都打亮

## 交互模型

### 交互仍是 item 级

这是本设计最重要的约束：

- dense run 只是视觉聚合
- 点击、选中、拖拽、碰撞仍基于单条 item

因此在 dense run 下仍保留 item 级透明 hit layer 或 anchor layer。

### 为什么不能把 run 做成可交互实体

因为一旦 run 成为交互主体，就会直接破坏：

- `activeDragRef` 当前依赖的 item DOM
- `moveClipNoOverlap` 当前依赖的单条 clip 模型
- selected / playing 对应到单条字幕的编辑语义

## Split 语义

split 字幕继续沿用 teal 语义，但不再依赖“单条 micro 特判”：

- dense run 内部边界如果属于 split 组，可保留 teal 边界或剪刀线强调
- 剪刀线位置应直接消费 layout 层生成的边界数据
- 不再依赖 render 层重新推导相邻关系

## 时间与文案精度

时间精度要求不变：

- 小于 1 秒的字幕：显示到毫秒
- 其余字幕：至少显示到 2 位小数
- dense run 不应吞掉单条字幕的精度信息

## 技术设计

### 单一像素密度来源

保留当前设计：

- `timeline-panel` 负责给 `SubtitleTrack` 传入真实 `pxPerSec`

### Layout 输出升级

`buildSubtitleTrackLayout` 需要从“只返回 entries”升级为：

- `entries`
- `runs`

建议类型：

- `SubtitleTrackLayoutEntry`
- `SubtitleTrackLayoutRun`
- `SubtitleTrackDenseBoundary`
- `SubtitleTrackLayoutResult`

### 删除的旧思路

本次明确放弃：

- 单条 micro 线段内缩算法作为核心模型
- 用单条样式特判解决局部高密度问题
- 把点击热区、视觉宽度、边界可读性绑在同一层做补丁

## 验收标准

- 相邻高密度字幕在低缩放下可被识别为一个 dense run
- dense run 内部边界与真实时间保持一致
- dense run 不应误合并那些有足够 gap 的短字幕
- 选中 dense run 内某一条字幕时，用户能明确知道当前选中的是哪条
- 拖拽和碰撞规则保持 item 级，不因 dense run 改变
- splitOperationId 的视觉标记和边界不脱节

## 风险与取舍

- layered DOM 会增加 pointer-events 管理复杂度
- dense run 如果高亮策略设计不好，会出现“整段亮了但不知道哪条被选中”
- 如果边界数据只在 render 层现算，会再次造成视觉和交互双重真相

因此，本设计选择：

- **layout 层产出 dense runs**
- **render 层消费 runs**
- **交互层仍然使用 item**

## 受影响文件

- `src/shared/components/video-editor/subtitle-track-layout.ts`
- `src/shared/components/video-editor/subtitle-track.tsx`
- `src/shared/components/video-editor/subtitle-track-layout.test.ts`
- `src/shared/components/video-editor/subtitle-track.test.tsx`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`

## 总结

专业方案不是继续调单条 micro 样式，而是把“高密度相邻字幕”提升为一个通用的 dense run 表示问题。只要 layout 层先识别局部高密度 run，再由 render 层画连续带与内部边界，同时保留 item 级交互，这个问题才能稳定解决，而不是在“又重叠了 / 又粘成一段了”之间反复来回。
