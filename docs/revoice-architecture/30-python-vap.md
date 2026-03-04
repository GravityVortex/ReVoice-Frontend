# 子系统拆解：Python 视频编排服务（ReVoice-v-a-processing / VAP）

## 🎯 子系统定位

VAP（Video/Audio Processing）是整条“视频翻译”链路的 **编排与执行引擎**：

- 负责端到端流水线：下载原视频 → 音视频处理 → ASR → 翻译 → TTS → 对齐 → 合成视频 → 预览/封面
- 不直接持有 R2 永久凭证：所有对象读写通过 Java internal 拿 presigned URL
- 通过 Java internal 回写进度与终态：Java 落库并维护 `vt_file_final`（DB 真相源）

在 Modal 形态下，VAP 进一步拆分为：
- **VAPGateway**：对外 job 提交/查询/取消（Java 调度端调用）
- **VAPWorker**：GPU 执行流水线（真正跑重活）
- **VAPService**：仅暴露同步短接口（字幕翻译/字幕TTS/合成视频）+ job 化封装（供 Next.js 编辑器场景使用）


## 🚀 启动入口与应用装配

### RunPod/本地 FastAPI

- 启动入口：`run_server.py`
  - `DEPLOYMENT_ENV=production` → 端口 80，并强校验 models/tmp 目录
  - 否则默认端口 9002
- ASGI 应用：`custom_app.py`
  - health：`GET /ping`、`GET /health`
  - 挂载核心 router：`production/video_translate/video_translate_api.py`（`/api/internal/*`）
  - 初始化 HTTP clients（TTS/diarize/Java remote）与临时目录

### Modal

- 核心定义：`modal_app.py`
  - `class VAPGateway`：Job API（`/api/internal/video/translate/jobs` 等）
  - `class VAPWorker`：跑 `run_translate_video_job()` / `translate_video_pipeline()`（GPU）
  - `class VAPService`：同步短接口 web app（避免长任务 SSE 暴露在错误域名）
- VAPService Web App：`custom_service_app.py`
  - include `sync_router`（字幕翻译/字幕TTS/合成视频）
  - Modal 下额外提供 `.../jobs` 风格接口（spawn + status）


## 🧩 对外 API（按用途）

> 这里列的是 VAP 在系统中“被调用”的主要接口；调试用的分步骤接口见 `custom_main_service/*/*_api.py`。

### 1) 端到端视频翻译（慢任务）

- `POST /api/internal/video/translate`
  - Router：`production/video_translate/video_translate_api.py`（SSE 流式响应）
  - 特性：并发门禁（全局总闸 + translate 分组闸）、心跳保持连接

### 2) 同步短接口（编辑器/局部闭环）

来自同一 `sync_router`：

- `POST /api/internal/subtitle/single/translate`
- `POST /api/internal/subtitles/translated/tts`
- `POST /api/internal/audios/video/merge`

实现：`production/video_translate/video_translate_api.py`

⚠️ 说明：
- “字幕片段重生成（translated/tts）”在系统里 **优先走独立 TTS 服务**（Next.js 有 `TTS_SERVER_BASE_URL` 优先级）；VAP 保留此接口主要用于兼容/回滚。

### 3) Modal Job（供 Java 调度端）

在 Modal 形态下由 `modal_app.py` 暴露：

- `POST /api/internal/video/translate/jobs` → `202 {job_id==task_id}`
- `GET /api/internal/video/translate/jobs/{job_id}` → `{modal_status}`
- `POST /api/internal/video/translate/jobs/{job_id}/cancel`

关键语义：
- `task_id` 是幂等键；重复提交同一 `task_id` 不应重复跑重活（服务端会清理 terminal 记录后再入队）
- cancel 会尽力联动取消子任务（如 TTS/speaker job）

### 4) Modal Service 的 job 化短接口（供 Next.js）

由 `custom_service_app.py` 在 Modal 下提供：

- `/api/internal/subtitle/single/translate/jobs`（POST/GET）
- `/api/internal/subtitles/translated/tts/jobs`（POST/GET）
- `/api/internal/audios/video/merge/jobs`（POST/GET）

配套能力：
- Header `Idempotency-Key`：用于去重重试/保证刷新恢复


## 🔁 端到端流水线（translate_video_pipeline）

核心编排位置：
- `production/video_translate/video_translate_service.py`
  - `run_translate_video_job()`：任务入口（处理 Modal/日志/生命周期）
  - `translate_video_pipeline()`：全流程编排（按步骤推进 + 回写进度）

关键步骤（与 R2 step/key 强绑定，必须与 Java 约定一致）：

1. 原视频下载（url_download_video）
2. （可选）裁剪片头：`cut_video_head/*`
3. 音视频分离：`split_audio_video/*`
4. 人声/背景分离（Demucs）：`split_vocal_bkground/*`
5. 生成字幕（ASR：Whisper / SenseVoice + VAD）
6. 翻译字幕（SiliconFlow LLM）
7. 按字幕切分音频：`split_audio/*`
8. 批量 TTS：`tts/*`
9. 音频时长对齐（WSOLA / 补静音）：`adj_audio_time/*`
10. 合并人声音频：`merge_audios/*`
11. 合成视频：`merge_audio_video/*`（可选混入背景音）
12. 生成预览：`preview/*`
13. 抽帧封面：`frame_img/*`

各步骤实现模块（对应目录名）：
- `custom_main_service/split_audio_video/*`
- `custom_main_service/split_vol_bg/*`
- `custom_main_service/gen_srt/*`
- `custom_main_service/translate_srt/*`
- `custom_main_service/split_audio_by_subtitle/*`
- `custom_main_service/tts/*`
- `custom_main_service/adj_audio_time/*`
- `custom_main_service/merge_audios/*`
- `custom_main_service/merge_audio_and_video/*`
- `custom_main_service/get_frame_from_video/*`


## 🔌 依赖与调用方式

### 1) Java（任务调度/存储控制面）

VAP 通过 `TaskSchedulingRemoteClient` 调用 Java internal：

- presigned：`POST /video/api/internal/presigned-urls`
- 回写进度：`PUT /video/api/internal/tasks/{taskId}/progress`
- exists：`POST /video/api/internal/r2/exists`

实现：
- client：`clients/task_scheduling_client.py`
- 回写封装：`production/video_translate/log_sender.py`

鉴权：
- Header `X-Internal-API-Key`（值来自 VAP `task_scheduling_remote.api_key`）

### 2) TTS

- HTTP 调用封装：`clients/tts_client.py`
- 鉴权策略：
  - Modal：`Modal-Key/Modal-Secret`（平台代理鉴权）
  - 非 Modal：`Authorization: Bearer <token>`
- 特性：`follow_redirects=true` 兼容 Modal Web Endpoint 303 重定向

### 3) Speaker diarization

- HTTP 调用封装：`clients/diarize_client.py`
- 两种入口：
  - 上传文件接口：`/api/diarize`
  - volume/本地路径接口：`/api/diarize/local`（生产建议）

### 4) 翻译大模型（SiliconFlow）

- 配置：`config.yaml` 的 `siliconflow.*` + `translation.translator_type`
- client：`clients/siliconflow_client.py`


## 🗃️ 模型与本地资源

VAP 在流水线中硬依赖的模型文件（RunPod/生产一般挂载 Volume）：

- Whisper：`whisper/large-v3.pt`
- SenseVoice：`SenseVoiceSmall/`（包含 config/model.pt 等）
- VAD：`fsmn/speech_fsmn_vad_zh-cn-16k-common-pytorch/`
- Demucs：`demucs/htdemucs_ft/`

加载位置参考：
- `production/video_translate/video_translate_service.py`（`ModelManager`）
- `config.yaml: models.root_dir` + 环境变量覆盖（见下）


## ⚙️ 配置与环境变量

主配置文件：`config.yaml`

关键配置段（只列作用）：

- `api_security.internal_api_key`：应用层 API key（非 Modal 形态可启用）
- `task_scheduling_remote`：Java internal base url + internal api key + endpoints
- `tts`：TTS base url/token + timeout + modal key/secret
- `gen_srt`：diarize base url/token + timeout
- `siliconflow`：翻译模型配置
- `video_translate`：并发上限（total/translate/tts）与排队超时（429）
- `store_path`：本地临时目录 + R2 相对路径（remote_path）
- `models.root_dir`：模型根目录

环境变量覆盖规则：
- 代码：`config_loader.py` + `env_set.py`
- 规则：`VAP_<SECTION>_<KEY>=...` 或 `VAP_<SECTION>=<JSON>`
- 常用：
  - `DEPLOYMENT_ENV=production|local`
  - `DEPLOYMENT_PLATFORM=modal|...`
  - `PORT`
  - `VAP_MODELS_ROOT_DIR`（指向 Volume 的 models 根目录）
  - `VAP_PRELOAD_MODELS=1`（启动预加载，减少首请求抖动）


## 🧯 并发、超时与幂等（系统稳定性关键）

- 并发门禁：
  - `video_translate_api.py` 对“慢任务”采用 `_total_sem` + `_translate_sem`
  - 合成视频（merge）独立 `_merge_sem`，默认串行，避免合成把进程打爆
- 超时/Deadline：
  - Header `X-Request-Deadline-Ms` 被广泛使用（VAP/TTS/Speaker），用于避免 caller 已超时还继续跑重活
- 幂等：
  - `TranslateVideoRequest.task_id` 有严格校验（禁止 path traversal），见 `production/video_translate/video_translate_class.py`
  - Modal Job 形态下 `job_id == task_id`，允许“同 task_id 重试 submit”

