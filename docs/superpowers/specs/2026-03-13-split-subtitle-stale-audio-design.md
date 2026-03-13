# 切割字幕后“译音待更新”自然感知设计

## 背景

当前视频编辑器支持在时间轴上切割字幕。切割后，后端会把新生成的翻译字幕段标记为缺少对应译音，但右侧字幕工作台仍把这些行表现成普通可试听行。结果是：

- 用户点击“试听翻译音频”时，经常只感知到“点了没反应”或“不能播放”
- 用户很难自然理解这是业务状态问题，而不是播放器故障
- 用户也看不到最接近问题的处理入口，必须自己猜测该点哪里

现有实现里，数据语义已经存在：

- 切割后的翻译字幕段会被标记为 `vap_voice_status: 'missing'`
- 同时会设置 `vap_needs_tts: true`
- 合成视频接口也会阻止这些缺失译音的段落进入最终 merge

因此这次设计的核心不是重做后端流程，而是把现有状态准确翻译成用户可感知、可操作的前端交互。

## 目标

让用户在字幕切割后，能够自然理解“这段原译音已经失效，需要更新”，并在当前行直接看到两条处理路径：

1. `AI 重翻译`
2. `手动修改译文`

同时避免再出现“点击试听才发现没声音，但界面没有解释”的空反馈。

## 已确认的产品结论

本轮设计确认了以下约束：

1. 行状态不再使用“需要重翻译”作为唯一表述
2. 行状态文案固定为 `译音待更新`
3. `AI 重翻译` 不是唯一合法路径
4. 用户可以手动修改译文，以节省积分
5. `AI 重翻译` 与 `手动修改译文` 必须同级展示，不能把用户强引到付费路径
6. 设计优先参考主流产品的“状态前置 + 就地重生成入口”模式

## 参考模式

以下结论基于 2026-03-13 检索到的官方帮助中心内容。由于部分官方页面对直接抓取返回 403，以下采用官方搜索结果摘要与页面标题进行归纳，属于**基于官方资料的设计推断**，不是逐字复述。

### Descript

- [Dub speech to add translated voiceover](https://help.descript.com/hc/en-us/articles/37194900295821-Dub-speech-to-add-translated-voiceover)
  - 搜索摘要显示：修改翻译内容后，需要使用 `Regenerate` 重新生成配音，以保持译文与音频一致。
- [Use Regenerate to edit or change recorded audio](https://help.descript.com/hc/en-us/articles/13832955606413-Using-Overdub-to-edit-recorded-audio)
  - 搜索摘要显示：对选中内容就地执行 `Regenerate`，更新后的音频会贴近原内容位置出现。

### ElevenLabs

- [Why can't I see the edit button next to my dub?](https://help.elevenlabs.io/hc/en-us/articles/23795777137937-Why-can-t-I-see-the-edit-button-next-to-my-dub)
  - 搜索摘要显示：只有进入 `Dubbing Studio` 的可编辑工作流后，用户才会看到逐段编辑入口。
- [Does it cost credits to regenerate in Studio?](https://help.elevenlabs.io/hc/en-us/articles/30442535713937-Does-it-cost-credits-to-regenerate-in-Studio)
  - 搜索摘要显示：`Generate / Regenerate` 是段落级操作，且按钮文案会根据当前状态变化。
- [Do I use quota on every generation?](https://help.elevenlabs.io/hc/en-us/articles/13313274666769-Do-I-use-quota-on-every-generation)
  - 搜索摘要显示：更改文本后再生成会产生配额消耗，说明“文本编辑”和“生成音频”是相邻但独立的动作。

### Rask

- [What is AI script adjustment?](https://help.rask.ai/hc/what-is-ai-script-adjustment-rask-help-center)
  - 搜索摘要显示：对潜在有问题的片段先标红色感叹号，再从片段附近触发 `Rewrite with AI` 和 `Apply`。

### 归纳结论

主流产品在相近场景下呈现出一致模式：

- 先显式暴露片段状态，而不是让用户先试错
- 让处理入口尽量贴近内容本身
- 把“修改文本”和“重新生成音频”做成连续但可理解的两个动作

本设计沿用这一模式，但会保留当前产品自己的积分透明度和分步保存逻辑。

## 设计原则

1. **状态描述结果，不描述唯一方法**
   - `译音待更新` 描述的是当前结果
   - `AI 重翻译` 只是其中一条处理路径

2. **问题就地闭环**
   - 用户在当前字幕行就能看到问题、原因和下一步动作

3. **前置感知，弱拦截确认**
   - 用户不点击播放时，也能看到该段目前不可试听
   - 用户点击播放时，会得到明确解释，但不被打断到全局弹窗

4. **动作透明**
   - 文本修改与音频生成分开表达
   - 保留积分消耗差异，避免一次点击触发多次扣费的误解

5. **最小化后端改动**
   - 优先复用现有字段、接口与合成守卫

## 范围

### 本次设计范围

- 右侧字幕工作台的行项状态表达
- 行内动作布局与文案层级
- 译音播放按钮的弱拦截交互
- 现有字段到 UI 状态的派生映射
- 错误反馈与验证标准

### 非本次范围

- 重构 `generate-subtitle-voice` 后端协议
- 重构视频合成逻辑
- 修改切割算法本身
- 重做整页布局

## 用户流

```text
切割字幕
  → 新段被标为缺少有效译音
  → 行状态显示“译音待更新”
  → 用户选择：
      A. AI 重翻译
      B. 手动修改译文
  → 译文文本实际发生变化后，状态进入“待生成译音”
  → 例外：AI 重翻译成功后，即使返回文本与 persistedText 相同，也进入“待生成译音”
  → 用户点击“生成译音”
  → 状态进入“可试听（待应用）”
  → 用户试听确认
  → 点击“保存应用”
  → 恢复普通可试听状态，并计入待重新合成
```

## UI 状态模型

建议引入一个**纯前端派生状态** `uiVoiceState`，不落库。

### 状态优先级

同一行如果命中多个条件，按以下顺序只取一个最终可见状态：

1. `processing`
2. `audio_ready`
3. `text_ready`
4. `stale`
5. `ready`

这条优先级保证每行始终只有一个 badge 语义，避免实现和测试出现歧义。

### 1. `processing`

- 文案：`处理中`
- 语义：当前行正在执行翻译、生成译音或保存
- 判定：
  - `convertingMap[item.id]` 存在
  - 或 `savingIds.has(item.id)`

### 2. `audio_ready`

- 文案：`可试听（待应用）`
- 语义：已生成新的试听音频，但尚未正式保存到最终结果
- 判定：
  - `vap_draft_audio_path` 存在
  - 或前端 `audioUrl_convert_custom` 存在
  - 且该 draft 音频没有被后续文本编辑判定为失效

### 3. `text_ready`

- 文案：`待生成译音`
- 语义：新译文已准备好，但还没有新的可试听译音
- 判定：
  - “有效译文文本”相对于持久化基线已发生变化
    **或** 当前行被显式标记为“文本已准备好可生成译音”
  - 且不存在新的 draft 音频

这里需要固定两个比较基线：

- `persistedText`：服务端当前已保存的译文文本，来源于 `convertObj.srt_convert_arr[i].txt`
- `effectiveText`：当前行对用户真正可见的译文文本，优先取本地编辑值，其次取 `vap_draft_txt`，最后回退到 `persistedText`
- `textPreparedForVoiceIds`：纯前端集合，用于记录“虽然文本可能未变化，但用户已经显式完成文本确认，可直接进入生成译音”的行

只有当以下任一条件成立时，才进入 `text_ready`：

- `effectiveText !== persistedText`
- 当前行 id 位于 `textPreparedForVoiceIds` 中

这意味着：

- 进入编辑态本身不会切状态
- 只有文本实际发生变化，才会从 `stale` 或 `ready` 切到 `text_ready`
- 如果当前行原本处于 `audio_ready`，文本再次变化后，旧 draft 音频立即失效，状态回退到 `text_ready`
- AI 重翻译成功后，无论返回文本是否与 `persistedText` 相同，都必须把该行加入 `textPreparedForVoiceIds`，以便状态进入 `text_ready`

### 4. `stale`

- 文案：`译音待更新`
- 语义：当前这段的原译音已不再对应
- 判定：
  - 当前行为 split 产生的新段
  - 且 `vap_needs_tts === true`
    或 `vap_voice_status === 'missing'`

其中 “split 产生的新段” 以以下字段为准：

- `vap_split_parent_id`
- 或 `vap_split_operation_id`

这里的 `stale` 明确只服务于**切割后译音失效**的场景。

`vap_voice_status === 'failed'` 不并入 `stale` 文案系统，因为它代表操作失败/重试问题，不等同于“切割后原译音失效”。本轮仍沿用现有 toast 与按钮重试语义，不新增独立的失败 badge。

### 5. `ready`

- 文案：无额外 badge
- 语义：当前译音可正常试听，且不存在新的待应用草稿
- 判定：
  - 不命中以上任何状态

### 状态转移规则

```text
stale
  ├─(AI 重翻译成功 / 手动修改译文且文本变更)→ text_ready
  └─(手动进入编辑但未改文本)→ stale

text_ready
  ├─(生成译音成功)→ audio_ready
  └─(生成译音失败)→ text_ready

audio_ready
  ├─(保存应用成功，并本地重建持久化基线)→ ready
  ├─(保存应用失败)→ audio_ready
  └─(文本再次变更)→ text_ready

ready
  ├─(手动修改译文且文本变更)→ text_ready
  └─(切割产生新段并标记 missing)→ stale
```

## 行项设计

### 状态层

在字幕行右上角显示状态 badge：

- 普通态：不额外强调
- `stale`：显示 `译音待更新`
- `text_ready`：显示 `待生成译音`
- `audio_ready`：显示 `可试听（待应用）`
- `processing`：显示 `处理中`

### 视觉层级

`stale` 状态应使用**暖红 / 珊瑚红浅底**表达“待处理”，而不是系统级报错红：

- 细边框提亮
- 轻微暖色背景
- 必要时在行左侧加入一条窄强调条

不建议把整行做成强错误警报，否则长列表中噪音太大。

### 播放位弱拦截

当行处于 `stale` 或 `text_ready` 时，点击“试听翻译音频”：

- 不发起播放
- 不切换到播放中状态
- 不触发系统级 `playFailed` toast
- 在当前行就地显示**与状态匹配**的说明

文案分两套：

- `stale`：
  `该段切割后，原译音已不再对应。你可以 AI 重翻译，或手动修改译文后生成译音。`
- `text_ready`：
  `当前译文已更新，需先生成译音后再试听。`

同时把当前状态下的主动作做轻微强调：

- `stale`：强调 `AI 重翻译` 与 `手动修改译文`
- `text_ready`：强调 `生成译音`

### 动作层级

#### `stale` 状态

两个同级主动作：

- `AI 重翻译 · 1 积分`
- `手动修改译文 · 免费`

其中：

- `AI 重翻译` 调用现有 `gen_srt`
- `手动修改译文` 进入编辑态并聚焦译文输入区

注意：

- 点击 `手动修改译文` 只是进入编辑态
- 只有当文本实际变更后，状态才切到 `text_ready`
- 如果该行之前已处于 `audio_ready`，文本再次变更后必须立刻使旧 draft 音频失效

#### `text_ready` 状态

主动作：

- `生成译音`

次动作：

- `继续编辑`

#### `audio_ready` 状态

主动作：

- `保存应用`

此时译音试听按钮恢复正常可用。

## 文案策略

### 状态文案

- `译音待更新`
- `待生成译音`
- `可试听（待应用）`
- `处理中`

### 行内说明

- `stale`：
  `该段切割后，原译音已不再对应。你可以 AI 重翻译，或手动修改译文后生成译音。`
- `text_ready`：
  `当前译文已更新，需先生成译音后再试听。`

### 成功反馈

- AI 重翻译成功：
  - 行状态切换到 `待生成译音`
  - 可选轻提示：`译文已更新，下一步生成译音`
- 生成译音成功：
  - 行状态切换到 `可试听（待应用）`
  - toast：`新译音已生成，可先试听再保存`
- 保存应用成功：
  - 恢复普通试听状态
  - 保留现有“待重新合成视频”提示逻辑

## 与现有代码的映射

### 可复用字段

- `vap_voice_status`
- `vap_needs_tts`
- `vap_draft_txt`
- `vap_draft_audio_path`
- `audio_url`
- `audioUrl_convert_custom`
- `convertingMap`
- `savingIds`

### 需要新增的纯前端失效标记

为了处理“已经生成过 draft 译音，但文本后来又被修改”的场景，建议新增一个纯前端集合，例如：

- `invalidatedDraftAudioIds: Set<string>`
- `textPreparedForVoiceIds: Set<string>`

用途：

- 当行处于 `audio_ready`，且用户再次修改译文文本时，把该行 id 放入 `invalidatedDraftAudioIds`
- `uiVoiceState` 计算 `audio_ready` 时，必须额外判断该 id 不在 `invalidatedDraftAudioIds` 中
- 这样可以在**不修改后端契约**的前提下，立即让旧 draft 音频退出试听/保存路径
- 当 AI 重翻译成功时，无论文本是否与 `persistedText` 相同，都把该行 id 放入 `textPreparedForVoiceIds`
- 当手动修改文本导致 `effectiveText !== persistedText` 时，不必依赖 `textPreparedForVoiceIds`，直接进入 `text_ready`

清理时机必须明确：

- `生成译音` 成功：从 `invalidatedDraftAudioIds` 移除该行 id
- `保存应用` 成功：同时从 `invalidatedDraftAudioIds` 与 `textPreparedForVoiceIds` 移除该行 id
- 服务端行数据刷新并以最新数据重建列表时：清空这两个集合对应行的本地标记

### 保存成功后的本地基线重建

为了保证 `audio_ready -> ready` 能在当前页面立即收敛，不等待整页刷新，保存应用成功后前端必须立即对当前行做一次本地基线 patch：

- `persistedText = effectiveText`
- `audio_url = 已保存的正式译音路径`
- `vap_draft_audio_path = ''`
- `audioUrl_convert_custom = ''`
- `vap_voice_status = 'ready'`
- `vap_needs_tts = false`
- 清理该行在 `invalidatedDraftAudioIds` 与 `textPreparedForVoiceIds` 中的标记

正式译音路径优先级也要固定：

1. 优先使用保存接口确认后的正式路径
2. 如果接口不返回路径，则回退到当前已知的正式命名规则路径
3. 不允许继续把旧的 draft 路径当成 `ready` 状态下的正式路径

这样 `uiVoiceState` 在同一渲染周期内就会回到 `ready`，不会因旧快照里的 `missing / needs_tts` 再次掉回 `stale`

这条规则是本轮设计的一部分，不是可选优化。

### 组件职责建议

#### `subtitle-workstation.tsx`

负责：

- 基于现有字段派生 `uiVoiceState`
- 维护 `invalidatedDraftAudioIds`
- 维护 `textPreparedForVoiceIds`
- 控制当前行应显示哪些动作
- 在用户点击“手动修改译文”时进入编辑态
- 在文本实际变更后把状态切换到 `text_ready`
- 如果当前行已有 draft 译音，文本再次变更时立即把旧 draft 标为失效

#### `subtitle-row-item.tsx`

负责：

- 渲染状态 badge
- 渲染 `AI 重翻译` / `手动修改译文` 双主动作
- 在 `stale` / `text_ready` 时拦截译音播放点击
- 展示行内说明与强调态

#### `videoEditor.json` 多语言文案

负责：

- 状态文案
- 行内说明
- 按钮文案
- tooltip / hover 文案

### 不建议本轮调整的部分

- `src/app/api/video-task/generate-subtitle-voice/route.ts`
- `src/app/api/video-task/generate-video/route.ts`
- `src/shared/lib/timeline/split.ts`

这些模块当前的数据语义已经可用，本轮主要问题在 UI 表达，而非服务端语义缺失。

## 错误处理

### 1. 状态性问题

例如当前行是 `stale` 或 `text_ready`。

处理方式：

- 不弹全局错误
- 在行内解释原因
- 直接提供下一步动作

### 2. 操作失败

例如：

- AI 重翻译失败
- 生成译音失败
- 保存应用失败

处理方式：

- 保留全局 toast
- 行状态回退到上一个非 `processing` 的业务状态
- 按钮恢复可重试

这里要明确：

- 失败不是一个新的主 badge 状态
- 它只是当前动作的失败结果
- 用户刷新后仍按 `uiVoiceState` 规则重新计算最终状态

### 3. 资源加载失败

例如某段本应可试听，但音频资源加载失败。

处理方式：

- 继续使用系统级错误：`音频加载失败，请重试`
- 不能把这类失败错误地显示成 `译音待更新`

## 无障碍与可理解性

- 状态 badge 文案必须可被屏幕阅读器读到
- 弱拦截不能只依赖颜色，应有明确文字说明
- “手动修改译文”触发后应自动聚焦到当前行译文输入框
- 所有动作按钮都应保留明确 aria-label

## 测试建议

### 单元测试

为 `uiVoiceState` 派生逻辑补纯函数测试，覆盖：

- converting / saving → `processing`
- 有 draft 音频 → `audio_ready`
- `effectiveText !== persistedText` 且无 draft 音频 → `text_ready`
- split 标记 + (`vap_voice_status: missing` 或 `vap_needs_tts: true`) → `stale`
- 以上条件都不命中 → `ready`

### 组件交互测试

至少覆盖：

- `stale` 时点击译音播放，不触发播放请求
- `stale` 时显示双主动作
- 点击 `手动修改译文` 只进入编辑态，不直接切状态
- 手动修改译文且文本实际变更后切到 `text_ready`
- 生成译音成功后恢复试听入口

## 验收标准

1. 用户在**不点击播放**的情况下，也能看出这段当前不可试听
2. 用户点击译音播放时，能明确知道问题是“译音待更新”，而不是播放器故障
3. 当前行直接提供两条处理路径：
   - `AI 重翻译`
   - `手动修改译文`
4. 文本更新后，界面会自然引导用户进入 `生成译音`
5. 不再出现“没有可播放音频，但 UI 没有解释”的空反馈

## 成功标准

- 用户把这类问题理解成“这段内容待处理”，而不是“功能坏了”
- 不会误以为必须付费重翻译才能继续
- 状态、动作、反馈形成行内闭环
- 后端契约基本不变，只通过前端派生状态完成表达升级
