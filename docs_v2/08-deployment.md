# 部署矩阵（Vercel / Cloudflare / Docker）

> 最后校验：2026-03-04  
> 目标：让研发/运维知道“现在支持哪些部署方式、差异在哪里、哪些是已知坑”。

---

## 1) Vercel（常用）

相关文件：`vercel.json`

- 已配置不同 API 目录的函数超时与内存
- 注意：构建命令/参数需要与你的 Next/构建策略保持一致（以实际构建产物为准）

必配 env（至少）：

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `AUTH_SECRET`

视频链路 env（视需求）：

- `JAVA_SERVER_BASE_URL`
- `ENCRYPTION_SECRET`
- `PYTHON_SERVER_BASE_URL`
- `MODAL_KEY` / `MODAL_SECRET`
- `TTS_SERVER_BASE_URL`（可选）

---

## 2) Cloudflare（OpenNext）

相关文件：

- `wrangler.toml.example`
- `package.json` 中 `cf:*` scripts

特点：

- Workers 运行时与 Node 有差异（但项目已开启 `nodejs_compat`）
- DB 可能走 Hyperdrive（看 `src/core/db/index.ts` 对 Hyperdrive 的探测逻辑）

---

## 3) Docker（仅当你需要容器化自建）

相关文件：`Dockerfile`

⚠️ 已知风险（需要在部署前确认）：

- 本仓库 `pnpm build` 默认把构建输出放到 `.next.build`（见 `package.json` 与 `next.config.mjs`）
- 但 `Dockerfile` 仍从 `/app/.next/standalone` 拷贝产物

这意味着：

- 如果你直接 `docker build`，很可能产物路径不一致导致容器启动失败（或缺文件）

建议策略（两选一）：

1) 统一构建产物目录：让 Docker 构建走 `.next` 的 standalone 产物  
2) 或者更新 Dockerfile：从 `.next.build` 对应路径拷贝

> 这不是文档问题，而是“部署契约需要统一”的工程问题；在需求迭代涉及部署时必须明确。

