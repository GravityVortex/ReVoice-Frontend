# 字幕切割——音频同步切割 + 操作记录表 改造方案

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 切割字幕时同步切割音频文件，并将切割操作记录到独立的操作日志表，支持按操作粒度回滚。

**Architecture:** 新增 `vt_edit_operation` 表记录每次危险操作的快照；扩展 split API 在切割字幕的同时调用 Python 服务切割音频；新增 rollback API 从操作日志恢复数据。前端在工作台增加操作历史面板和回滚入口。

**Tech Stack:** Drizzle ORM / PostgreSQL (schema + migration), Next.js API Routes, R2 存储, Python 音频处理服务, React 前端

---

## 一、现状分析

### 1.1 当前切割流程

```
用户点击"切割" → 前端 POST /api/video-task/split-subtitle
  → splitSubtitlePayload() 把 translate 和 source 数组各拆成两段
  → replaceSubtitleDataPairByTaskIdTx() 原子写入 DB
  → 前端更新 convertObj
```

### 1.2 当前存在的问题

| 问题 | 现状 | 期望 |
|------|------|------|
| **音频未切割** | 切割只处理字幕文本数组，子段 `audio_url` 被清空，标记为 `vap_voice_status: 'missing'`，用户必须重新生成语音 | 切割时同步把父段音频按切割点物理切成两段，子段直接可试听 |
| **无操作记录** | 切割直接覆盖 `vt_task_subtitle` 的 JSONB，无法回滚 | 每次切割前把原始数据快照写入操作日志表，支持一键回滚 |
| **源语音未切割** | 源字幕 (gen_srt) 子段被标记为 `vap_source_mode: 'fallback_vocal'`，无法按段播放原始语音 | 源语音也同步切割，子段可以播放对应时间范围的原始语音 |

### 1.3 关键文件清单

| 文件 | 职责 |
|------|------|
| `src/config/db/schema.ts` | 数据库 schema 定义 |
| `src/shared/lib/timeline/split.ts` | 纯函数：字幕数组切割逻辑 |
| `src/app/api/video-task/split-subtitle/route.ts` | 切割 API 路由 |
| `src/shared/models/vt_task_subtitle.ts` | 字幕 DB 操作 |
| `src/shared/models/vt_file_task.ts` | 文件任务 DB 操作 |
| `src/shared/services/pythonService.ts` | Python 服务调用 |
| `src/shared/lib/reference-audio-repair.ts` | 参考音频修复 |
| `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx` | 编辑器主页面 |
| `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx` | 字幕工作台 |
| `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx` | 时间轴面板 |

---

## 二、数据库设计

### 2.1 新增表：`vt_edit_operation`

记录每次"危险操作"（切割、合并、批量修改等）的操作快照，便于回滚。

```sql
CREATE TABLE vt_edit_operation (
  id            VARCHAR(64)   PRIMARY KEY,
  task_id       VARCHAR(64)   NOT NULL REFERENCES vt_task_main(id) ON DELETE CASCADE,
  user_id       VARCHAR(50)   NOT NULL,
  operation_type VARCHAR(30)  NOT NULL,          -- 'split' | 'merge' | 'batch_edit' ...
  operation_id  VARCHAR(64)   NOT NULL,          -- 与 vap_split_operation_id 对齐
  -- 快照：操作前的完整数据
  snapshot_translate  JSONB    NOT NULL,          -- 操作前 translate_srt 完整数组
  snapshot_source     JSONB    NOT NULL,          -- 操作前 gen_srt 完整数组
  -- 操作详情
  operation_detail    JSONB    NOT NULL,          -- 操作参数，如 { clipId, splitAtMs, ... }
  -- 音频快照
  audio_snapshot      JSONB,                      -- 操作前受影响的音频文件 R2 keys
  -- 操作结果（便于回滚时精确恢复）
  result_detail       JSONB,                      -- 操作结果，如 { newIds, splitIndex, ... }
  -- 回滚状态: 0=未回滚  1=已回滚  2=回滚失败(部分恢复)
  rollback_status     INTEGER     NOT NULL DEFAULT 0,
  rolled_back_at      TIMESTAMP,
  rolled_back_by      VARCHAR(64),
  -- 标准字段
  created_by    VARCHAR(64)   NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_by    VARCHAR(64),
  updated_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  del_status    INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX idx_vt_edit_operation_task_id ON vt_edit_operation(task_id);
CREATE INDEX idx_vt_edit_operation_operation_id ON vt_edit_operation(operation_id);
CREATE INDEX idx_vt_edit_operation_type ON vt_edit_operation(task_id, operation_type);
```

### 2.2 Drizzle Schema 定义

```typescript
// src/config/db/schema.ts 新增
export const vtEditOperation = pgTable(
  'vt_edit_operation',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    taskId: varchar('task_id', { length: 64 })
      .notNull()
      .references(() => vtTaskMain.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 50 }).notNull(),
    operationType: varchar('operation_type', { length: 30 }).notNull(),
    operationId: varchar('operation_id', { length: 64 }).notNull(),
    snapshotTranslate: json('snapshot_translate').notNull(),
    snapshotSource: json('snapshot_source').notNull(),
    operationDetail: json('operation_detail').notNull(),
    audioSnapshot: json('audio_snapshot'),
    resultDetail: json('result_detail'),
    // 回滚状态: 0=未回滚  1=已回滚  2=回滚失败(部分恢复)
    rollbackStatus: integer('rollback_status').notNull().default(0),
    rolledBackAt: timestamp('rolled_back_at'),
    rolledBackBy: varchar('rolled_back_by', { length: 64 }),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedBy: varchar('updated_by', { length: 64 }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    delStatus: integer('del_status').notNull().default(0),
  },
  (table) => [
    index('idx_vt_edit_operation_task_id').on(table.taskId),
    index('idx_vt_edit_operation_operation_id').on(table.operationId),
    index('idx_vt_edit_operation_type').on(table.taskId, table.operationType),
  ]
);
```

### 2.3 操作详情 (operation_detail) 结构示例

```jsonc
// split 操作
{
  "clipId": "0003_00-00-08-000_00-00-12-500",
  "splitAtMs": 10250,
  "effectiveConvertText": "这段是切割后的文本",
  "parentTranslateAudioUrl": "adj_audio_time/0003_00-00-08-000_00-00-12-500.wav",
  "parentSourceAudioUrl": "adj_audio_time/0003_00-00-08-000_00-00-12-500.wav"
}
```

### 2.4 音频快照 (audio_snapshot) 结构示例

```jsonc
{
  "translate_audio": {
    "parentId": "0003_00-00-08-000_00-00-12-500",
    "r2Key": "adj_audio_time/0003_00-00-08-000_00-00-12-500.wav",
    "backupR2Key": "edit_backup/op_{operationId}/translate_0003_00-00-08-000_00-00-12-500.wav"
  },
  "source_audio": {
    "parentId": "0003_00-00-08-000_00-00-12-500",
    "r2Key": "adj_audio_time/0003_00-00-08-000_00-00-12-500.wav",
    "backupR2Key": "edit_backup/op_{operationId}/source_0003_00-00-08-000_00-00-12-500.wav"
  }
}
```

---

## 三、音频切割方案

### 3.1 整体思路

```
切割请求到达 → 
  1. 快照操作前数据 → 写入 vt_edit_operation
  2. 调用 splitSubtitlePayload() 切割字幕数组
  3. 调用 Python 音频切割服务 → 把父段音频按 splitAtMs 切成两段
  4. 用切割后的音频路径填充子段的 audio_url
  5. 原子写入 vt_task_subtitle
  6. 返回结果
```

### 3.2 Python 音频切割服务（同步接口 + Modal snapshot）

**要求：** 同步接口，不走 job 异步轮询。使用 Modal snapshot 机制保证冷启动速度。

**项目路径：** `/Users/dashuai/PycharmProjects/ReVoice-v-a-processing`

#### 3.2.1 Endpoint

`POST /api/internal/audio/split`（同步，阻塞等待结果返回）

**请求：**
```jsonc
{
  "task_id": "xxx",
  "user_id": "user_xxx",             // 必填：构造 R2 presigned URL 需要
  "audio_r2_key": "adj_audio_time/0003_00-00-08-000_00-00-12-500.wav",
  "split_at_ms": 10250,
  "clip_start_ms": 8000,
  "clip_end_ms": 12500,
  "left_output_key": "adj_audio_time/00030001_00-00-08-000_00-00-10-250.wav",
  "right_output_key": "adj_audio_time/00030002_00-00-10-250_00-00-12-500.wav",
  "backup_key": "edit_backup/op_{operationId}/translate_0003.wav"  // 可选
}
```

**响应：**
```jsonc
{
  "code": 200,
  "data": {
    "left_path": "adj_audio_time/00030001_00-00-08-000_00-00-10-250.wav",
    "left_duration": 2.25,
    "right_path": "adj_audio_time/00030002_00-00-10-250_00-00-12-500.wav",
    "right_duration": 2.25
  }
}
```

#### 3.2.2 Modal snapshot 集成（3 步）

**Step 1: 新增 service 模块** — `production/video_translate/split_audio_service.py`

```python
async def run_split_audio_at_point(*, task_id, audio_r2_key, split_at_ms,
    clip_start_ms, clip_end_ms, left_output_key, right_output_key,
    backup_key=None) -> dict:
    # 1. presigned URL 下载音频
    # 2. pydub AudioSegment 加载 + 按相对时间切割
    # 3. 导出两段 WAV + 上传 R2
    # 4. 可选备份原始文件
    # 5. 返回 { left_path, left_duration, right_path, right_duration }
```

**Step 2: `modal_app.py`** — `VAPSyncWorker`（CPU=2.0）新增 worker method + snapshot 预导入

```python
# @modal.enter(snap=True) 中追加：
from production.video_translate import split_audio_service  # noqa: F401

# 新增 method：
@modal.method()
async def split_audio_at_point_job(self, *, task_id, audio_r2_key, split_at_ms,
    clip_start_ms, clip_end_ms, left_output_key, right_output_key,
    backup_key=None, deadline_ms=None, request_id=None) -> dict:
    from production.video_translate.split_audio_service import run_split_audio_at_point
    return await run_split_audio_at_point(...)
```

**Step 3: `video_translate_api.py`** — 同步路由（参考 merge endpoint 的模式）

```python
@sync_router.post("/api/internal/audio/split")
async def split_audio_at_point(request: AudioSplitRequest):
    if DEPLOYMENT_PLATFORM == "modal":
        call = VAPSyncWorker().split_audio_at_point_job.spawn(...)
        result = await run_in_threadpool(call.get)
        return result
    else:
        from production.video_translate.split_audio_service import run_split_audio_at_point
        return await run_split_audio_at_point(...)
```

#### 3.2.3 核心切割逻辑（参考现有 `split_audio_by_subtitle_service.py` 的 pydub 模式）

1. 通过 presigned URL 下载音频: `get_url_and_download_async(task_id, audio_r2_key, tmp_dir)`
2. `AudioSegment` 加载 → 按 `split_at_ms - clip_start_ms` 相对时间切割
3. 导出两段 WAV
4. 上传到 R2: `get_url_and_upload_from_path_async(...)`
5. 可选：将原始音频备份到 `backup_key`
6. 返回两段音频的 R2 路径和时长

### 3.3 音频切割的时间计算

```
父段时间范围：   [clipStartMs, clipEndMs]
切割点（绝对）：  splitAtMs
切割点（相对）：  splitAtMs - clipStartMs

左段音频：      [0, splitAtMs - clipStartMs)     → 文件的前半段
右段音频：      [splitAtMs - clipStartMs, end)   → 文件的后半段
```

### 3.4 源语音（gen_srt）的音频切割

当前源语音存储在两个可能的路径：
- `adj_audio_time/{sourceId}.wav` — 已调整时间的音频
- 整段原始音频 (vocal track) — 通过 `vap_source_mode: 'segment_first'` 决定播放方式

**方案：**
- 如果源语音有独立的 per-segment 音频文件（`adj_audio_time/{sourceId}.wav` 存在），则同步切割
- 如果源语音使用 `fallback_vocal` 模式（整段 vocal），则：
  - 子段标记为 `vap_source_mode: 'time_range'`（新增模式）
  - 记录 `vap_source_time_range_start_ms` 和 `vap_source_time_range_end_ms`
  - 前端播放时按时间范围播放 vocal track 对应片段
  - 或者同样调用 Python 从 vocal track 中切出对应片段

**建议采用切割方案**（统一处理更简单）：对源语音也执行物理切割，产生两个独立音频文件，子段设置 `vap_source_mode: 'segment_first'`。

### 3.5 split.ts 纯函数改造

`makeTranslateChild()` 和 `makeSourceChild()` 需要接受可选的音频切割结果参数：

```typescript
type AudioSplitResult = {
  leftAudioPath: string;
  leftDuration: number;
  rightAudioPath: string;
  rightDuration: number;
};

// makeTranslateChild 改造：
function makeTranslateChild(
  base: any,
  nextId: string,
  startMs: number,
  endMs: number,
  effectiveConvertText: string,
  splitOperationId: string,
  nowMs: number,
  translateParentId: string,
  ttsReferenceSubtitleId: string,
  audioSplit?: { audioPath: string; duration: number }, // 新增
) {
  return {
    ...base,
    id: nextId,
    start: msToSrtTime(startMs),
    end: msToSrtTime(endMs),
    txt: effectiveConvertText,
    timing_rev_ms: nowMs,
    // 如果有音频切割结果，填充 audio_url；否则走现有逻辑清空
    audio_url: audioSplit?.audioPath || '',
    vap_draft_audio_path: '',
    vap_draft_txt: effectiveConvertText,
    // ...其他字段同现有逻辑
    // 关键变化：如果有音频，voice_status 为 'ready' 而非 'missing'
    vap_voice_status: audioSplit?.audioPath ? 'ready' : 'missing',
    vap_needs_tts: !audioSplit?.audioPath,
    vap_split_parent_id: translateParentId,
    vap_tts_reference_subtitle_id: ttsReferenceSubtitleId,
    vap_split_operation_id: splitOperationId,
    vap_draft_duration: audioSplit?.duration,
    // cache buster：音频切割成功时设置时间戳，否则前端拼 URL 时无 ?t=xxx
    vap_tts_updated_at_ms: audioSplit?.audioPath ? nowMs : undefined,
  };
}
```

### 3.6 降级策略

音频切割依赖 Python 服务和 R2 存储。如果音频切割失败，不应阻塞字幕切割本身：

```
尝试切割音频 →
  成功 → 子段 audio_url 填充切割后的路径, vap_voice_status = 'ready'
  失败 → 子段 audio_url = '', vap_voice_status = 'missing'（退化到现有行为）
         → 操作日志记录 audioSplitFailed = true
         → 前端提示"音频切割失败，可手动重新生成语音"
```

---

## 四、API 改造

### 4.1 切割 API 改造 (`split-subtitle/route.ts`)

**改造步骤：**

```typescript
export async function POST(req: Request) {
  // ... 现有校验逻辑不变 ...

  // ① 快照操作前数据
  const snapshotTranslate = JSON.parse(JSON.stringify(translate));
  const snapshotSource = JSON.parse(JSON.stringify(source));

  // ② 查找父段音频信息
  const parentTranslateAudioUrl = resolveParentAudioUrl(clip);
  const parentSourceAudioUrl = resolveParentAudioUrl(sourceClip);
  const splitOperationId = randomUUID();

  // ③ 预计算子段 ID（纯函数，不依赖 splitSubtitlePayload）
  const sourceClip = source[splitIndex];
  const translateChildIds = buildSplitChildIds({
    id: clip.id, leftStartMs: clipStartMs, leftEndMs: splitAtMs,
    rightStartMs: splitAtMs, rightEndMs: clipEndMs,
  });
  const sourceChildIds = buildSplitChildIds({
    id: sourceClip.id, leftStartMs: clipStartMs, leftEndMs: splitAtMs,
    rightStartMs: splitAtMs, rightEndMs: clipEndMs,
  });

  // ④ 检查父段音频是否真实存在（guard：missing/failed 跳过音频切割）
  const canSplitTranslateAudio = parentTranslateAudioUrl
    && clip.vap_voice_status !== 'missing'
    && clip.vap_voice_status !== 'failed'
    && clip.vap_needs_tts !== true;
  const canSplitSourceAudio = parentSourceAudioUrl
    && sourceClip.vap_source_segment_missing !== true;

  // ⑤ 音频切割（在纯函数之前，用预计算的 ID 构造输出路径）
  //    注意：源语音输出到 split_audio/audio/ 而不是 adj_audio_time/
  let translateAudioSplit: AudioSplitResult | null = null;
  let sourceAudioSplit: AudioSplitResult | null = null;
  try {
    if (canSplitTranslateAudio) {
      translateAudioSplit = await splitAudioFile({
        taskId, userId: user.id,
        audioR2Key: parentTranslateAudioUrl,
        splitAtMs, clipStartMs, clipEndMs,
        leftOutputKey: `adj_audio_time/${translateChildIds.left}.wav`,
        rightOutputKey: `adj_audio_time/${translateChildIds.right}.wav`,
      });
    }
  } catch (e) {
    console.warn('[split-subtitle] translate audio split failed:', e);
  }
  try {
    if (canSplitSourceAudio) {
      sourceAudioSplit = await splitAudioFile({
        taskId, userId: user.id,
        audioR2Key: parentSourceAudioUrl,
        splitAtMs, clipStartMs, clipEndMs,
        leftOutputKey: `split_audio/audio/${sourceChildIds.left}.wav`,
        rightOutputKey: `split_audio/audio/${sourceChildIds.right}.wav`,
      });
    }
  } catch (e) {
    console.warn('[split-subtitle] source audio split failed:', e);
  }

  // ⑥ 调用纯函数——音频切割结果直接传入，由纯函数统一组装子段数据
  const result = splitSubtitlePayload({
    clipId, splitAtMs, effectiveConvertText, splitOperationId, nowMs: Date.now(),
    translate, source,
    translateAudioSplit,   // 可选：音频切割结果
    sourceAudioSplit,      // 可选：音频切割结果
  });

  // ⑦ 操作日志 + 字幕数据在同一事务中原子写入
  await replaceSubtitleDataAndLogTx(taskId, {
    translate: result.translate,
    source: result.source,
  }, {
    id: randomUUID(),
    taskId,
    userId: user.id,
    operationType: 'split',
    operationId: splitOperationId,
    snapshotTranslate,
    snapshotSource,
    operationDetail: {
      clipId, splitAtMs, effectiveConvertText,
      parentTranslateAudioUrl, parentSourceAudioUrl,
      audioSplitSuccess: {
        translate: !!translateAudioSplit,
        source: !!sourceAudioSplit,
      },
    },
    audioSnapshot: {
      translate_audio: parentTranslateAudioUrl ? {
        parentId: clip.id,
        r2Key: parentTranslateAudioUrl,
        backupR2Key: `edit_backup/op_${splitOperationId}/translate_${clip.id}.wav`,
      } : null,
      source_audio: parentSourceAudioUrl ? {
        parentId: sourceClip.id,
        r2Key: parentSourceAudioUrl,
        backupR2Key: `edit_backup/op_${splitOperationId}/source_${sourceClip.id}.wav`,
      } : null,
    },
    resultDetail: {
      newIds: result.newIds,
      splitIndex: result.splitIndex,
      pendingVoiceIds: result.pendingVoiceIds,
    },
    createdBy: user.id,
  });

  // ⑧ 返回结果
  return respData({
    translate: result.translate,
    source: result.source,
    newIds: result.newIds,
    splitIndex: result.splitIndex,
    splitOperationId,
    pendingVoiceIds: result.pendingVoiceIds,
    audioSplitSuccess: !!translateAudioSplit,
  });
}
```

### 4.2 新增回滚 API (`rollback-operation/route.ts`)

```
POST /api/video-task/rollback-operation
{
  "taskId": "xxx",
  "operationId": "xxx"
}
```

**回滚流程：**

```
1. 校验权限
2. 查找 vt_edit_operation 记录
3. 检查是否已回滚
4. 用快照数据覆盖 vt_task_subtitle
5. 恢复音频文件（从 backup 复制回来）
6. 更新操作记录的 rollback_status
7. 返回恢复后的数据
```

### 4.3 新增操作历史查询 API (`operation-history/route.ts`)

```
GET /api/video-task/operation-history?taskId=xxx
```

返回该任务的所有编辑操作记录，按时间倒序。

---

## 五、前端改造

### 5.1 切割后的 UI 变化

**音频切割成功时：**
- 子段 `vap_voice_status` = `'ready'`，直接可试听
- 子段不再显示"译音待更新"状态
- 时间轴上切割后的两段立即可播放
- toast 提示"字幕和音频已切割完成"

**音频切割失败（降级）时：**
- 行为与当前完全一致
- 额外 toast 提示"音频切割失败，请手动重新生成语音"

### 5.2 操作历史面板

在字幕工作台或时间轴面板增加"操作历史"入口：

```
[操作历史] 按钮
  → 弹出侧面板 / 抽屉
  → 显示操作列表：
    - 2026-03-15 14:30  切割字幕 #3  [回滚]
    - 2026-03-15 14:25  切割字幕 #7  [已回滚]
    - ...
```

### 5.3 快捷键 Ctrl+Z 撤销

在编辑器主页面（`page.tsx`）注册全局快捷键 `Ctrl+Z` / `Cmd+Z`：

```
用户按下 Ctrl+Z
  → 检查是否有可回滚的操作（最近一次 rollbackStatus === 0）
  → 有：弹出回滚确认弹窗
  → 无：toast 提示"没有可撤销的操作"
```

实现位置：在现有 `handleEditorKeyDown`（page.tsx:3149）中追加：

```typescript
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
  e.preventDefault();
  handleRollbackLatest();
  return;
}
```

### 5.4 回滚确认弹窗

```
点击 [回滚] 或按 Ctrl+Z
  → 确认弹窗：
    标题："撤销切割操作"
    正文："将恢复到切割前的字幕和音频状态。
          ⚠️ 切割后对子段的所有修改（重翻译、生成语音、手动编辑）都会丢失。"
    按钮：[取消] [确认撤销]
  → 确认后调用 rollback API
  → 成功：刷新页面数据，关闭弹窗，toast "已撤销"
  → 失败：toast 提示错误
```

### 5.5 自然引导——切割后 toast 中提示 Ctrl+Z

切割成功后的 toast 消息中增加撤销引导：

```
字幕已切割 · 按 Ctrl+Z 可撤销
```

用 Sonner 的 action 功能，让 toast 自带"撤销"按钮：

```typescript
toast.success(t('videoEditor.toast.splitSuccess'), {
  description: t('videoEditor.toast.splitUndoHint'),
  action: {
    label: t('videoEditor.toast.undo'),
    onClick: () => handleRollbackLatest(),
  },
  duration: 8000, // 给用户足够时间注意到
});
```

### 5.6 自然引导——时间轴切割图标旁的 tooltip

切割按钮（时间轴面板的剪刀图标）的 tooltip 中提示快捷键：

```
切割字幕 (S) · 撤销 Ctrl+Z
```

### 5.7 回滚的约束

- 只允许回滚最近一次未回滚的操作（栈式回滚）
- 已回滚的操作不可再次回滚
- 回滚后，切割之后对子段的所有修改（重翻译、生成语音、手动编辑）都会丢失（弹窗明确提示）

---

## 六、文件结构

### 6.1 新增文件

| 文件 | 职责 |
|------|------|
| `src/shared/models/vt_edit_operation.ts` | 操作日志表 CRUD |
| `src/app/api/video-task/rollback-operation/route.ts` | 回滚 API |
| `src/app/api/video-task/operation-history/route.ts` | 操作历史查询 API |
| `src/shared/lib/timeline/split-audio.ts` | 音频切割调用封装 |
| `src/shared/lib/timeline/split-audio.test.ts` | 音频切割单元测试 |
| `tests/integration/video-task-rollback-operation.test.ts` | 回滚集成测试 |
| `tests/integration/video-task-operation-history.test.ts` | 操作历史集成测试 |

### 6.2 修改文件

| 文件 | 改动 |
|------|------|
| `src/config/db/schema.ts` | 新增 `vtEditOperation` 表定义 |
| `src/shared/lib/timeline/split.ts` | `makeTranslateChild` / `makeSourceChild` 增加可选音频参数 |
| `src/shared/lib/timeline/split.test.ts` | 补充音频参数测试 |
| `src/app/api/video-task/split-subtitle/route.ts` | 增加快照、音频切割、操作日志逻辑 |
| `src/shared/services/pythonService.ts` | 新增 `pySplitAudio()` 调用 |
| `src/shared/services/pythonService.test.ts` | 对应测试 |
| `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx` | 处理 `audioSplitSuccess` 返回值 |
| `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx` | 增加操作历史入口 |
| `src/config/locale/messages/en/video_convert/videoEditor.json` | 新增文案 |
| `src/config/locale/messages/zh/video_convert/videoEditor.json` | 新增文案 |

---

## 七、任务分解

### Task 1: 数据库 Schema 新增 `vt_edit_operation` 表

**Files:**
- Modify: `src/config/db/schema.ts`
- Create: `src/shared/models/vt_edit_operation.ts`

- [ ] **Step 1: 在 schema.ts 中新增 vtEditOperation 表定义**

在 `vtFileTask` 表定义之后添加：

```typescript
export const vtEditOperation = pgTable(
  'vt_edit_operation',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    taskId: varchar('task_id', { length: 64 })
      .notNull()
      .references(() => vtTaskMain.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 50 }).notNull(),
    operationType: varchar('operation_type', { length: 30 }).notNull(),
    operationId: varchar('operation_id', { length: 64 }).notNull(),
    snapshotTranslate: json('snapshot_translate').notNull(),
    snapshotSource: json('snapshot_source').notNull(),
    operationDetail: json('operation_detail').notNull(),
    audioSnapshot: json('audio_snapshot'),
    resultDetail: json('result_detail'),
    // 回滚状态: 0=未回滚  1=已回滚  2=回滚失败(部分恢复)
    rollbackStatus: integer('rollback_status').notNull().default(0),
    rolledBackAt: timestamp('rolled_back_at'),
    rolledBackBy: varchar('rolled_back_by', { length: 64 }),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedBy: varchar('updated_by', { length: 64 }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    delStatus: integer('del_status').notNull().default(0),
  },
  (table) => [
    index('idx_vt_edit_operation_task_id').on(table.taskId),
    index('idx_vt_edit_operation_operation_id').on(table.operationId),
    index('idx_vt_edit_operation_type').on(table.taskId, table.operationType),
  ]
);
```

- [ ] **Step 2: 创建 Model 文件 `vt_edit_operation.ts`**

```typescript
import { vtEditOperation } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and } from 'drizzle-orm';

export type VtEditOperation = typeof vtEditOperation.$inferSelect;
export type NewVtEditOperation = typeof vtEditOperation.$inferInsert;

export async function insertEditOperation(data: NewVtEditOperation) {
  const [result] = await db().insert(vtEditOperation).values(data).returning();
  return result;
}

export async function findEditOperationById(id: string) {
  const [result] = await db()
    .select()
    .from(vtEditOperation)
    .where(and(eq(vtEditOperation.id, id), eq(vtEditOperation.delStatus, 0)))
    .limit(1);
  return result;
}

export async function findEditOperationByOperationId(operationId: string) {
  const [result] = await db()
    .select()
    .from(vtEditOperation)
    .where(and(
      eq(vtEditOperation.operationId, operationId),
      eq(vtEditOperation.delStatus, 0),
    ))
    .limit(1);
  return result;
}

export async function getEditOperationsByTaskId(taskId: string) {
  return await db()
    .select()
    .from(vtEditOperation)
    .where(and(
      eq(vtEditOperation.taskId, taskId),
      eq(vtEditOperation.delStatus, 0),
    ))
    .orderBy(desc(vtEditOperation.createdAt));
}

// ---- 以下函数定义在 vt_edit_operation.ts 中 ----
// 需要从 schema 中 import vtTaskSubtitle 和 vtEditOperation
import { vtTaskSubtitle, vtEditOperation } from '@/config/db/schema';

/**
 * 原子事务：同时写入字幕数据 + 操作日志
 * 保证两者要么一起成功，要么一起失败
 * 注：此函数跨两张表，但归属于操作日志模块（操作日志是事务的发起方）
 */
export async function replaceSubtitleDataAndLogTx(
  taskId: string,
  next: { translate: any[]; source: any[] },
  operationLog: NewVtEditOperation,
) {
  return await db().transaction(async (tx) => {
    const updatedAt = new Date();
    const translate = await tx
      .update(vtTaskSubtitle)
      .set({ subtitleData: JSON.stringify(next.translate), updatedAt })
      .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.stepName, 'translate_srt')))
      .returning();
    const source = await tx
      .update(vtTaskSubtitle)
      .set({ subtitleData: JSON.stringify(next.source), updatedAt })
      .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.stepName, 'gen_srt')))
      .returning();
    await tx.insert(vtEditOperation).values(operationLog);
    return { translate, source };
  });
}

/**
 * 更新回滚状态
 * @param status  0=未回滚  1=已回滚  2=回滚失败(部分恢复)
 */
export async function updateEditOperationRollbackStatus(
  id: string,
  status: number,
  rolledBackBy: string,
) {
  const [result] = await db()
    .update(vtEditOperation)
    .set({
      rollbackStatus: status,
      rolledBackAt: new Date(),
      rolledBackBy,
      updatedAt: new Date(),
      updatedBy: rolledBackBy,
    })
    .where(eq(vtEditOperation.id, id))
    .returning();
  return result;
}
```

- [ ] **Step 3: 生成并执行 DB migration**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

- [ ] **Step 4: 验证表创建成功**

连接数据库确认 `vt_edit_operation` 表已创建，索引已建立。

---

### Task 2: Python 音频切割服务调用封装（Next.js 侧）

> 对应 Python 侧的同步接口 `POST /api/internal/audio/split`，无需轮询。

**Files:**
- Create: `src/shared/lib/timeline/split-audio.ts`
- Create: `src/shared/lib/timeline/split-audio-split.test.ts`
- Modify: `src/shared/services/pythonService.ts`

- [ ] **Step 1: 在 pythonService.ts 中新增 pySplitAudio 函数**

参考 `pyConvertTxtGenerateVoice` 的调用模式，新增同步调用：

```typescript
export async function pySplitAudio(
  taskId: string,
  userId: string,
  audioR2Key: string,
  splitAtMs: number,
  clipStartMs: number,
  clipEndMs: number,
  leftOutputKey: string,
  rightOutputKey: string,
  backupKey?: string,
) {
  const requestBody = {
    task_id: taskId,
    user_id: userId,
    audio_r2_key: audioR2Key,
    split_at_ms: splitAtMs,
    clip_start_ms: clipStartMs,
    clip_end_ms: clipEndMs,
    left_output_key: leftOutputKey,
    right_output_key: rightOutputKey,
    backup_key: backupKey,
  };
  // 调用 Python 服务（同步接口）
  const response = await fetch(`${PYTHON_API_BASE}/api/internal/audio/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  return response.json();
}
```

> **注意**：Python 侧的音频切割 endpoint 需要同步开发，这里只封装调用侧。如果 Python 侧暂未开发完成，可通过 mock / feature flag 降级。

- [ ] **Step 2: 创建 split-audio.ts 封装层**

```typescript
// src/shared/lib/timeline/split-audio.ts

export type AudioSplitResult = {
  leftPath: string;
  leftDuration: number;
  rightPath: string;
  rightDuration: number;
};

export async function splitAudioFile(args: {
  taskId: string;
  userId: string;
  audioR2Key: string;
  splitAtMs: number;
  clipStartMs: number;
  clipEndMs: number;
  leftOutputKey: string;
  rightOutputKey: string;
  backupKey?: string;
}): Promise<AudioSplitResult | null> {
  // 调用 Python 服务
  // 失败返回 null（降级）
}
```

- [ ] **Step 3: 编写测试**

测试降级行为（Python 返回错误时返回 null）。

---

### Task 3: 改造 split.ts 纯函数

**Files:**
- Modify: `src/shared/lib/timeline/split.ts`
- Modify: `src/shared/lib/timeline/split.test.ts`

- [ ] **Step 1: 为 makeTranslateChild 添加可选 audioSplit 参数**

```typescript
function makeTranslateChild(
  base: any,
  nextId: string,
  startMs: number,
  endMs: number,
  effectiveConvertText: string,
  splitOperationId: string,
  nowMs: number,
  translateParentId: string,
  ttsReferenceSubtitleId: string,
  audioSplit?: { audioPath: string; duration: number },
) {
  return {
    ...base,
    id: nextId,
    start: msToSrtTime(startMs),
    end: msToSrtTime(endMs),
    txt: effectiveConvertText,
    timing_rev_ms: nowMs,
    audio_url: audioSplit?.audioPath || '',
    vap_draft_audio_path: '',
    vap_draft_txt: effectiveConvertText,
    vap_tts_job_id: '',
    vap_tts_request_key: '',
    vap_tts_updated_at_ms: undefined,
    vap_tr_job_id: '',
    vap_tr_request_key: '',
    vap_tr_updated_at_ms: undefined,
    vap_voice_status: audioSplit?.audioPath ? 'ready' : 'missing',
    vap_needs_tts: !audioSplit?.audioPath,
    vap_split_parent_id: translateParentId,
    vap_tts_reference_subtitle_id: ttsReferenceSubtitleId,
    vap_split_operation_id: splitOperationId,
    audio_rev_ms: undefined,
    vap_draft_duration: audioSplit?.duration ?? undefined,
    // cache buster：音频切割成功时设置时间戳，否则前端拼 URL 时无 ?t=xxx
    vap_tts_updated_at_ms: audioSplit?.audioPath ? nowMs : undefined,
  };
}
```

- [ ] **Step 2: 为 makeSourceChild 添加可选 audioSplit 参数**

注意：源语音的切割输出路径应为 `split_audio/audio/{id}.wav`（与前端播放路径一致），
**不是** `adj_audio_time/`。

```typescript
function makeSourceChild(
  base: any,
  nextId: string,
  startMs: number,
  endMs: number,
  splitOperationId: string,
  parentId: string,
  audioSplit?: { audioPath: string; duration: number },
) {
  return {
    ...base,
    id: nextId,
    start: msToSrtTime(startMs),
    end: msToSrtTime(endMs),
    audio_url: audioSplit?.audioPath || '',
    vap_source_mode: audioSplit?.audioPath ? 'segment_first' : 'fallback_vocal',
    vap_source_segment_missing: !audioSplit?.audioPath,
    vap_source_split_parent_id: parentId,
    vap_split_operation_id: splitOperationId,
  };
}
```

- [ ] **Step 3: 扩展 splitSubtitlePayload 的输入输出类型**

```typescript
type SplitSubtitlePayloadInput = {
  clipId: string;
  splitAtMs: number;
  translate: any[];
  source: any[];
  effectiveConvertText: string;
  splitOperationId: string;
  nowMs: number;
  // 新增可选参数
  translateAudioSplit?: AudioSplitResult;
  sourceAudioSplit?: AudioSplitResult;
};
```

在 `splitSubtitlePayload` 函数中，将 `translateAudioSplit` 拆分后分别传给左右子段：

```typescript
const leftTranslateAudio = input.translateAudioSplit
  ? { audioPath: input.translateAudioSplit.leftPath, duration: input.translateAudioSplit.leftDuration }
  : undefined;
const rightTranslateAudio = input.translateAudioSplit
  ? { audioPath: input.translateAudioSplit.rightPath, duration: input.translateAudioSplit.rightDuration }
  : undefined;
```

- [ ] **Step 4: 更新 pendingVoiceIds 逻辑**

如果音频切割成功，子段不再需要 TTS，`pendingVoiceIds` 应该为空：

```typescript
pendingVoiceIds: input.translateAudioSplit
  ? []
  : [translateIds.left, translateIds.right],
```

- [ ] **Step 5: 补充测试用例**

1. 无音频切割（现有行为不变）
2. 有音频切割（voice_status 为 ready, needs_tts 为 false）
3. 只有 translate 音频切割成功、source 失败

---

### Task 4: 改造 split-subtitle API 路由

**Files:**
- Modify: `src/app/api/video-task/split-subtitle/route.ts`

- [ ] **Step 1: 引入新依赖**

```typescript
import { insertEditOperation } from '@/shared/models/vt_edit_operation';
import { splitAudioFile } from '@/shared/lib/timeline/split-audio';
```

- [ ] **Step 2: 在切割前保存快照**

```typescript
const snapshotTranslate = JSON.parse(JSON.stringify(translate));
const snapshotSource = JSON.parse(JSON.stringify(source));
```

- [ ] **Step 3: 查找父段音频信息**

```typescript
function resolveParentAudioUrl(clip: any): string {
  if (!clip) return '';
  const audioUrl = typeof clip.audio_url === 'string' ? clip.audio_url.trim() : '';
  if (audioUrl) return audioUrl;
  const id = typeof clip.id === 'string' ? clip.id : '';
  return id ? `adj_audio_time/${id}.wav` : '';
}
```

- [ ] **Step 4: 尝试音频切割（降级安全）**

在 `splitSubtitlePayload` 调用之前或之后执行音频切割，并将结果传入。

- [ ] **Step 5: 写入操作日志**

调用 `insertEditOperation()` 记录快照和操作详情。

- [ ] **Step 6: 如果音频切割成功，将结果回写到子段数据**

新增辅助函数 `applyAudioSplitToSubtitleArray()` 根据 `newIds` 找到子段并填充 `audio_url`。

- [ ] **Step 7: 返回值增加 `audioSplitSuccess` 字段**

让前端知道音频是否切割成功，以决定 UI 表现。

---

### Task 5: 新增回滚 API

**Files:**
- Create: `src/app/api/video-task/rollback-operation/route.ts`
- Create: `tests/integration/video-task-rollback-operation.test.ts`

- [ ] **Step 1: 实现回滚 API 基础逻辑**

```typescript
export async function POST(req: Request) {
  const body = await req.json();
  const { taskId, operationId } = body;

  // 校验
  const user = await getUserInfo();
  if (!user) return respErr('no auth');

  const operation = await findEditOperationByOperationId(operationId);
  if (!operation) return respErr('operation not found');
  if (operation.taskId !== taskId) return respErr('task mismatch');
  if (operation.userId !== user.id) return respErr('no permission');
  // rollback_status: 0=未回滚  1=已回滚  2=回滚失败
  if (operation.rollbackStatus !== 0) return respErr('already rolled back');

  // 检查是否为最近一次操作（栈式回滚）
  const allOps = await getEditOperationsByTaskId(taskId);
  const latestNonRolledBack = allOps.find(op => op.rollbackStatus === 0);
  if (latestNonRolledBack?.operationId !== operationId) {
    return respErr('只能回滚最近一次操作');
  }

  // 用快照恢复字幕数据
  const snapshotTranslate = operation.snapshotTranslate;
  const snapshotSource = operation.snapshotSource;
  await replaceSubtitleDataPairByTaskIdTx(taskId, {
    translate: snapshotTranslate,
    source: snapshotSource,
  });

  // 恢复音频文件（如果有备份）
  // 可选：从 edit_backup/ 复制回 adj_audio_time/

  // 更新操作状态: 1=已回滚
  await updateEditOperationRollbackStatus(operation.id, 1, user.id);

  return respData({ translate: snapshotTranslate, source: snapshotSource });
}
```

- [ ] **Step 2: 编写集成测试**

---

### Task 6: 新增操作历史查询 API

**Files:**
- Create: `src/app/api/video-task/operation-history/route.ts`
- Create: `tests/integration/video-task-operation-history.test.ts`

- [ ] **Step 1: 实现查询 API**

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId') || '';

  const user = await getUserInfo();
  if (!user) return respErr('no auth');

  const operations = await getEditOperationsByTaskId(taskId);
  // 过滤只返回当前用户的操作
  const filtered = operations.filter(op => op.userId === user.id);

  return respData(filtered.map(op => ({
    id: op.id,
    operationType: op.operationType,
    operationId: op.operationId,
    operationDetail: op.operationDetail,
    rollbackStatus: op.rollbackStatus,
    createdAt: op.createdAt,
    rolledBackAt: op.rolledBackAt,
  })));
}
```

---

### Task 7: 前端改造——编辑器主页面

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx`

- [ ] **Step 1: 处理切割 API 的新返回值 + toast 引导撤销**

在 `handleSubtitleSplit` 中，用 Sonner 的 action 功能提供"撤销"按钮：

```typescript
const { audioSplitSuccess, splitOperationId } = data;
// 保存最近一次操作 ID，供 Ctrl+Z 使用
latestOperationIdRef.current = splitOperationId;

if (audioSplitSuccess) {
  toast.success(t('videoEditor.toast.splitCompleteWithAudio'), {
    description: t('videoEditor.toast.splitUndoHint'),  // "按 Ctrl+Z 可撤销"
    action: {
      label: t('videoEditor.toast.undo'),
      onClick: () => handleRollbackLatest(),
    },
    duration: 8000,
  });
} else {
  toast.info(t('videoEditor.toast.splitNeedVoice'), {
    description: t('videoEditor.toast.splitUndoHint'),
    action: {
      label: t('videoEditor.toast.undo'),
      onClick: () => handleRollbackLatest(),
    },
    duration: 8000,
  });
}
```

- [ ] **Step 2: 注册 Ctrl+Z 快捷键**

在现有 `handleEditorKeyDown`（page.tsx:3149）中追加：

```typescript
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
  e.preventDefault();
  handleRollbackLatest();
  return;
}
```

- [ ] **Step 3: 实现 handleRollbackLatest 函数**

```typescript
const handleRollbackLatest = useCallback(async () => {
  // 查询最近一次可回滚操作
  const ops = await fetch(`/api/video-task/operation-history?taskId=${convertId}`);
  const data = await ops.json();
  const latest = data?.data?.find((op: any) => op.rollbackStatus === 0);
  if (!latest) {
    toast.info(t('videoEditor.toast.rollbackNothingToUndo'));
    return;
  }
  // 弹出确认弹窗
  setRollbackTarget(latest);
  setShowRollbackConfirm(true);
}, [convertId]);
```

- [ ] **Step 4: 回滚确认弹窗 + 执行回滚**

- [ ] **Step 5: 添加操作历史查询 hooks**

---

### Task 8: 前端改造——操作历史面板 UI

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/config/locale/messages/zh/video_convert/videoEditor.json`
- Modify: `src/config/locale/messages/en/video_convert/videoEditor.json`

- [ ] **Step 1: 在工作台头部增加"操作历史"按钮**

- [ ] **Step 2: 实现操作历史抽屉组件**

- [ ] **Step 3: 更新切割按钮 tooltip**

在时间轴面板的切割按钮（剪刀图标）tooltip 中提示撤销快捷键：
`切割字幕 (S) · 撤销 Ctrl+Z`

- [ ] **Step 4: 添加国际化文案**

```json
{
  "operationHistory": "操作历史",
  "rollback": "撤销",
  "rollbackConfirmTitle": "撤销切割操作",
  "rollbackConfirmBody": "将恢复到切割前的字幕和音频状态。\n⚠️ 切割后对子段的所有修改（重翻译、生成语音、手动编辑）都会丢失。",
  "rollbackConfirmAction": "确认撤销",
  "rollbackSuccess": "已撤销",
  "rollbackFailed": "撤销失败",
  "rollbackNothingToUndo": "没有可撤销的操作",
  "alreadyRolledBack": "已撤销",
  "splitCompleteWithAudio": "字幕和音频已切割完成",
  "splitSuccess": "字幕已切割",
  "splitUndoHint": "按 Ctrl+Z 可撤销",
  "undo": "撤销",
  "splitNeedVoice": "字幕已切割，请重新生成语音",
  "noOperationHistory": "暂无操作记录",
  "splitTooltip": "切割字幕 (S) · 撤销 Ctrl+Z"
}
```

---

## 八、风险与注意事项

### 8.1 音频切割耗时

音频切割涉及 R2 下载 → ffmpeg 处理 → R2 上传，可能耗时 2-5 秒。

**缓解措施：**
- 切割 API 的 `maxDuration` 已设置为 300s，足够
- 前端在切割期间显示 loading 状态
- 可考虑并行执行 translate 和 source 的音频切割

### 8.2 操作日志存储

每次操作存储完整的字幕数组快照，对于长字幕可能较大（几百 KB ~ 几 MB）。

**缓解措施：**
- PostgreSQL JSONB 可高效存储
- 可设置操作日志保留策略（如只保留最近 20 次）
- 可考虑将快照数据压缩后存储

### 8.3 回滚的边界情况

- 回滚后，在该操作之后对子段的修改（如重翻译、生成语音、手动编辑）会丢失
- 需要在回滚确认时明确提示用户
- MVP 阶段只支持栈式回滚（只回滚最近一次）

### 8.4 并发安全

- 操作日志写入和字幕更新已放入同一事务（`replaceSubtitleDataAndLogTx`）
- 回滚操作需要加锁防止并发回滚

### 8.5 Python 服务依赖

- 音频切割依赖 Python 服务，需要协调开发节奏
- 可先用 feature flag 控制是否启用音频切割
- 音频切割失败不阻塞字幕切割（降级策略）

### 8.6 已识别并修正的风险点

| # | 风险 | 严重度 | 修正方案 |
|---|------|--------|----------|
| 1 | 源语音切割输出到 `adj_audio_time/` 但前端从 `split_audio/audio/` 读取，路径不一致 | 严重 | 源语音输出路径改为 `split_audio/audio/{id}.wav` |
| 2 | `insertEditOperation` 与 `replaceSubtitleDataPairByTaskIdTx` 不在同一事务 | 严重 | 新增 `replaceSubtitleDataAndLogTx()` 合并为一个事务 |
| 3 | 父段 `vap_voice_status` 为 `missing`/`failed` 时无音频可切割，Python 会下载失败 | 中等 | 切割前检查父段状态，不满足条件则跳过音频切割 |
| 4 | Python `AudioSplitRequest` 缺少 `user_id`，无法构造 R2 presigned URL | 中等 | 请求体补充 `user_id` 字段 |
| 5 | 音频切割成功后 `vap_tts_updated_at_ms` 未设置，前端无法 cache bust | 低 | `makeTranslateChild` 中音频切割成功时设置 `vap_tts_updated_at_ms: nowMs` |
| 6 | API 路由代码用事后 `applyAudioSplit` vs 纯函数注入两种方式不一致 | 低 | 统一为纯函数注入方式，音频切割在 `splitSubtitlePayload` 调用前完成 |
| 7 | API 路由代码引用 `translateIds`/`sourceIds` 但这些变量在 `splitSubtitlePayload` 内部才计算 | 严重 | 提前调用 `buildSplitChildIds()` 预计算子段 ID |
| 8 | `replaceSubtitleDataAndLogTx` 跨两张表，归属不清 | 低 | 定义在 `vt_edit_operation.ts` 中，因为操作日志是事务的发起方 |
| 9 | 回滚确认弹窗缺少"后续修改丢失"警告 | 中等 | 弹窗明确提示"切割后对子段的所有修改都会丢失" |

---

## 九、实施优先级

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| **P0** | Task 1: 数据库 Schema + Model | 2h |
| **P0** | Task 4: 切割 API 改造（操作日志部分） | 3h |
| **P1** | Task 5: 回滚 API | 3h |
| **P1** | Task 6: 操作历史查询 API | 1h |
| **P1** | Task 8: 前端操作历史面板 | 4h |
| **P2** | Task 2: Python 音频切割服务封装 | 2h |
| **P2** | Task 3: split.ts 纯函数改造 | 2h |
| **P2** | Task 7: 前端处理音频切割结果 | 2h |

**建议分两期交付：**
- **第一期（P0 + P1）**：操作日志 + 回滚能力，不改变现有切割行为，只增加快照和回滚
- **第二期（P2）**：音频同步切割，需要 Python 服务就绪后对接

---

Plan complete and saved to `docs/superpowers/plans/2026-03-15-split-subtitle-audio-and-operation-log.md`. Ready to execute?
