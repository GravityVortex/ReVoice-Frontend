# 子系统拆解：Java 后端（video-tools）

## 🎯 子系统定位

Java 服务在整套系统中承担 **控制面 / 调度面 / 回调落库面** 三重角色：

- **R2 控制面**：统一生成 Cloudflare R2 预签名 URL、multipart 上传、文件移动/覆盖；避免任何服务持有 R2 永久凭证
- **任务调度**：从 DB claim `pending` 任务（`SKIP LOCKED`）并提交给 Python（Modal Job 形态）
- **Python 回调入口**：Python 通过内部 API 回写进度/日志/字幕/最终文件就绪清单（DB 真相源）

该服务不是“用户 UI”，但它是整条链路的 **关键枢纽**。


## 🧱 技术栈与启动入口

- Spring Boot（Maven 单模块）+ Java 17
- Web（MVC）+ WebClient（对 Python 的短请求）
- JPA（Hibernate）+ PostgreSQL（Supabase）
- Cache：Caffeine（任务状态缓存、系统配置缓存）
- 入口：`src/main/java/com/skytech/videotools/VideoToolsApplication.java`
- 路由前缀（重要）：`server.servlet.context-path=/video`（见 `src/main/resources/application.yml`）
  - 因此代码里所有 `/api/...` 实际对外路径为 `/video/api/...`


## 🧩 Controller 分组（对外契约）

### 1) Next.js 专用（加密网关）

前缀：`/video/api/nextjs/*`

- 批量预签名 URL：`POST /api/nextjs/presigned-urls`  
  - Controller：`src/main/java/com/skytech/videotools/controller/NextJsController.java`
- 任务状态查询（带缓存）：`POST /api/nextjs/tasks/status`
- 文件移动/覆盖：`/api/nextjs/move-file`、`/api/nextjs/overwrite-file`
- Multipart：`/api/nextjs/r2/multipart/*`  
  - Controller：`src/main/java/com/skytech/videotools/controller/NextJsMultipartController.java`
  - 由 `R2MultipartService` 完成 initiate/presign/complete/abort/listParts
- Next.js 单句字幕翻译：`POST /api/nextjs/subtitle/single/translate`  
  - Controller：`src/main/java/com/skytech/videotools/controller/NextJsSubtitleTranslateController.java`
  - 上游可传 `X-Request-Deadline-Ms`（epoch-ms）做软超时保护

加密机制：
- Next.js 以 `Content-Type: text/plain` 发送密文
- Java 侧由 `EncryptionFilter` 统一解密为 JSON，再进入 Controller
  - `src/main/java/com/skytech/videotools/config/EncryptionFilter.java`


### 2) Python 内部回调（必须带内部 Key）

前缀：`/video/api/internal/*`

入口：`src/main/java/com/skytech/videotools/controller/InternalApiController.java`

关键接口：
- `POST /api/internal/presigned-urls`：Python 获取上传/下载 presigned URLs（副作用：写 `vt_file_task`）
- `PUT /api/internal/tasks/{taskId}/progress`：Python 回写进度/步骤/日志（副作用：写 steps/log/subtitle/finals）
- `POST /api/internal/r2/exists`：供 Python 做 file-scope 资产存在性判断（避免重复生成 480p 等）

鉴权：
- Header `X-Internal-API-Key`
- 拦截器：`src/main/java/com/skytech/videotools/config/InternalApiKeyInterceptor.java`
- 开关：`internal.api.auth-enabled`（默认 true）

重要不变量：
- **DB 为真相源**：`vt_file_final` 仅在“步骤 completed”且必要对象确实存在后写入，避免前端探测 R2
- file-scope vs task-scope：`r2/exists` 支持 `scope=file|task`


### 3) 其它公开 API（非 Next.js 专用）

- 任务状态查询：`POST /video/api/tasks/status`  
  - `src/main/java/com/skytech/videotools/controller/TaskController.java`
- 健康检查：`GET /video/api/health`（用于 Render/容器 healthcheck）  
  - `src/main/java/com/skytech/videotools/controller/HealthController.java`
- 公开配置：`ConfigController`、缓存监控：`CacheMonitorController`


## 🧠 调度系统（Java → Python）

核心类：`src/main/java/com/skytech/videotools/scheduler/VideoTaskScheduler.java`

总体策略（KISS + 可调）：

- “全局并发上限”：`vt_system_config.max_concurrent_tasks`（默认 5）
- “按用户并发上限”：付费与免费分开（system config keys：`schedule.user_concurrency_limit.*`）
- 选取策略：WRR（paid/free pattern）+ aging（免费任务超时强制 pick）
- claim 方式：DB `FOR UPDATE SKIP LOCKED`（避免多实例抢同一任务）
- 提交方式：短请求提交到 Python（不轮询），后续完全依赖 Python 回调

提交 Python 的客户端：
- `src/main/java/com/skytech/videotools/client/PythonServiceClient.java`
  - 调用路径：`POST /api/internal/video/translate/jobs`
  - Header：`Modal-Key`、`Modal-Secret`、`X-Request-Deadline-Ms`
  - 超时：提交请求本身 30s（避免卡住调度线程）


## 🗃️ 数据与中间件

### 1) PostgreSQL（Supabase）

- Spring 数据源配置：`src/main/resources/application.yml`（`DATABASE_URL/USERNAME/PASSWORD`）
- 业务表（核心链路）：`vt_task_main`、`vt_task_steps`、`vt_file_original`、`vt_file_task`、`vt_file_final`、`vt_task_subtitle`、`vt_task_log`、`vt_system_config` 等
- claim/调度涉及：`TaskClaimService`（基于 SQL/锁），见 `src/main/java/com/skytech/videotools/service/TaskClaimService.java`

### 2) Cloudflare R2（S3 兼容）

- AWS SDK v2 + SigV4 presign
- 配置：`src/main/java/com/skytech/videotools/config/CloudflareR2Config.java`
- 服务：
  - `R2Service`：选择桶、生成 upload/download/public URL、存在性判断、移动/覆盖
  - `R2MultipartService`：multipart 流程（init/presign/complete/abort/listParts）

### 3) 缓存（Caffeine）

- `TaskService.getTaskStatus()` 使用缓存降低“高频轮询”压力
- `SystemConfigService` 通常会缓存 `vt_system_config` 的值以减少 DB 读


## ⚙️ 配置来源与优先级

1. `src/main/resources/application.yml`（默认值）
2. 环境变量（Render/Docker/K8s 注入）
3. DB `vt_system_config`（运行时开关、调度并发、公开桶规则等）

关键环境变量（按 `application.yml` 映射）：

- DB：`DATABASE_URL`、`DATABASE_USERNAME`、`DATABASE_PASSWORD`
- R2：`R2_ENDPOINT`、`R2_ACCESS_KEY`、`R2_SECRET_KEY`、`R2_BUCKET_NAME`、`R2_PUBLIC_BUCKET_NAME`、`R2_PUBLIC_BASE_URL`…
- Python：`PYTHON_SERVICE_URL`、`PYTHON_MODAL_KEY`、`PYTHON_MODAL_SECRET`
- 内部回调：`INTERNAL_API_KEY`
- 加密：`ENCRYPTION_SECRET`、`ENCRYPTION_ENABLED`
- 端口：`PORT`（默认 18412）


## 🚀 部署形态与健康检查

### Render

- 配置：`render.yaml`（healthCheckPath 已使用 `/video/api/health`）

### Docker / docker-compose

- Dockerfile：`Dockerfile`
- compose：`docker-compose.yml`

⚠️ 需要注意的“工程一致性问题”（建议尽快对齐）：
- `application.yml` 默认端口是 `18412`，但 `Dockerfile`/`docker-compose.yml` 按 `8080` 暴露并做 healthcheck  
  - 若容器内不设置 `PORT=8080`，会出现“容器对外不可用/健康检查失败”
- `Dockerfile`/`docker-compose.yml` 的 healthcheck 是 `/api/health`，但服务实际前缀是 `/video`  
  - 正确应为 `/video/api/health`

以上属于“部署契约”，建议在运维文档中固定下来并统一（见 `70-deployment-and-ops.md`）。

