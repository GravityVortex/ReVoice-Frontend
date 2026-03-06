# 配置体系（env / config 表 / vt_system_config）

> 最后校验：2026-03-04  
> 目标：让你知道“一个开关/密钥/价格/地址到底应该去哪改”。

---

## 1) 三层配置的职责边界

1) **环境变量（env）**：决定运行时依赖与安全边界（DB、Java/Python 地址、加密密钥等）  
2) **`config` 表**：后台可编辑的业务配置（支付/OAuth/默认 provider/功能开关）  
3) **`vt_system_config` 表**：视频链路运行参数（积分单价、R2 base url、bucket 名等）

如果需求里包含“运营可调”“无需发版”，优先考虑放到 `config` 或 `vt_system_config`。

---

## 2) 环境变量（env）清单（以代码检索结果为准）

来源：

- `src/config/index.ts`
- `src/shared/cache/system-config.ts`
- `src/extensions/storage/privateR2Util.ts`
- `next.config.mjs`

### 2.1 应用基础

- `NEXT_PUBLIC_APP_URL`：站点对外 URL（影响 canonical、OAuth 回调等）
- `NEXT_PUBLIC_APP_NAME`：站点名称
- `NEXT_PUBLIC_THEME` / `NEXT_PUBLIC_APPEARANCE`：主题相关
- `NEXT_PUBLIC_DEFAULT_LOCALE`：默认语言（默认 `en`）
- `NEXT_PUBLIC_DEBUG`：debug 开关（部分日志/行为可能依赖）

### 2.2 DB（必须）

- `DATABASE_URL`：Postgres 连接串（必填）
- `DATABASE_PROVIDER`：默认 `postgresql`
- `DB_SINGLETON_ENABLED`：连接复用开关（默认 `true`）

### 2.3 Auth（必须）

- `AUTH_SECRET`：better-auth session 密钥
- `AUTH_URL`：auth base url（若未设，会回退 `NEXT_PUBLIC_APP_URL`）

### 2.4 Java / Python（视频链路常用）

- `JAVA_SERVER_BASE_URL`：Java 服务 base url（默认 `http://localhost:8080`）
- `ENCRYPTION_SECRET`：与 Java 加密通道共享密钥（必须一致）
- `JAVA_EMAIL_URL` / `SECRET_EMAIL`：邮件相关（如有使用）

- `PYTHON_SERVER_BASE_URL`：Python VAP Service base url（按运行形态）
- `MODAL_KEY` / `MODAL_SECRET`：Modal 形态鉴权
- `PYTHON_SECRET`：已标注废弃（保留兼容）

- `TTS_SERVER_BASE_URL`：字幕片段重生成优先调用的 TTS 服务地址（可选）
- `TTS_KEEPALIVE_DEDUP_WINDOW_MS`：TTS keepalive 去重窗口（可选）

### 2.5 R2（仅当 Web 侧需要直接操作私桶时）

> 注意：视频链路的“上传/下载签名”通常走 Java 控制面；但仓库内仍有直接操作私桶的工具。

- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

### 2.6 其它

- `ENV`：业务自定义环境（常用于 R2 key 前缀 dev/pro）
- `ANALYZE`：bundle analyzer
- `VERCEL` / `NEXT_DIST_DIR`：构建输出与平台差异

---

## 3) `config` 表（后台可编辑：支付/OAuth/开关）

单一来源（字段枚举与分组）：`src/shared/services/settings.ts`

特点：

- 适合放：支付 provider key、OAuth client id/secret、是否启用某功能等
- 推荐改法：用管理后台页面修改（避免直接写 DB）

常见键名示例（不完整，按 `settings.ts` 为准）：

- 支付（Stripe/PayPal/Creem）：
  - `stripe_enabled`
  - `stripe_publishable_key`
  - `stripe_secret_key`
  - `stripe_signing_secret`
  - `paypal_enabled`
  - `creem_enabled`
  - `default_payment_provider`
- OAuth：
  - `google_client_id` / `google_client_secret`
  - `github_client_id` / `github_client_secret`

---

## 4) `vt_system_config` 表（视频链路运行参数）

读取方式：

- `getSystemConfigByKey(key)`（带 5 分钟缓存）：`src/shared/cache/system-config.ts`

代码里已出现的 key（用于需求对齐）：

- `credit.points_per_minute`：每分钟积分单价（创建任务扣费用）
- `r2.public.base_url`：公桶访问 base url（列表/预览用）
- `r2.bucket.private`：私桶 bucket 名（创建任务默认值）
- `r2.bucket.public`：公桶 bucket 名（字幕/产物等）

建议：

- 每新增一个 key，都要在文档里同步补充用途与默认值。

