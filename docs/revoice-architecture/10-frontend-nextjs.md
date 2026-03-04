# 子系统拆解：前端 + BFF（ReVoice-web-shipany-two）

## 🎯 子系统定位

该仓库不是“纯前端”，而是 **Next.js 全栈应用**：

- **Web UI**：用户上传视频、查看任务、编辑字幕、下载成品
- **BFF（后端即前端）**：通过 `src/app/api/**` 提供同源 API，统一鉴权、封装 Java/Python 调用
- **业务读写 DB**：使用 Drizzle 直接操作 Postgres（任务/字幕/积分/订阅等），对 Java/Python 起到“业务面”的补充


## 🧱 技术栈与运行方式

- 框架：Next.js（App Router）+ React + TypeScript  
  - 入口：`src/app/*`
  - i18n：`next-intl`（强制 `/{locale}` 前缀）
- 样式/UI：TailwindCSS + shadcn/ui（Radix）
- Auth：better-auth（服务端 `getUserInfo()` 从 session cookie 获取用户）
- DB：Drizzle ORM（`src/config/db/schema.ts` + `src/shared/models/*`）
- 常用命令：`pnpm dev` / `pnpm build` / `pnpm start`（以 `package.json` 为准）


## 🗂️ 目录结构（按“职责”理解）

- `src/app/`：路由（页面 + API Route Handlers）
  - `src/app/[locale]/...`：前台与 dashboard 页面
  - `src/app/api/**/route.ts`：BFF API（只在服务端运行）
- `src/shared/`：跨页面复用的业务层
  - `src/shared/models/*`：Drizzle 数据访问层（读写 vt_*、credit、subscription…）
  - `src/shared/services/*`：对外部系统的调用封装（Java/Python）
  - `src/shared/lib/*`：响应壳、加密工具等
- `src/core/`：auth、rbac、i18n、theme 等基础设施
- `src/extensions/`：支付等可插拔能力（Stripe 等）


## 🔁 核心业务流程

### 1) 上传原视频（Multipart → R2）

总体路径：**Browser → Next.js（JSON 网关）→ Java（加密 text/plain）→ R2 presigned → Browser 直传 R2**

- Next.js API（网关）：
  - `src/app/api/storage/multipart/initiate/route.ts`
  - `src/app/api/storage/multipart/presign-part/route.ts`
  - `src/app/api/storage/multipart/complete/route.ts`
- Java 调用封装（加密请求体）：
  - `src/shared/services/javaR2Multipart.ts`
  - 加密实现：`src/shared/lib/EncryptionUtil.ts`

关键点：
- Browser 实际上传是 **直传 R2**（使用 presigned URL），Next.js/Java 不搬运大文件
- `key` 需要满足“用户隔离”的路径约束（见 `src/shared/lib/multipart-upload-contract.ts`）


### 2) 创建翻译任务（写 DB + 扣积分）

入口：`POST /api/video-task/create`  
实现：`src/app/api/video-task/create/route.ts`

核心动作：
- 校验登录态（`getUserInfo()`）
- 计算消耗积分（按视频时长 + `vt_system_config.credit.points_per_minute`）
- 写入：
  - `vt_file_original`（原始文件记录）
  - `vt_task_main`（任务主表，初始 `pending`）
- 计费：`consumeCredits()`（同时支持订阅/活动 entitlement）

调度优先级：
- 有订阅/活动 entitlement → 更高优先级（更小的 priority 数值）


### 3) 轮询任务进度（DB + 可选转发 Java）

入口：`GET /api/video-task/getTaskProgress`  
实现：`src/app/api/video-task/getTaskProgress/route.ts`

- 基础信息：直接读 DB（`findVtTaskMainProgressById`）
- `progress=true` 时：转发 Java 的缓存聚合状态（`/video/api/nextjs/tasks/status`）
  - Java 侧会把 steps 做缓存以降低 DB 压力（processing 30s，终态 1h）


### 4) 下载成品（严格走 DB 的“就绪清单”）

入口：`GET /api/video-task/download-video`  
实现：`src/app/api/video-task/download-video/route.ts`

关键约束：
- 前端不探测 R2 对象存在性；只信 DB `vt_file_final`
- 下载签名统一由 Java 生成（`/video/api/nextjs/presigned-urls`）


### 5) 字幕编辑闭环（单段重生成 → 合成视频）

入口 1：单句字幕翻译 / 单段音频重生成  
实现：`src/app/api/video-task/generate-subtitle-voice/route.ts`

- `type=gen_srt`：调用 Java 单句翻译（SiliconFlow），把译文写入字幕草稿字段
  - Java：`/video/api/nextjs/subtitle/single/translate`（加密）
- `type=translate_srt`：调用 TTS 服务同步接口生成单段音频，并上传到 `adj_audio_time_temp`
  - 默认调用 `TTS_SERVER_BASE_URL`，未配置则回退 `PYTHON_SERVER_BASE_URL`（兼容旧环境）

入口 2：合成新视频（编辑器点击“合成”）  
实现：`src/app/api/video-task/generate-video/route.ts`

- 优先走 job 化接口避免超时：`/api/internal/audios/video/merge/jobs`
- Next.js 会把 job 元信息写入 `vt_task_main.metadata.videoMerge`，保证刷新可恢复


## 🧪 对外 API 清单（Next.js Route Handlers）

按功能分组（只列“视频翻译”核心链路）：

- 上传/存储：
  - `/api/storage/multipart/*`（initiate/presign-part/complete/abort/list-parts）
  - `/api/storage/stream`（Range 代理，按 owner/admin 校验）
- 视频任务：
  - `/api/video-task/create`（创建任务/扣积分）
  - `/api/video-task/list`、`/api/video-task/detail`
  - `/api/video-task/getTaskProgress`
  - `/api/video-task/download-video`、`/api/video-task/download-one-srt` 等
  - `/api/video-task/generate-subtitle-voice`（单段重生成）
  - `/api/video-task/generate-video`（合成最终视频）

建议以目录为准：`src/app/api/video-task/*`、`src/app/api/storage/*`


## 🗃️ 数据模型（DB 直连）

与视频翻译核心链路强相关的表（以 `src/shared/models/*` 为准）：

- `vt_file_original`：原视频元数据（userId、r2Key、duration、checksum…）
- `vt_task_main`：任务主表（status、priority、语言、creditsConsumed…）
- `vt_task_steps`：步骤进度（主要由 Java 回调写入）
- `vt_task_subtitle`：字幕数据（原字幕/翻译字幕/草稿字段）
- `vt_file_final`：成品就绪清单（DB 真相源，用于下载/展示）
- `vt_system_config`：运行时配置（积分单价、R2 base url、调度/并发…）
- `credit` / `subscription` / `order` 等：计费与订阅体系（与任务创建/退款相关）


## 🔌 与 Java/Python 的集成

### Java（video-tools）

- Base URL：`JAVA_SERVER_BASE_URL`（默认 `http://localhost:8080`）
- 加密通道：
  - Next.js 发 `Content-Type: text/plain` 的密文请求体
  - Java 侧 `EncryptionFilter` 解密得到 JSON
  - 加密密钥：`ENCRYPTION_SECRET`（必须一致）
- 典型调用：
  - presigned：`src/shared/services/javaService.ts#getPreSignedUrl`
  - multipart：`src/shared/services/javaR2Multipart.ts`
  - 单句翻译：`src/shared/services/javaService.ts#javaSubtitleSingleTranslate`

### Python（VAP/TTS）

- Base URL：`PYTHON_SERVER_BASE_URL`（通常指向 VAP Service；长任务由 Java 调用 VAP Gateway）
- 鉴权头：
  - Modal：`Modal-Key` / `Modal-Secret`
  - 非 Modal：`X-Internal-API-Key`（兼容）
  - 组装函数：`src/shared/services/pythonAuth.ts#buildPythonAuthHeaders`
- 典型调用封装：`src/shared/services/pythonService.ts`


## ⚙️ 配置与环境变量（前端侧）

关键环境变量（不写具体值，只列用途）：

- `DATABASE_URL`：Postgres 连接串（Drizzle）
- `AUTH_SECRET`：better-auth 会话密钥
- `JAVA_SERVER_BASE_URL`：Java 服务地址
- `ENCRYPTION_SECRET`：与 Java 的加密请求共享密钥
- `PYTHON_SERVER_BASE_URL`：Python VAP Service 地址
- `TTS_SERVER_BASE_URL`：字幕片段重生成优先调用的 TTS 服务地址
- `MODAL_KEY` / `MODAL_SECRET`：Modal Web Endpoint 鉴权

参考：`.env.example`、`src/shared/cache/system-config.ts`


## 🚀 部署要点（与系统架构强相关）

- Vercel：见 `vercel.json`（函数超时/内存）
- Cloudflare（OpenNext）：见 `wrangler.toml.example` + `cf:*` scripts
- Docker：仓库含 `Dockerfile`，但需要核对 Next build 输出目录与 Docker copy 策略是否一致（避免容器启动失败）

