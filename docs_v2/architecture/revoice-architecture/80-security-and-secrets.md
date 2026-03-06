# 安全与密钥管理（Threat Model / Checklist）

本系统同时涉及：用户态 Web、内部回调、对象存储 presigned URL、GPU 推理服务。这里用“边界 + 最小权限”来描述安全面。


## 🎯 信任边界（从外到内）

1. **Browser（不可信）**
   - 只能通过 Next.js 同源 API 操作
   - 不能直连 Java internal / 不能持有内部 key
2. **Next.js Server（半可信：业务层）**
   - 负责用户鉴权、权限校验、数据库读写
   - 负责把“外部请求”转换成“内部安全请求”（加密/鉴权头/幂等 key）
3. **Java video-tools（高可信：控制面）**
   - 掌握 R2 控制权（但仍应避免把永久凭证扩散到其它服务）
   - 维护 DB 真相源（vt_file_final 等）
4. **Python 数据面（高风险：重计算 + 可被滥用）**
   - 必须有严格的并发门禁/超时/鉴权
   - 不应具备 DB/R2 永久凭证，全部通过 Java internal + presigned URL


## 🔐 认证与鉴权机制（分通道）

### 1) 用户态（Next.js）

- better-auth session cookie：`getUserInfo()` 获取登录用户
- RBAC：`hasPermission()`（管理员访问、跨用户资源访问）

原则：
- 所有 `src/app/api/**` 必须校验用户身份与资源归属（owner/admin）

### 2) Next.js ↔ Java（加密网关）

用途：
- 防止 Java `/api/nextjs/**` 被非授权客户端直接调用（或被随意重放）

机制：
- Next.js 发送 `Content-Type: text/plain` 的密文请求体
- Java `EncryptionFilter` 解密得到 JSON
- 密钥：`ENCRYPTION_SECRET`（双方一致）
- 防重放：密文中包含 `time`（秒），Java 侧校验“请求未过期”（默认 5 分钟窗口）
- 完整性校验：MD5 hash（检测篡改）

风险提示：
- AES-ECB 不提供随机 IV，理论上对结构化明文不够理想；但这里主要目标是“接口门禁/防随意调用”，而非对抗强对手的语义安全。
- 若未来安全等级要求更高，建议升级为 AES-GCM（带随机 nonce + AEAD）并保留时间窗。

### 3) Python → Java internal（回调与 presigned）

用途：
- Python 获取 presigned URL（上传/下载）
- Python 回写 task progress / subtitles / finals

机制：
- Header `X-Internal-API-Key`
- Java `InternalApiKeyInterceptor` 校验

原则：
- internal key 必须作为 **密钥** 管理（环境变量/Secret Manager），禁止写进仓库
- internal API 默认只应开放给内网/受控网络（如 Render 私网、VPC、或严格的防火墙规则）

### 4) Modal 平台鉴权（Modal-Key/Modal-Secret）

用途：
- Java/Next.js 调用 Modal Web Endpoint（VAP Gateway / VAP Service / TTS 等）

机制：
- Header `Modal-Key` / `Modal-Secret`（由平台 proxy 验证）

原则：
- 该密钥具备“触发 GPU 成本”的能力，必须严格保护
- 结合上游幂等键 + 取消接口避免资源泄露

### 5) Python 内部依赖鉴权（非 Modal）

VAP/TTS/Speaker 在非 Modal 形态下通常启用应用层 API Key：
- `X-Internal-API-Key` 或 `Authorization: Bearer <token>`

原则：
- 只允许 VAP 调用 TTS/Speaker（减少攻击面）
- 不建议让 Java/Browser 直连这些服务


## 🪣 Presigned URL 的安全原则

- presigned URL = 临时能力票据（可被分享/泄露）  
  → 过期时间要尽量短，并限制在最小范围的 key 上
- 不在日志中输出完整 presigned URL（可能包含签名参数）
  - Java/Python 代码已尽量避免记录完整 URL，但新增日志时必须遵守
- 公桶直链产物要可控：
  - 通过 `publicSteps`（来自 DB）决定哪些 step 产物进公桶
  - `adj_audio_time_temp` 等“临时产物”建议配生命周期策略自动过期


## 🧯 滥用防护（成本与稳定性）

必须具备的防护面：

- 并发门禁（429）：
  - VAP：全局总闸 + 分组闸
  - TTS/Speaker：semaphore + queue timeout
- Deadline（408）：
  - `X-Request-Deadline-Ms`：caller 超时就不要继续跑重活
- 幂等键：
  - 任务级：`task_id`（job_id==task_id）
  - 编辑器局部 job：`Idempotency-Key`
- 取消能力：
  - Modal Job cancel：用户放弃时必须 cancel，避免 GPU 空跑


## 🧾 密钥清单（只列名称与用途）

建议统一放在 Secret Manager（平台变量/密钥服务），不要硬编码：

- Next.js：
  - `AUTH_SECRET`：会话密钥
  - `DATABASE_URL`：DB 连接
  - `ENCRYPTION_SECRET`：与 Java 加密网关共享密钥
  - `MODAL_KEY` / `MODAL_SECRET`：Modal 鉴权
- Java：
  - `DATABASE_*`
  - `R2_ACCESS_KEY` / `R2_SECRET_KEY`
  - `INTERNAL_API_KEY`
  - `ENCRYPTION_SECRET`
  - `PYTHON_MODAL_KEY` / `PYTHON_MODAL_SECRET`
  - `SILICONFLOW_TOKEN`
- VAP/TTS/Speaker：
  - `*_api_security.internal_api_key`（非 Modal）
  - `Modal-Key/Modal-Secret`（Modal）
  - `Bearer token`（RunPod）
  - 各模型/运行时路径（Volume）等

