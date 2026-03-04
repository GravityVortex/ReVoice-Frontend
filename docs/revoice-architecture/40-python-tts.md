# 子系统拆解：Python TTS 服务（ReVoice-tts）

## 🎯 子系统定位

TTS 服务提供“把文字合成为目标音色语音”的能力，覆盖三类场景：

1. **端到端流水线批量 TTS**：VAP 在视频翻译过程中批量生成每个字幕片段音频
2. **单条推理**：上传参考音频 + 文本，立即返回生成 wav（用于调试/能力验证）
3. **字幕片段重生成闭环（编辑器场景）**：从 R2 下载单段 reference wav → TTS → 时长对齐 → 上传到 `adj_audio_time_temp` 并返回元信息

该服务是 GPU 重计算系统，包含针对 Modal/RunPod 冷启动、Volume 同步、并发门禁的工程化处理。


## 🚀 启动入口与应用装配

- 入口：`run_server.py`
  - `DEPLOYMENT_ENV=production`：端口 80，并校验 tmp/models 目录必须为 Linux 绝对路径
  - 否则默认端口 9003（可用 `PORT` 覆盖）
  - 启动前 `init_tts_model()` 预加载模型
- ASGI App：`custom_app.py`
  - health：`GET /ping`、`GET /health`
  - 挂载业务 router：`infer_by_indextts2_api.py`（prefix `/api`）
  - 可选中间件：`auth.py#APIKeyAuthMiddleware`（非 Modal 更常用）
- Modal：`modal_app.py`
  - `TTSService`：Web Endpoint（ASGI）
  - `TTSBatchWorker`：批处理 worker（供 VAP spawn）
  - warmup/探活 + Volume `reload/commit` 支持


## 🧩 对外 API（核心）

### 健康检查

- `GET /ping` → `{"status":"healthy","service":"revoice-tts"}`
- `GET /health` → 返回 `tts_runtime.ready/phase/reason` 等（Modal 下可作为自愈触发器）

位置：`custom_app.py`

### 1) 单条推理（上传音频 + 文本 → 返回 wav）

- `POST /api/infer`
  - 请求：`multipart/form-data`
    - `audio`：参考音频文件
    - `text`：目标文本
    - `name`：可选输出文件名前缀
  - 响应：`audio/wav` 流（`StreamingResponse`），Header `X-Trace-ID`
  - 超时保护：支持 `X-Request-Deadline-Ms`

实现：`infer_by_indextts2_api.py`（`@router.post("/infer")`）

### 2) 批处理（从约定目录读取 wav+txt → 输出到 tts/）

- `POST /api/infer/local`
  - 请求：JSON
    - `task_id`
    - `sub_dir_name`
  - 行为：
    - 输入目录：`{store_path.local_tmp_path}/{task_id}/{sub_dir_name}` 下扫描 `*.wav` + 同名 `.txt`
    - 输出目录：`{store_path.local_tmp_path}/{task_id}/tts/`
    - `_SUCCESS` marker：幂等完成标记
    - Modal 下会对 Volume 做 `reload/commit`，并对同 task_id 加 scope lock

实现：`infer_by_indextts2_api.py`（`@router.post("/infer/local")`）

### 3) 字幕片段重生成（编辑器闭环，sync）

> 这是系统里“用户编辑字幕 → 只重做某一段音频”的关键接口。

- `POST /api/internal/subtitles/translated/tts`
  - 请求：JSON
    - `task_id`
    - `subtitle_name`
    - `text`
  - 行为（闭环）：
    1. 调 Java internal 取 presigned URLs（下载 `split_audio/.../{subtitle_name}.wav`，上传到 `adj_audio_time_temp/...wav`）
    2. 下载 reference wav
    3. TTS 推理生成新音频
    4. 按 `subtitle_name` 解析的“目标时长”做 WSOLA/补静音对齐
    5. 上传对齐后的音频到 R2（通常 public bucket 的 `adj_audio_time_temp`）
    6. 返回 `path_name` + `duration` + 推理元信息（token/stop_reasons/trace_id…）
  - 返回：统一包一层 `{"code":200,"message":"Success","data":{...}}`
  - 超时/冷启动：
    - 支持 `X-Request-Deadline-Ms`
    - runtime 未 ready 时会做 deadline-aware gate wait，仍不就绪则 503 + `Retry-After`

实现：
- API：`infer_by_indextts2_api.py`（`@router.post("/internal/subtitles/translated/tts")`）
- 业务：`subtitles_translated_tts_service.py`
- Java presigned client：`task_scheduling_client.py` / `presigned_io.py`


## 🧠 模型与推理模块边界

- 模型实现层：`indextts/`（IndexTTS2 + vLLM AsyncLLM）
- vLLM 插件注册：`vllm_gpt2tts_plugin/`（`ModelRegistry.register_model(...)` + `patch_vllm.py`）
- 服务运行时与自愈：`infer_by_indextts2_service.py`
  - 负责：模型懒加载/重建、runtime 状态、冷启动 bootstrap、并发 slots 等
- 推理核心封装：`tts_infer_core.py`
  - 负责把内部异常映射为 429/503 等语义，供 API 层返回


## ⚙️ 配置与环境变量

主配置：`config.yaml` + `config_loader.py`

关键配置段：
- `store_path.local_tmp_path` / `local_tmp_update_path`
- `models.root_dir`（生产通常覆盖为 Volume 路径）
- `task_scheduling_remote`（Java internal base url + api_key + presigned_endpoint）
- `tts.max_concurrent_jobs`、`tts.segment_concurrency`、`tts.max_timeout`
- `api_security.internal_api_key`（非 Modal 形态启用应用层鉴权）

环境变量覆盖规则：
- `TTS_<SECTION>_<KEY>=...` 或 `TTS_<SECTION>=<JSON>`
- 常用：
  - `DEPLOYMENT_ENV`
  - `DEPLOYMENT_PLATFORM`
  - `PORT`
  - `TTS_MODELS_ROOT_DIR`
  - `TTS_STORE_PATH_LOCAL_TMP_PATH`、`TTS_STORE_PATH_LOCAL_TMP_UPDATE_PATH`
  - `TTS_SUBTTS_GATE_WAIT_TIMEOUT_S` / `TTS_SUBTTS_GATE_DEADLINE_RESERVE_S`（字幕重生成 gate）


## 🧯 并发、限流与可用性策略

- 容器级并发 slots：`tts.max_concurrent_jobs`
- 排队超时：到达上限后返回 429（避免 OOM/显存爆）
- 冷启动恢复：
  - `/health` 可输出 runtime 状态
  - Modal 下支持 warmup 作业（`custom_app.py` 内部 warmup endpoints）
- Volume 同步（Modal）：
  - `infer/local` 读写共享目录时会 `reload/commit`
  - 同 task_id scope lock 避免并发覆盖


## 🚀 部署形态

- RunPod：
  - `Dockerfile.runpod`（依赖在镜像内，模型建议挂载 `/runpod-volume/models/tts`）
  - `Dockerfile.serverless`（依赖/venv 在 Volume）
  - 文档：`docs/runpod/*`
- Modal：
  - `modal_app.py` + `deploy_modal.sh`
  - 文档：`docs/modal/*`
- 本地：`start_local.sh` / `check_and_start.sh`

