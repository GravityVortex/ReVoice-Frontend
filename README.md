# SoulDub.ai（ReVoice）Web

本仓库是 **Next.js 全栈应用**（Web UI + BFF + 直连 Postgres），承载 SoulDub/ReVoice
的视频翻译/配音业务链路，同时包含通用的 SaaS 模块（登录、支付订阅、积分、管理后台、
AI Chat 等）。

> 备注：本项目最初基于 ShipAny 模板演进而来，但当前代码与文档已按实际业务重构。

---

## 🚀 30 分钟开发上手（开发必读）

详细版请看：`docs_v2/01-quickstart-dev.md`

1) 安装依赖

```bash
pnpm i
```

2) 配置环境变量（至少 DB + Auth）

```bash
cp .env.example .env
```

然后参考 `docs_v2/07-config-and-settings.md` 补齐本项目实际用到的变量（`.env.example`
目前仅是最小样例，字段不全）。

3) 启动

```bash
pnpm dev
```

4) 验证 DB 连通

```bash
pnpm test:db
```

> 视频翻译全链路需要对接 Java（video-tools）与 Python（VAP/TTS/Speaker）服务；
> 只跑本仓库可以启动 UI/管理后台/支付配置界面，但视频链路部分接口会因外部依赖缺失而失败。

---

## 📚 文档入口（新体系 v2）

从这里开始：`docs_v2/README.md`

- 面向研发：快速启动、架构、数据模型、API 与鉴权边界、部署与排障
- 面向需求/产品：现状能力地图、核心约束、需求迭代流程与验收清单

---

## 🧰 常用命令

- `pnpm dev`：本地开发（webpack）
- `pnpm dev:turbo`：本地开发（turbopack）
- `pnpm build` / `pnpm start`：构建与运行
- `pnpm test`：单测（vitest）
- `pnpm test:db`：DB 连通 + schema sanity
- `pnpm rbac:init`：初始化 RBAC（可选）

---

## 🔒 LICENSE / 合规

⚠️ 请勿公开发布 ShipAny 相关源码；详见 `LICENSE`。
