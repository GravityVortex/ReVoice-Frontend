# 部署与运维（Runbook）

本系统是“多运行时、多平台”的组合：Web（Next.js）+ 控制面（Java）+ GPU 数据面（Python）。本页只写与架构强相关的部署/运维要点。


## 🎯 部署矩阵（推荐组合）

- Web/UI：Next.js（Vercel 或 Cloudflare OpenNext）
- 控制面/调度：Java video-tools（Render 或 Docker/K8s）
- GPU 数据面：
  - Modal：VAPGateway/VAPWorker/VAPService + TTSService/TTSBatchWorker + SpeakerDiarization（推荐）
  - RunPod：各 Python 服务独立容器（调试/成本敏感）


## 🌐 端口与健康检查（必须对齐）

### Next.js

- 默认：3000
- Health：通常由平台托管（Next 自身无统一 health endpoint）

### Java video-tools

- 默认端口：`PORT`（未配置时 `18412`）
- context-path：`/video`
- 健康检查：`GET /video/api/health`

⚠️ 当前仓库内的 Docker/compose 需要对齐（否则容器不可用）：
- `Dockerfile` / `docker-compose.yml` 暴露 8080 且 healthcheck 访问 `http://localhost:8080/api/health`
- 但应用默认端口是 18412 且路径前缀包含 `/video`

运维建议（两选一，必须统一）：
- 方案 A：容器内设置 `PORT=8080`，并把 healthcheck 改为 `/video/api/health`
- 方案 B：保持 `PORT=18412`，并把暴露端口/映射/healthcheck 全部改为 18412 + `/video/api/health`

### Python VAP / TTS / Speaker（本地/RunPod）

默认本地端口（可被 `PORT` 覆盖）：

- VAP：9002（`ReVoice-v-a-processing/run_server.py`）
- TTS：9003（`ReVoice-tts/run_server.py`）
- Speaker diarization：9006（`ReVoice-speaker-reg/run_server.py`）

生产容器常用端口：80（`DEPLOYMENT_ENV=production`）

健康检查：
- `/ping`（轻量）
- `/health`（部分服务含 runtime 状态）


## 🔑 环境变量清单（按服务）

### Next.js（ReVoice-web-shipany-two）

必需：
- `DATABASE_URL`
- `AUTH_SECRET`
- `JAVA_SERVER_BASE_URL`
- `ENCRYPTION_SECRET`（与 Java 一致）
- `PYTHON_SERVER_BASE_URL`（通常指向 VAP Service）
- `MODAL_KEY` / `MODAL_SECRET`（Modal 形态）

可选：
- `TTS_SERVER_BASE_URL`（字幕片段重生成优先走 TTS）

### Java（video-tools）

必需：
- `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD`
- `R2_ENDPOINT` / `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_BUCKET_NAME`
- `INTERNAL_API_KEY`（Python 回调鉴权）
- `ENCRYPTION_SECRET`（与 Next.js 一致）
- `PYTHON_SERVICE_URL`（指向 VAP Gateway）
- `PYTHON_MODAL_KEY` / `PYTHON_MODAL_SECRET`

可选（常用）：
- `PORT`
- `R2_PUBLIC_BASE_URL`（也可由 DB `vt_system_config` 覆盖）

### VAP（ReVoice-v-a-processing）

必需（生产）：
- `VAP_STORE_PATH_LOCAL_TMP_PATH`、`VAP_STORE_PATH_LOCAL_TMP_UPDATE_PATH`（Linux 绝对路径）
- `VAP_MODELS_ROOT_DIR`（挂载模型 volume）
- `task_scheduling_remote.url_prefix`（Java base url，含 `/video` 前缀差异）
- `task_scheduling_remote.api_key`（即 Java `INTERNAL_API_KEY`）
- `tts.*` / `gen_srt.*` / `siliconflow.*`（各依赖服务地址与 token）

关键开关：
- `DEPLOYMENT_ENV=production|local`
- `DEPLOYMENT_PLATFORM=modal|...`
- `VAP_PRELOAD_MODELS=1`

### TTS（ReVoice-tts）

必需（生产）：
- `TTS_STORE_PATH_LOCAL_TMP_PATH`、`TTS_STORE_PATH_LOCAL_TMP_UPDATE_PATH`
- `TTS_MODELS_ROOT_DIR`
- `task_scheduling_remote.url_prefix` + `api_key`（用于 presigned）

可选：
- `tts.max_concurrent_jobs` / `segment_concurrency`

### Speaker（ReVoice-speaker-reg）

必需（生产）：
- `MODELSCOPE_CACHE`（模型目录）

可选：
- `api_args.max_concurrent_jobs` / `max_timeout`


## 📈 并发与限流（容量规划）

容量由三层共同决定（建议只调“最上层”直到瓶颈清晰）：

1. Java 调度：
   - `vt_system_config.max_concurrent_tasks`（全局 running 上限）
   - per-user concurrency（付费/免费）
2. VAP：
   - `video_translate.max_total_concurrent_jobs`
   - `video_translate.max_translate_concurrent_jobs`
   - `video_translate.max_tts_concurrent_jobs`
3. TTS / Speaker：
   - `tts.max_concurrent_jobs`、`api_args.max_concurrent_jobs`

常见症状与调参方向：
- 频繁 429：先增大 VAP/TTS 的并发门禁，或降低 Java 的 submit 速度
- 显存 OOM：降低 TTS 并发 slots；必要时拆分更多实例并在上游做负载均衡


## 🪵 日志与排障（最小闭环）

建议至少保留三类日志：

- Java：调度日志 + internal 回调日志（`InternalApiController`）+ R2 presign 失败
- VAP：每步开始/结束 + presigned 请求失败 + 429/503/deadline exceeded
- TTS/Speaker：runtime ready 状态 + 队列等待超时 + 推理耗时与错误栈

优先排障顺序：
1) Java 是否持续在 claim pending？  
2) Python submit 是否 202？（Modal job 是否入队）  
3) Python 是否在回写 progress？（Java internal 是否 200/503）  
4) `vt_file_final` 是否写入？（前端下载只看它）


## 🧹 数据清理与成本控制

- 临时目录：
  - VAP/TTS/Speaker 均会在本地/volume 产生 tmp
  - 生产建议配置定时清理（或在 pipeline 完成后清理）
- R2 公桶（音频切片）增长很快：
  - 建议用生命周期规则（或在 Java 完成合成后清理 `adj_audio_time_temp/` 等临时目录）
  - Java 已在特定 step（如 `merge_audio_video`）后做过一次“临时目录清理”的逻辑（以代码为准）

