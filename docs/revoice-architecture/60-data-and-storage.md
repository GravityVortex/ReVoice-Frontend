# 数据与存储契约（DB + R2）

这份文档是整套系统的“硬约定”：**只要 DB 表语义与 R2 路径规范不变，各服务可独立演进**。


## 🎯 三个核心标识（贯穿全系统）

- `userId`：租户边界（所有 R2 key/DB 记录均应可追溯到 user）
- `originalFileId`：原视频文件实体（file-scope 资产复用的锚点）
- `taskId`：一次翻译任务实体（task-scope 资产独占的锚点；Modal Job 下 `job_id == taskId`）


## 🗃️ DB 表职责（按链路归类）

> 表名以代码为准：Next.js 在 `src/shared/models/*`，Java 在 `src/main/java/.../entity/*`。

### 1) 原文件与任务主表

- `vt_file_original`
  - 含义：原视频元信息（文件名、大小、MIME、duration、checksum、R2 key/bucket、上传状态）
  - 主要写入方：Next.js（创建任务前后）
  - 主要读取方：Java（调度时生成原视频下载 URL）

- `vt_task_main`
  - 含义：任务主表（status、priority、source/target language、speakerCount、creditsConsumed…）
  - 主要写入方：
    - Next.js：创建任务（`pending`）
    - Java：回调更新进度/终态（`processing/completed/failed`）
  - 重要字段：`metadata`（Next.js 在“合成视频”场景写入 `videoMerge` 状态用于刷新恢复）

### 2) 步骤进度与日志

- `vt_task_steps`
  - 含义：每个 step 的进度/时间/状态（由 Python 回调驱动）
  - 主要写入方：Java（`PUT /api/internal/tasks/{id}/progress`）

- `vt_task_log`（或等价命名）
  - 含义：任务日志（用于 UI 展示/排障）
  - 主要写入方：Java（同上）

### 3) 字幕数据

- `vt_task_subtitle`
  - 含义：字幕数据与编辑草稿（按 stepName 区分）
  - stepName 常见取值（前端实际使用）：
    - `gen_srt`：原字幕（ASR 产物）
    - `translate_srt`：翻译字幕（LLM 产物 + 编辑器草稿字段）
  - 数据来源：
    - Python：通过 Java internal presigned 接口的 `additionalData.subtitle_*` 或 progress 回调写入
    - Next.js：编辑器场景写草稿字段（如 `vap_draft_txt`、`vap_draft_audio_path`、rev_ms 等）

### 4) 文件追踪与“就绪清单”（前端下载依赖）

- `vt_file_task`
  - 含义：记录某个 step 预计会产出的文件（用于追踪上传状态）
  - 主要写入方：Java（当 Python 调 `POST /api/internal/presigned-urls` 且 `urlType=upload` 时创建 pending 记录）
  - 状态演进：`pending` → `uploaded`（step completed）/ `failed`（step failed）

- `vt_file_final`
  - 含义：成品就绪清单（**DB 真相源**）
  - 写入时机：Java 在某 step `completed` 时 upsert（必要时先 HEAD 校验对象存在）
  - 前端行为：只读该表决定“可下载内容”；禁止直接 probe R2
  - fileType 常见取值（见 Java `InternalApiController`）：
    - `video`：成品主文件（固定相对 key：`merge_audio_video/video/video_new.mp4`）
    - `preview`：预览（`preview/video/video_new_preview.mp4`）
    - `video_480p`：可选（存在才写入）
    - `nosound_480p`：可选 file-scope（存在才写入）

### 5) 运行时配置

- `vt_system_config`
  - 含义：运行时可调参数（R2 public base url、public steps、调度并发、积分单价等）
  - 读取方：Next.js / Java（均会做缓存）


## 🪣 R2 桶与路径规范

### 1) 环境前缀（env）

Java 侧会把所有 key 拼上环境前缀：

- task-scope 前缀：`{env}/{userId}/{taskId}/`
- file-scope 前缀：`{env}/{userId}/{originalFileId}/`

实现：`video-tools` 的 `R2Service.buildTaskPath()` / `buildFilePath()`

### 2) 公桶 vs 私桶（策略由 Java 决定）

- Java 使用 `selectBucket(stepName)` 决定写入公桶/私桶
- public steps 列表来自 DB 配置（`vt_system_config`），因此可在不发版的情况下调整“哪些 step 产物可直链访问”
- 公桶直链 URL：
  - `r2.public.base_url` 优先从 DB 读取，未配置再使用环境变量（`CloudflareR2Config.publicBaseUrl`）

### 3) R2 相对 key（与流水线 step 强绑定）

VAP 配置 `store_path.remote_path` 定义了关键相对路径（**所有服务必须一致**），常见包括：

- 原视频/无声视频/音轨：
  - `original/video/video_original.mp4`
  - `original/video/video_original_480p.mp4`（file-scope 复用）
  - `split_audio_video/video/video_nosound.mp4`
  - `split_audio_video/video/video_nosound_480p.mp4`（file-scope 复用）
  - `split_audio_video/audio/audio_original.wav`
- 人声/背景：
  - `split_vocal_bkground/audio/audio_vocal.wav`
  - `split_vocal_bkground/audio/audio_bkground.wav`
- 字幕：
  - `gen_srt/subtitle_original.srt`
  - `translate_srt/subtitle_translate.srt`
  - `translate_srt/subtitle_bilingual.srt`（可选）
- 音频切片与 TTS：
  - `split_audio/audio/*`（按字幕切片）
  - `tts/*`（批量 TTS 输出目录）
  - `adj_audio_time/*`（对齐输出）
  - `adj_audio_time_temp/*`（编辑器“单段重生成”暂存区，常为公桶）
- 合成结果：
  - `merge_audios/audio/audio_new.wav`
  - `merge_audio_video/video/video_new.mp4`
  - `merge_audio_video/video/video_new_480p.mp4`（可选）
  - `preview/video/video_new_preview.mp4`
  - `frame_img/image/video_new_frame_img.jpg`

建议把该列表视为“协议”：修改任何一项都应同步更新 Java internal 常量与前端下载逻辑。


## 🔁 file-scope vs task-scope（复用策略）

用于降低成本/避免重复生成：

- **task-scope**（每个任务独立）：
  - 翻译字幕、TTS 结果、合成视频等与目标语言/说话人设置强相关的产物
- **file-scope**（同一原视频可复用）：
  - `video_original_480p`、`video_nosound_480p` 等只与原视频相关的转码产物

VAP 在转码前可调用 Java internal `r2/exists` 做存在性判断，避免重复跑 480p 资产。


## ✅ 最重要的系统约束（避免线上雪崩）

- 前端禁止通过 HEAD/Range GET 频繁探测 R2 对象存在性  
  → 必须以 `vt_file_final` 为准（Java 回调时写入）
- 任何服务都不应保存/传播 R2 永久凭证  
  → 统一由 Java 生成 presigned URL，Python 用 presigned 读写
- `task_id` 必须安全可控（禁止包含 path 分隔符、`..` 等）  
  → VAP request model 有校验；调用方应遵守

