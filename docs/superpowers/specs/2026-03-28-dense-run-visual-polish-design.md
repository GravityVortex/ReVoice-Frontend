# Dense Run 视觉精修设计

> 日期：2026-03-28
> 主题：视频编辑页高密度字幕时间轴的视觉重设计

## 背景

`dense run` 的数据和交互模型已经成立，但当前视觉表达仍像“淡色胶囊里插了几根发亮竖线”。

结合用户反馈和主流产品调研，本次需要额外满足一个约束：

- 视觉要更接近 Premiere / Final Cut / Resolve 这类 `caption track / captions lane / subtitle track`
- 默认状态下先融入轨道
- 细节只在选中、播放、定位等交互态显露

这会带来三个直接问题：

- 用户第一眼看到的是竖线，不是高密度字幕区段
- 时间轴网格、run 内辅助线、边界线叠在一起，整体显脏
- 选中、播放、split 等状态都在抢同一层视觉注意力

因此本次工作不是修一两个颜色值，而是把 `dense run` 的主视觉语义从“竖线集合”改成“时间轴原生压缩字幕带”。

## 目标

- 让 `dense run` 第一眼被识别为一个连续的高密度区段
- 保留内部边界的可读性，但边界退居次要层
- 让 `selected / playing / playhead / split` 有明确视觉优先级
- 与现有暗色专业时间轴语言保持一致，不做脱离上下文的装饰

## 设计方向

### NLE 风格压缩字幕带

`dense run` 的主体不是独立漂浮胶囊，而是一条贴合时间轴轨道语言的压缩字幕带：

- 常态下是低对比、低装饰的连续 strip
- 默认不强调每个内部边界
- segment 细节只在 `selected / playing / playhead / hover` 时局部显露
- 当前选中 item 在 strip 内显示为局部亮窗，而不是把整个 run 做成发光对象

### 状态优先级

视觉层次按以下顺序组织：

1. 时间轴轨道背景
2. dense run 主体 strip
3. active segment 局部亮窗
4. active boundary / playhead 局部强调
5. split 颜色语义

## 具体样式策略

### 主体

- 不再使用独立胶囊式强阴影和厚重材质
- strip 的圆角、边框、明暗关系向现有字幕块靠拢
- 主体采用低对比中性色，品牌色只作为局部强调
- 保留轻微 `inset` 层次，但避免把 run 做成悬浮物

### 内部分区

- 默认不展示所有 segment 的可见分区
- 不强行给所有 segment 最小可视宽度
- 只对 active segment 使用亮窗和最小宽度保护

### 边界

- `data-dense-boundary-item` 继续保留，方便测试与语义定位
- 常态下边界应接近不可见
- 只有 active boundary 或交互态才允许显形
- 边界应使用低对比 seam，而不是高亮发光竖线

### 交互状态

- `selected`：局部亮窗
- `playing`：局部前沿或局部边界强调，不 pulse 全段
- `playhead`：沿用现有语义，但限制在局部 segment
- `split`：只改变局部强调色，不重染整个 strip

## 非目标

- 不改 `dense run` 判定规则
- 不改 item anchors 的交互方式
- 不修改碰撞、拖拽、split 数据逻辑
- 不重做整个时间轴或波形组件
