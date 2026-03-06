# 子系统拆解：Python 说话人分割服务（ReVoice-speaker-reg / Diarization）

## 🎯 子系统定位

该服务提供 **说话人分割（Diarization）** 能力：把一段音频切成多个时间片段，并为每个片段打上 speaker label（例如 `SPEAKER_00/01/...`）。

在端到端视频翻译流水线中，它主要用于：

- `gen_srt` 阶段：辅助生成“带说话人分轨”的字幕/时间轴（提升多说话人场景体验）

注意：
- 仓库名含 speaker-reg，但当前 HTTP API 侧的对外能力主要是 diarization；“说话人注册/embedding/相似度”更多在 `speakerlab/` 脚本/内部模块里使用，而非对外路由。


## 🚀 启动入口与应用装配

- 入口：`run_server.py`
  - `DEPLOYMENT_ENV=production`：端口 80，并强制要求 `MODELSCOPE_CACHE`（模型目录）
  - 否则默认端口 9006，并允许兜底 `MODELSCOPE_CACHE=my_models`
  - 启动时预加载 diarization 模型（降低首请求抖动）
- ASGI App：`custom_app.py`
  - health：`GET /ping`、`GET /health`
  - 挂载路由：`api.py`（`APIRouter(prefix="/api")`）
- Modal：`modal_app.py`（镜像/Volume/snapshot + ASGI 挂载）


## 🧩 对外 API（核心）

### 健康检查

- `GET /ping`
- `GET /health`

位置：`custom_app.py`

### 1) 上传音频（内存解析，强制 16kHz）

- `POST /api/diarize`
  - 请求：`multipart/form-data` 上传 `audio`
  - 行为：
    - `librosa.load(io.BytesIO(bytes), sr=16000, mono=True)`（一步完成解码/重采样/单声道）
    - 调 `mydemo.diarize_audio()` 执行分割
  - 返回：JSON（segments + speakers_count 等）
  - 超时保护：支持 `X-Request-Deadline-Ms`

实现：`api.py`（`@router.post("/diarize")`）

### 2) 本地/Volume 路径（生产建议）

- `POST /api/diarize/local`
  - 请求：JSON
    - `task_id`
    - `step`
    - `audio_vocal_filename_with_ext`
  - 行为：
    - 从 `store_path.local_tmp_path` 拼路径读取音频文件
    - 线程池执行推理（避免阻塞 event loop）
    - 用 `asyncio.Semaphore` 做并发门禁，并对“排队等待”做超时（429）
  - 超时保护：支持 `X-Request-Deadline-Ms`

实现：`api.py`（`@router.post("/diarize/local")`）


## 🧠 模型与处理模块边界（speakerlab）

- 业务胶水层：`mydemo.py`
  - 负责实例缓存、输入归一化、长音频分块、输出结构化
- 推理核心：`speakerlab/bin/infer_diarization1.py`
  - `Diarization3Dspeaker`：VAD → 特征提取 → speaker embedding → clustering → segments
  - VAD：`FunASRVADWrapper(funasr.AutoModel)`
  - 聚类：`CommonClustering(spectral)`
- ModelScope 兼容补丁：`modelscope_patch.py`
  - 重要：需要在导入 modelscope 前执行 patch（避免下载/缓存路径问题）


## ⚙️ 配置与环境变量

主配置：`config.yaml` + `config_loader.py`

关键配置段：
- `api_security.internal_api_key`：应用层 API key（非 Modal / 非 RunPod 平台时使用）
- `api_args.max_concurrent_jobs` / `max_timeout`：并发门禁与排队超时
- `store_path.local_tmp_path`：本地/volume 临时目录（`/api/diarize/local` 依赖）

环境变量覆盖规则：
- `SPEAKER_REG_<SECTION>_<KEY>=...` 或 `SPEAKER_REG_<SECTION>=<JSON>`
- 生产常用：
  - `DEPLOYMENT_ENV=production`
  - `MODELSCOPE_CACHE=/runpod-volume/models`（或其它绝对路径）


## 🚀 部署形态与注意事项

- RunPod：
  - `Dockerfile.runpod` / `Dockerfile.serverless`
  - 文档：`docs/runpod/*`、`docs/RUNPOD_ENV_GUIDE.md`
- Modal：
  - `modal_app.py` + `deploy_modal.sh`
  - 文档：`docs/modal/*`
- 本地：
  - 建议通过 `python run_server.py` 启动（会处理 MODELSCOPE_CACHE 与预加载）

⚠️ 工程一致性注意：
- 仓库内的 `Dockerfile`/`Dockerfile-guonei` 使用 `uvicorn api:app` 作为入口，但 `api.py` 里只有 `APIRouter`，并没有定义 `app`  
  - 实际可用入口是 `custom_app:app` 或 `run_server.py`（以仓库当前代码为准）

