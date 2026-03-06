# 研发快速上手（30 分钟跑起来）

> 最后校验：2026-03-04  
> 目标：让你先把 Web 跑起来；需要跑“视频翻译全链路”时，再逐步接入 Java/Python。

---

## 0) 你需要知道的事实（别踩坑）

- 本仓库是 **Next.js 全栈**：既有页面，也有 `src/app/api/**` 的 BFF 接口。
- 业务依赖外部服务：
  - Java `video-tools`（R2 预签名、multipart、调度、internal 回调落库等）
  - Python VAP/TTS/Speaker（重计算数据面）
- 数据库（Postgres）是必需依赖：大量功能（登录、配置、任务、积分、订阅）都直连 DB。

---

## 1) 环境准备

建议版本（与 `Dockerfile`/依赖现状匹配）：

- Node.js：20+
- pnpm：9+
- Postgres：推荐 Supabase（本地 Postgres 也可）

---

## 2) 安装依赖 & 启动

```bash
pnpm i
pnpm dev
```

默认会用 `NEXT_DIST_DIR=.next.codex` 启动开发服务器（见 `package.json`）。

---

## 3) 最小环境变量（必须）

`.env` 至少需要：

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="SoulDub"

DATABASE_URL="postgres://..."
DATABASE_PROVIDER="postgresql"
DB_SINGLETON_ENABLED="true"

# openssl rand -base64 32
AUTH_SECRET="..."
```

更多变量（Java/Python/R2/Modal 等）见：`07-config-and-settings.md`。

---

## 4) DB 初始化与校验

1) 确保 DB 里至少存在基础表（`user/session/account/config/...` 与 `vt_*` 表）。

2) 快速验证连通性与表存在性：

```bash
pnpm test:db
```

3) 如果你希望用 Drizzle 直接把 `schema.ts` 推到数据库（谨慎使用，尤其是生产库）：

```bash
pnpm db:push
```

> 说明：本仓库的迁移输出目录是 `src/config/db/migrations`，但目前被 `.gitignore` 忽略；
> 这意味着“迁移文件并非稳定交付物”，更像是临时/本地使用工具。

---

## 5) RBAC（可选）

需要管理后台权限时，先初始化 RBAC：

```bash
pnpm rbac:init
```

脚本入口：`scripts/init-rbac.ts`。

---

## 6) 接入视频翻译链路（可选但常见）

如果你要在本地完整跑通“上传 -> 创建任务 -> 进度 -> 下载/字幕编辑”：

1) 配置 Java 相关 env（至少）：
   - `JAVA_SERVER_BASE_URL`
   - `ENCRYPTION_SECRET`

2) 配置 Python/Modal 相关 env（按你的运行形态）：
   - `PYTHON_SERVER_BASE_URL`
   - `MODAL_KEY` / `MODAL_SECRET`
   - 可选：`TTS_SERVER_BASE_URL`

3) 然后按 `04-architecture.md` 的端到端链路逐段验证。

---

## 7) 常用自检脚本（推荐）

- `pnpm test`：单测
- `pnpm test:multipart`：multipart 契约与网关自测（对接 Java 时很有用）
- `pnpm mock:java-multipart`：本地 mock 一个 Java multipart 服务（用于前端联调）

