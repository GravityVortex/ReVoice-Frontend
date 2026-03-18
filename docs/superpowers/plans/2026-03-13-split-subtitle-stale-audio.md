# Split Subtitle Stale Audio Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make split subtitle rows clearly express “译音待更新”, block invalid translated-audio preview with state-specific guidance, and surface equal-priority recovery paths for AI retranslation and manual text editing.

**Architecture:** Add a small pure helper to derive row-level voice UI state from persisted subtitle metadata plus local editor flags, then wire that state through `subtitle-workstation.tsx` and `subtitle-row-item.tsx`. Keep backend contracts intact; use local invalidation/ready markers to resolve edge cases such as “AI returns identical text” and “draft audio becomes stale after later edits”.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Tailwind CSS, Vitest, existing subtitle editor components under `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/`

---

## Pre-flight Checks

- [ ] 确认 `convertObj.srt_convert_arr` 中真实包含 `vap_split_parent_id` 或 `vap_split_operation_id`
- [ ] 如果真实数据缺少 split 标记，先修数据链路，不在本计划里引入“猜测 split 行”的 fallback 语义
- [ ] 统一命名：helper 输入中的 `customDraftAudioPath` 对应工作台里的 `audioUrl_convert_custom`

## Chunk 1: 纯函数状态模型与测试

### Task 1: 新建字幕译音 UI 状态 helper

**Files:**
- Create: `src/shared/lib/subtitle-voice-state.ts`
- Create: `src/shared/lib/subtitle-voice-state.test.ts`
- Reference: `src/shared/lib/timeline/split.ts`
- Reference: `docs/superpowers/specs/2026-03-13-split-subtitle-stale-audio-design.md`

- [ ] **Step 1: 先定义 helper 输入输出契约**

在 `src/shared/lib/subtitle-voice-state.ts` 里定义最小可测试接口，至少包含：

```ts
export type SubtitleVoiceUiState =
  | 'ready'
  | 'stale'
  | 'text_ready'
  | 'audio_ready'
  | 'processing';

export type SubtitleVoiceStateInput = {
  persistedText: string;
  effectiveText: string;
  voiceStatus?: string;
  needsTts?: boolean;
  splitParentId?: string;
  splitOperationId?: string;
  draftAudioPath?: string;
  customDraftAudioPath?: string;
  isProcessing?: boolean;
  isSaving?: boolean;
  isDraftAudioInvalidated?: boolean;
  isTextPreparedForVoice?: boolean;
};
```

预期：helper 文件不依赖 React，不依赖组件文件。`effectiveText` 由调用方先按“本地编辑值 > `vap_draft_txt` > `persistedText`”解析后传入，helper 只负责状态派生，不负责文本基线解析。

- [ ] **Step 2: 先写失败测试，覆盖 spec 的优先级和边界**

在 `src/shared/lib/subtitle-voice-state.test.ts` 先写这些用例：

```ts
it('prefers processing over every other state', () => {});
it('treats isSaving alone as processing', () => {});
it('treats split rows with splitParentId + missing voice as stale', () => {});
it('treats split rows with splitOperationId + missing voice as stale', () => {});
it('treats split rows with needsTts=true as stale even without missing status', () => {});
it('does not treat non-split rows as stale only because needsTts is true', () => {});
it('does not treat non-split rows with missing voiceStatus as stale', () => {});
it('returns audio_ready when a valid draft audio path exists', () => {});
it('returns audio_ready when a valid customDraftAudioPath exists', () => {});
it('lets audio_ready override stale when split rows also have a valid draft audio', () => {});
it('lets audio_ready override text_ready when text changed but a valid draft audio still exists', () => {});
it('enters text_ready when effectiveText differs from persistedText', () => {});
it('enters text_ready when AI marked textPreparedForVoiceIds even if text is identical', () => {});
it('lets text_ready override stale when split rows changed text and have no valid draft audio', () => {});
it('drops from audio_ready to text_ready when draft audio was invalidated', () => {});
it('falls back to ready when no condition matches', () => {});
it('blocks translated preview only for stale and text_ready', () => {});
it('does not map failed voice status into stale by itself', () => {});
```

Run: `pnpm test src/shared/lib/subtitle-voice-state.test.ts`
Expected: FAIL，提示 helper 尚未实现或断言不通过。

- [ ] **Step 3: 实现最小 helper，让测试表达 spec 规则**

实现至少这几个函数：

```ts
export function isSplitDerivedRow(input: SubtitleVoiceStateInput): boolean;
export function deriveSubtitleVoiceUiState(input: SubtitleVoiceStateInput): SubtitleVoiceUiState;
export function shouldBlockTranslatedPreview(state: SubtitleVoiceUiState): boolean;
```

规则必须和 spec 对齐：

- 优先级：`processing -> audio_ready -> text_ready -> stale -> ready`
- `stale` 仅限 split 行，且 `needsTts === true` 或 `voiceStatus === 'missing'`
- `text_ready` 支持文本 diff 和 AI 同文返回两条入口
- `audio_ready` 必须额外避开 invalidated draft audio

- [ ] **Step 4: 跑测试，确认 helper 行为收敛**

Run: `pnpm test src/shared/lib/subtitle-voice-state.test.ts`
Expected: PASS，以上 18 个用例全部通过。

- [ ] **Step 5: 补一次 helper 文件静态校验**

Run: `pnpm exec eslint src/shared/lib/subtitle-voice-state.ts src/shared/lib/subtitle-voice-state.test.ts`
Expected: 无新增 lint 错误。

- [ ] **Step 6: 提交 helper 与测试**

```bash
git add src/shared/lib/subtitle-voice-state.ts src/shared/lib/subtitle-voice-state.test.ts
git commit -m "feat: add subtitle voice ui state helper"
```

## Chunk 2: 工作台状态接线与本地标记

### Task 3: 扩展 `SubtitleRowData`，把状态计算所需元数据带到前端

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Reference: `src/shared/lib/subtitle-voice-state.ts`

- [ ] **Step 1: 给 `SubtitleRowData` 增加隐藏元数据字段**

在 `subtitle-row-item.tsx` 的 `SubtitleRowData` 中增加这些字段，供工作台和 helper 使用：

```ts
persistedText_convert?: string;
voiceStatus?: string;
needsTts?: boolean;
splitParentId?: string;
splitOperationId?: string;
draftAudioPath?: string;
```

要求：row 组件可以忽略这些字段，但类型必须可供 `subtitle-workstation.tsx` 使用。

- [ ] **Step 2: 在 `loadSrtFiles` 中把服务端元数据读进本地行模型**

从 `convertObj.srt_convert_arr[i]` 补齐：

- `persistedText_convert = convertItem?.txt || ''`
- `voiceStatus = convertItem?.vap_voice_status`
- `needsTts = convertItem?.vap_needs_tts`
- `splitParentId = convertItem?.vap_split_parent_id`
- `splitOperationId = convertItem?.vap_split_operation_id`
- `draftAudioPath = convertItem?.vap_draft_audio_path`

预期：工作台后续无需回头再去原始数组里二次猜测状态。

- [ ] **Step 3: 跑基础 lint，确认类型和引用没破**

Run: `pnpm exec eslint 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'`
Expected: 无新增 lint 错误。

- [ ] **Step 4: 提交类型与数据接线**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'
git commit -m "refactor: carry subtitle voice ui metadata in workstation rows"
```

### Task 4: 在工作台里接入本地集合与状态派生

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/shared/lib/subtitle-voice-state.test.ts`
- Reference: `docs/superpowers/specs/2026-03-13-split-subtitle-stale-audio-design.md`

- [ ] **Step 1: 增加本地集合状态**

在 `subtitle-workstation.tsx` 增加：

```ts
const [invalidatedDraftAudioIds, setInvalidatedDraftAudioIds] = useState<Set<string>>(() => new Set());
const [textPreparedForVoiceIds, setTextPreparedForVoiceIds] = useState<Set<string>>(() => new Set());
```

要求：

- 这两个集合只在当前页面会话内生效
- `loadSrtFiles` 重建列表时，清理已不存在行的本地标记

- [ ] **Step 2: 把行状态计算统一收口到 helper**

在 `filteredItems.map(...)` 之前，用 `deriveSubtitleVoiceUiState(...)` 先算出每行 `uiVoiceState` 与 `shouldBlockTranslatedPreview`。

不要把状态分支散落在 JSX 里。

- [ ] **Step 3: 接入关键状态变更时机**

把这些更新点写实：

- `gen_srt` 成功：
  - 更新 `text_convert`
  - 把 id 加入 `textPreparedForVoiceIds`
- 文本实际变更：
  - 如果当前行已有 draft 音频，则把 id 加入 `invalidatedDraftAudioIds`
  - 如果文本和 `persistedText_convert` 不同，进入 `text_ready`
- `translate_srt` 成功：
  - 生成 `audioUrl_convert_custom`
  - 从 `invalidatedDraftAudioIds` 移除该 id
- 保存应用成功：
  - 立即本地 patch `persistedText_convert`
  - 清空 draft 音频字段
  - 把 `voiceStatus` 设成 `ready`
  - 把 `needsTts` 设成 `false`
  - 从两个集合里移除该 id

- [ ] **Step 4: 补一个 helper 测试，覆盖保存成功后的 `ready` 收敛**

在 `src/shared/lib/subtitle-voice-state.test.ts` 增加：

```ts
it('returns ready after the caller patches saved audio as the new baseline', () => {});
```

Run: `pnpm test src/shared/lib/subtitle-voice-state.test.ts`
Expected: PASS，包含新的 ready 收敛用例。

- [ ] **Step 5: 提交工作台状态接线**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' src/shared/lib/subtitle-voice-state.test.ts
git commit -m "feat: wire subtitle voice ui state into workstation"
```

## Chunk 3: 行 UI、拦截文案与验证

### Task 5: 重构 `subtitle-row-item.tsx`，把状态、按钮和弱拦截做成显式 UI

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Reference: `src/shared/lib/subtitle-voice-state.ts`

- [ ] **Step 1: 给行组件增加显示态 props**

为 `SubtitleRowItemProps` 增加至少这些字段：

```ts
uiVoiceState: SubtitleVoiceUiState;
showPreviewBlockHint?: boolean;
onStartManualEdit?: () => void;
```

要求：row 组件不要自己猜状态，只按工作台传入的 state 渲染。

- [ ] **Step 2: 按状态渲染 badge 与动作**

在中间动作区改成状态驱动：

- `stale`：
  - `AI 重翻译 · 1 积分`
  - `手动修改译文 · 免费`
- `text_ready`：
  - `生成译音`
  - `继续编辑`
- `audio_ready`：
  - `保存应用`
- `processing`：
  - 保留当前 loading 态

不要在 `stale` 状态下继续把“更新配音”当成默认主动作。

- [ ] **Step 3: 改写译音播放按钮的拦截逻辑**

当 `uiVoiceState` 是 `stale` 或 `text_ready`：

- 点击译音播放不调用 `onPlayPauseConvert`
- 仅切换行内提示显隐

提示文案拆成两套：

- `stale`：`该段切割后，原译音已不再对应。你可以 AI 重翻译，或手动修改译文后生成译音。`
- `text_ready`：`当前译文已更新，需先生成译音后再试听。`

- [ ] **Step 4: 手动编辑入口要真正聚焦输入框**

实现方式可以是：

- row 内维护 `convertTextareaRef`
- 当 `onStartManualEdit` 被触发且该行成为选中态时，`requestAnimationFrame` 后执行 `.focus()`

预期：用户点“手动修改译文”后，不需要再二次点击输入框。

- [ ] **Step 5: 跑 lint 验证行组件**

Run: `pnpm exec eslint 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'`
Expected: 无新增 lint 错误。

- [ ] **Step 6: 提交行 UI 重构**

```bash
git add 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'
git commit -m "feat: surface stale translated audio actions in subtitle rows"
```

### Task 6: 更新中英文文案并完成最终验证

**Files:**
- Modify: `src/config/locale/messages/zh/video_convert/videoEditor.json`
- Modify: `src/config/locale/messages/en/video_convert/videoEditor.json`
- Test: `src/shared/lib/subtitle-voice-state.test.ts`

- [ ] **Step 1: 增加状态与行内提示文案**

为 `subtitleRow` 增加这些 key（名称可微调，但语义必须一致）：

- `status.stale`
- `status.textReady`
- `status.audioReady`
- `status.processing`
- `actions.manualEdit`
- `actions.generateVoice`
- `actions.continueEditing`
- `inlineHint.stale`
- `inlineHint.textReady`
- `tooltips.manualEditFree`

- [ ] **Step 2: 保持计费信息显式**

文案里要把两条路径分清：

- `AI 重翻译 · 1 积分`
- `手动修改译文 · 免费`

英文也保持同等信息量，不省略免费路径。

- [ ] **Step 3: 跑测试**

Run: `pnpm test src/shared/lib/subtitle-voice-state.test.ts`
Expected: PASS。

- [ ] **Step 4: 跑 lint**

Run: `pnpm exec eslint 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx' src/shared/lib/subtitle-voice-state.ts src/shared/lib/subtitle-voice-state.test.ts src/config/locale/messages/zh/video_convert/videoEditor.json src/config/locale/messages/en/video_convert/videoEditor.json`
Expected: 无新增 lint 错误。

- [ ] **Step 5: 跑类型检查**

Run: `pnpm exec tsc --noEmit --pretty false`
Expected: 若仓库存在历史类型问题，仅允许出现已有存量；不能新增本次改动相关类型错误。

- [ ] **Step 6: 提交最终文案与验证**

```bash
git add src/config/locale/messages/zh/video_convert/videoEditor.json src/config/locale/messages/en/video_convert/videoEditor.json src/shared/lib/subtitle-voice-state.ts src/shared/lib/subtitle-voice-state.test.ts 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx'
git commit -m "feat: clarify stale split subtitle audio recovery flow"
```
