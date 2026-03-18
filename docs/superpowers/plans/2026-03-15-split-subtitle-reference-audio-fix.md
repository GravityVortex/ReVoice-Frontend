# Split Subtitle Reference Audio Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复“切割字幕后生成单条译音时错误引用不存在的 `split_audio` 父音频”问题，确保切割后的译音生成始终使用正确的 source 音频 lineage，并在参考音频缺失时给出明确错误而不是延迟到 Python 500。

**Architecture:** 在 `translate_srt` 行上引入一个明确、稳定、只服务于 TTS reference 解析的 canonical 字段，切割时从 source 行写入；生成译音时优先使用该字段，对历史数据按 source 数组同 index 懒修复；同时从 `generate-subtitle-voice` 路由移除对 `overwrite-file` 假成功链路的依赖，改为显式 reference 解析与存在性校验。Python TTS 的请求协议保持不变，仍只接收 `reference_subtitle_name`。

**Tech Stack:** Next.js API routes、TypeScript、Vitest、Drizzle/Postgres JSONB 字段、现有 Java presigned URL 接口、现有 Python TTS 接口。

---

## Chunk 1: 固化 Canonical Reference Lineage

### Task 1: 在 split 产物中写入稳定的 TTS 参考字段

**Files:**
- Modify: `src/shared/lib/timeline/split.ts`
- Test: `src/shared/lib/timeline/split.test.ts`
- Test: `tests/integration/video-task-split-subtitle.test.ts`

- [ ] **Step 1: 先补失败测试，定义新字段契约**

在 `src/shared/lib/timeline/split.test.ts` 和 `tests/integration/video-task-split-subtitle.test.ts` 中新增断言：

```ts
expect(row.vap_tts_reference_subtitle_id).toBe('0001_00-00-00-000_00-00-04-000');
```

约束：
- `translate` 子段必须带 `vap_tts_reference_subtitle_id`
- 它的值必须来自 `sourceTarget.id`
- `vap_split_parent_id` 继续保留，仍表示 translate 侧 parent，不能被删除

- [ ] **Step 2: 修改 split 纯函数，显式接收 source reference id**

在 `src/shared/lib/timeline/split.ts` 中把 `makeTranslateChild(...)` 参数从：

```ts
function makeTranslateChild(..., parentId: string)
```

改为：

```ts
function makeTranslateChild(
  ...,
  translateParentId: string,
  ttsReferenceSubtitleId: string,
)
```

并在返回对象中新增：

```ts
vap_split_parent_id: translateParentId,
vap_tts_reference_subtitle_id: ttsReferenceSubtitleId,
```

- [ ] **Step 3: 在 split 主流程里传入 sourceTarget.id**

在 `splitSubtitlePayload(...)` 中修改两处 translate child 构造：

```ts
makeTranslateChild(
  translateTarget,
  translateIds.left,
  leftStartMs,
  leftEndMs,
  input.effectiveConvertText,
  input.splitOperationId,
  input.nowMs,
  translateTarget.id,
  sourceTarget.id,
)
```

右半段同理。

- [ ] **Step 4: 运行 split 相关测试**

Run:

```bash
pnpm exec vitest run src/shared/lib/timeline/split.test.ts tests/integration/video-task-split-subtitle.test.ts
```

Expected:
- `split.test.ts` 全通过
- `video-task-split-subtitle.test.ts` 全通过

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/timeline/split.ts src/shared/lib/timeline/split.test.ts tests/integration/video-task-split-subtitle.test.ts
git commit -m "fix: persist canonical tts reference id on split subtitles"
```


### Task 2: 明确字段语义，避免后续继续误用 `vap_split_parent_id`

**Files:**
- Modify: `src/shared/lib/timeline/split.ts`
- Modify: `src/app/api/video-task/generate-subtitle-voice/route.ts`

- [ ] **Step 1: 在新增字段处补简短注释**

在 `split.ts` 新字段旁加一条短注释：

```ts
// Canonical subtitle id under split_audio/audio used as TTS reference.
vap_tts_reference_subtitle_id: ttsReferenceSubtitleId,
```

- [ ] **Step 2: 在 generate route 解析逻辑旁补短注释**

说明：
- `vap_split_parent_id` 是 translate lineage
- `vap_tts_reference_subtitle_id` 才是 `split_audio/audio/*.wav` 的 canonical key

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/timeline/split.ts src/app/api/video-task/generate-subtitle-voice/route.ts
git commit -m "docs: clarify split lineage vs tts reference lineage"
```

---

## Chunk 2: 抽离 Reference 解析器，兼容历史数据

### Task 3: 新建纯函数解析器，统一 canonical / legacy / repair 逻辑

**Files:**
- Create: `src/shared/lib/subtitle-reference-audio.ts`
- Test: `src/shared/lib/subtitle-reference-audio.test.ts`

- [ ] **Step 1: 先写纯函数测试，覆盖 4 类输入**

测试场景：

1. 有 `vap_tts_reference_subtitle_id`，直接命中 canonical
2. 无 canonical，但 source 同 index 为 split child，使用 `sourceRow.vap_source_split_parent_id`
3. 无 canonical，但 source 同 index 为 legacy row，使用 `sourceRow.id`
4. translate/source 长度错位或 index 不存在，返回显式 unresolved

建议的返回契约：

```ts
type ReferenceResolution =
  | {
      status: 'resolved';
      referenceSubtitleName: string;
      strategy: 'canonical' | 'source_parent' | 'source_self';
      translateIndex: number;
      needsBackfill: boolean;
      patch: Record<string, any> | null;
      diagnostics: Record<string, any>;
    }
  | {
      status: 'unresolved';
      reason: 'translate_row_missing' | 'source_row_missing' | 'source_reference_missing';
      diagnostics: Record<string, any>;
    };
```

- [ ] **Step 2: 写最小实现**

建议的实现骨架：

```ts
export function resolveTranslatedTtsReference(args: {
  subtitleName: string;
  translateRows: any[];
  sourceRows: any[];
}) {
  const translateIndex = args.translateRows.findIndex((row) => row?.id === args.subtitleName);
  if (translateIndex < 0) {
    return { status: 'unresolved', reason: 'translate_row_missing', diagnostics: { subtitleName: args.subtitleName } };
  }

  const translateRow = args.translateRows[translateIndex];
  const canonical = String(translateRow?.vap_tts_reference_subtitle_id || '').trim();
  if (canonical) {
    return {
      status: 'resolved',
      referenceSubtitleName: canonical,
      strategy: 'canonical',
      translateIndex,
      needsBackfill: false,
      patch: null,
      diagnostics: {},
    };
  }

  const sourceRow = args.sourceRows[translateIndex];
  if (!sourceRow || typeof sourceRow !== 'object') {
    return { status: 'unresolved', reason: 'source_row_missing', diagnostics: { translateIndex } };
  }

  const sourceParent = String(sourceRow?.vap_source_split_parent_id || '').trim();
  const sourceSelf = String(sourceRow?.id || '').trim();
  const resolved = sourceParent || sourceSelf;
  if (!resolved) {
    return { status: 'unresolved', reason: 'source_reference_missing', diagnostics: { translateIndex } };
  }

  return {
    status: 'resolved',
    referenceSubtitleName: resolved,
    strategy: sourceParent ? 'source_parent' : 'source_self',
    translateIndex,
    needsBackfill: true,
    patch: { vap_tts_reference_subtitle_id: resolved },
    diagnostics: {
      translateParentId: String(translateRow?.vap_split_parent_id || '').trim(),
      sourceParentId: sourceParent,
      sourceId: sourceSelf,
    },
  };
}
```

- [ ] **Step 3: 增加 mismatch 诊断，不改变主逻辑**

如果：

```ts
translateRow.vap_split_parent_id !== sourceRow.vap_source_split_parent_id
```

不要失败，也不要回退到 translate parent。

只把 mismatch 放进 `diagnostics`，后续由 route 记 warning log。

- [ ] **Step 4: 运行纯函数测试**

Run:

```bash
pnpm exec vitest run src/shared/lib/subtitle-reference-audio.test.ts
```

Expected:
- 4 类场景全部通过

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/subtitle-reference-audio.ts src/shared/lib/subtitle-reference-audio.test.ts
git commit -m "fix: add canonical split-audio reference resolver"
```

---

## Chunk 3: 切换 generate route 到 canonical resolver

### Task 4: 让 `generate-subtitle-voice` 同时读取 translate/source 两条数据线

**Files:**
- Modify: `src/app/api/video-task/generate-subtitle-voice/route.ts`
- Test: `tests/integration/video-task-generate-subtitle-voice.test.ts`

- [ ] **Step 1: 改测试，先删除对 `javaR2CoverWriteFile` 的强依赖**

把现有“split parent copy compatibility path”测试改成新预期：

```ts
expect(mockJavaR2CoverWriteFile).not.toHaveBeenCalled();
expect(mockPyConvertTxtGenerateVoice).toHaveBeenCalledWith(
  'task_1',
  '新的子字幕译文',
  '00030001_00-00-10-074_00-00-14-475',
  { referenceSubtitleName: '0003_00-00-08-794_00-00-14-475' }
);
```

再新增两个测试：
- legacy row 没有 canonical，但 source row 有 `vap_source_split_parent_id`
- translate/source parent mismatch 时优先用 source lineage，并记录 warning

- [ ] **Step 2: 在 route 中额外读取 `gen_srt`**

在 `type === 'translate_srt'` 分支中新增：

```ts
const sourceSubtitle = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'gen_srt');
const translateRows = normalizeSubtitleArray((taskSubtitle as any)?.subtitleData);
const sourceRows = normalizeSubtitleArray((sourceSubtitle as any)?.subtitleData);
```

- [ ] **Step 3: 用新 helper 替换旧的 `resolveReferenceSubtitle`**

替换为：

```ts
const reference = resolveTranslatedTtsReference({
  subtitleName,
  translateRows,
  sourceRows,
});
```

并记录结构化日志：

```ts
console.info('[generate-subtitle-voice] reference subtitle resolved', {
  taskId,
  subtitleName,
  referenceSubtitleName: reference.referenceSubtitleName,
  strategy: reference.strategy,
  needsBackfill: reference.needsBackfill,
  diagnostics: reference.diagnostics,
});
```

- [ ] **Step 4: 对历史数据做懒修复**

若：

```ts
reference.status === 'resolved' && reference.needsBackfill
```

则调用：

```ts
await patchSubtitleItemById(taskId, 'translate_srt', subtitleName, reference.patch!);
```

注意：
- patch 失败只记 warning，不中断 TTS 主流程
- 这一步的目标是逐步修复历史行，不是阻塞当前生成

- [ ] **Step 5: unresolved 时改为明确业务错误**

若 helper 返回 `unresolved`：

```ts
return respErr(`切割参考音频定位失败：${reference.reason}`);
```

要求：
- 不再调用 Python
- 不再吞成统一“任务失败，请重试”

- [ ] **Step 6: 删除 route 对 `ensureSplitReferenceAudioReady(...)` 的主依赖**

删除：
- `ensureSplitReferenceAudioReady(...)` helper
- `javaR2CoverWriteFile` 在本路由中的调用

保留原因：
- 当前 TTS 已直接用 `reference_subtitle_name`
- `overwrite-file` 是 silent-success，会掩盖真正缺失
- 这一步不是功能所必需，只会制造假阳性

- [ ] **Step 7: 运行 route 集成测试**

Run:

```bash
pnpm exec vitest run tests/integration/video-task-generate-subtitle-voice.test.ts
```

Expected:
- 原测试全部调整通过
- 新增 legacy repair / mismatch / unresolved 场景通过

- [ ] **Step 8: Commit**

```bash
git add src/app/api/video-task/generate-subtitle-voice/route.ts tests/integration/video-task-generate-subtitle-voice.test.ts
git commit -m "fix: resolve split tts references from source lineage"
```

---

## Chunk 4: 增加 Reference Audio 显式存在性校验

### Task 5: 在调用 Python 前做 split_audio reference existence preflight

**Files:**
- Create: `src/shared/lib/reference-audio-exists.ts`
- Test: `src/shared/lib/reference-audio-exists.test.ts`
- Modify: `src/app/api/video-task/generate-subtitle-voice/route.ts`
- Modify: `src/shared/services/javaService.ts`

- [ ] **Step 1: 写失败测试，约束只对 split-derived reference 做预检**

测试用例：
- `referenceSubtitleName !== subtitleName` 时触发 existence check
- HEAD/GET 返回 404 时 route 直接返回明确错误
- 非 split 普通行不增加这次探测

- [ ] **Step 2: 封装 presigned + HEAD helper**

实现建议：

```ts
export async function checkReferenceAudioExists(args: {
  taskId: string;
  userId: string;
  referenceSubtitleName: string;
}) {
  const path = `${args.userId}/${args.taskId}/split_audio/audio/${args.referenceSubtitleName}.wav`;
  const [signed] = await getPreSignedUrl([{ path, operation: 'download', expirationMinutes: 5 }], {
    forceRefresh: true,
  });
  const url = signed?.url;
  if (!url) return { exists: false, reason: 'presigned_missing', path };

  const resp = await fetch(url, { method: 'HEAD' });
  return { exists: resp.ok, status: resp.status, path, url };
}
```

如果目标存储对 `HEAD` 不稳定，则退回 `GET` + `Range: bytes=0-0`。

- [ ] **Step 3: route 中在 Python 调用前增加 preflight**

逻辑：

```ts
if (referenceSubtitleName && referenceSubtitleName !== subtitleName) {
  const existence = await checkReferenceAudioExists(...);
  if (!existence.exists) {
    console.error('[generate-subtitle-voice] reference audio missing', { ...existence, taskId, subtitleName });
    return respErr(`参考音频不存在：${existence.path}`);
  }
}
```

- [ ] **Step 4: 跑 helper 与 route 测试**

Run:

```bash
pnpm exec vitest run src/shared/lib/reference-audio-exists.test.ts tests/integration/video-task-generate-subtitle-voice.test.ts
```

Expected:
- reference 不存在时直接在 Next route 失败
- Python mock 不会被调用

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/reference-audio-exists.ts src/shared/lib/reference-audio-exists.test.ts src/app/api/video-task/generate-subtitle-voice/route.ts src/shared/services/javaService.ts
git commit -m "fix: preflight split reference audio before tts"
```

---

## Chunk 5: 清理测试基线与兼容行为

### Task 6: 更新现有测试和日志口径，避免未来回归

**Files:**
- Modify: `src/shared/services/pythonService.test.ts`
- Modify: `tests/integration/video-task-generate-subtitle-voice.test.ts`
- Modify: `tests/integration/video-task-split-subtitle.test.ts`

- [ ] **Step 1: 调整测试文案和断言**

删除旧语义：
- “split parent copy compatibility path”
- “只看 translate parent”

新增语义：
- canonical reference id
- source lineage fallback
- unresolved split reference

- [ ] **Step 2: 给 `pythonService.test.ts` 保持协议不变的断言**

继续断言：

```ts
reference_subtitle_name: '...'
```

确保这次修复不触碰 Python 请求结构。

- [ ] **Step 3: 运行当前所有相关测试集合**

Run:

```bash
pnpm exec vitest run \
  src/shared/lib/timeline/split.test.ts \
  src/shared/lib/subtitle-reference-audio.test.ts \
  src/shared/lib/reference-audio-exists.test.ts \
  src/shared/services/pythonService.test.ts \
  tests/integration/video-task-split-subtitle.test.ts \
  tests/integration/video-task-generate-subtitle-voice.test.ts
```

Expected:
- 全部通过

- [ ] **Step 4: Commit**

```bash
git add src/shared/services/pythonService.test.ts tests/integration/video-task-generate-subtitle-voice.test.ts tests/integration/video-task-split-subtitle.test.ts
git commit -m "test: cover split subtitle tts reference lineage"
```

---

## Chunk 6: 手工验证、发布与回滚

### Task 7: 按真实链路做回归验证

**Files:**
- No code changes

- [ ] **Step 1: 真实链路回归场景 1**

场景：
1. 打开一个已有任务
2. 调整某条 translate 时间轴，触发 `translate id` 改名
3. 再对该条字幕做 split
4. 分别点击左、右子段“生成音频”

Expected:
- 左右都成功
- Next 日志出现 `reference subtitle resolved`
- `strategy` 为 `canonical` 或 `source_parent`
- 不再出现 Python 404 下载 `split_audio/audio/<translate-parent>.wav`

- [ ] **Step 2: 真实链路回归场景 2**

场景：
1. 使用历史任务数据，确保 split row 没有 `vap_tts_reference_subtitle_id`
2. 点击生成音频

Expected:
- 首次命中 `source_parent` / `source_self`
- 成功后 translate row 被懒修复写回 canonical 字段

- [ ] **Step 3: 真实链路回归场景 3**

场景：
1. 人工构造 reference 真缺失的数据

Expected:
- Next route 直接返回明确错误
- 前端看到“参考音频不存在”
- Python 不被调用

- [ ] **Step 4: 发布策略**

顺序：
1. 先发 Next.js 仓库
2. 不需要等 Python 版本变更
3. 发布后观察 24 小时日志：
   - `reference subtitle resolved`
   - `strategy=source_parent`
   - `reference audio missing`
   - `unresolved`

- [ ] **Step 5: 回滚策略**

若线上异常：
1. 回滚 Next.js 到修复前版本
2. 保留新增字段，不做数据回退
3. 因为新字段只是附加元数据，不会破坏旧逻辑

- [ ] **Step 6: Commit（如验证过程中有脚本或文档补充）**

```bash
git add <only-if-needed>
git commit -m "docs: record split tts reference rollout verification"
```

---

## 非首发范围

以下项故意不放进首发补丁，避免扩 scope：

- 不做全量 DB backfill 脚本
- 不修改 Python TTS 服务协议
- 不改 Java `overwrite-file` 的公共契约
- 不尝试统一 source/translate 两条数组的 id 命名体系

这些都可以在首发修复稳定后再评估。

## 风险清单

1. **历史脏数据导致 source/translate index 已不一致**
   - 处理：helper 返回 `unresolved`，不做猜测性 fallback

2. **reference existence preflight 增加一次网络请求**
   - 处理：仅对 `referenceSubtitleName !== subtitleName` 的 split 场景触发

3. **已有测试仍然绑定旧的 overwrite-file 行为**
   - 处理：统一改成“直接使用 canonical/source lineage + preflight”

4. **字段命名继续被误解**
   - 处理：保留 `vap_split_parent_id`，但明确它不再参与 TTS reference 解析

## 完成标准

满足以下条件才算完成：

- 新切割任务的 translate 子段都带 `vap_tts_reference_subtitle_id`
- 历史 split 行在首次生成音频时可被 source lineage 懒修复
- `generate-subtitle-voice` 不再依赖 `javaR2CoverWriteFile` 准备 split reference
- reference 真缺失时在 Next route 层直接失败，并返回明确错误
- 用户给出的“左成功右失败”复现链路回归通过

