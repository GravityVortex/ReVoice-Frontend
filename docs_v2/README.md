# ReVoice 文档体系 v2（工程手册）

> 最后校验：2026-03-04  
> 目标：让 **研发 30 分钟跑起来**，让 **需求/产品 30 分钟摸清现状并能提出可落地需求**。

本目录是**新的单一入口**。历史资料已完成迁移与清理：可复用内容已归类到 `docs_v2/` 的对应子目录
（架构/对接/审计/归档方案等）；其中 `plans/archive/` 默认不保证持续更新。

---

## 🎯 推荐阅读顺序

### 研发上手（建议按顺序）

0. `00-doc-governance.md`（如何维护文档，避免漂移）
1. `01-quickstart-dev.md`（先跑起来）
2. `04-architecture.md`（理解端到端链路与边界）
3. `07-config-and-settings.md`（知道“哪些配置在哪改”）
4. `06-api-and-auth.md`（接口面与鉴权边界）
5. `05-data-model.md`（数据表与真相源）
6. `08-deployment.md`（部署矩阵与已知坑）
7. `10-troubleshooting.md`（排障速查）

### 需求/产品上手（建议按顺序）

1. `02-quickstart-pm.md`（现状能力 + 关键约束）
2. `03-feature-map.md`（功能地图：页面/接口/数据对应关系）
3. `04-architecture.md`（理解“为什么必须这样做”）
4. `09-requirements-iteration.md`（迭代流程 + 需求模板 + 验收清单）

---

## 🧭 文档地图（你要找什么）

- 文档治理与维护规则：`00-doc-governance.md`
- 快速开始（研发）：`01-quickstart-dev.md`
- 快速了解（需求/产品）：`02-quickstart-pm.md`
- 功能地图（模块 -> 代码入口）：`03-feature-map.md`
- 架构与端到端链路：`04-architecture.md`
- 数据模型（表/字段/写入方）：`05-data-model.md`
- API 与鉴权边界：`06-api-and-auth.md`
- 配置体系（env / config 表 / vt_system_config）：`07-config-and-settings.md`
- 部署矩阵（Vercel / Cloudflare / Docker）：`08-deployment.md`
- 需求迭代流程（模板 + 验收）：`09-requirements-iteration.md`
- 排障速查：`10-troubleshooting.md`
- 术语表：`99-glossary.md`

---

## 📦 迁移进来的资料（按类别）

这些内容来自历史文档/方案/审计，已统一放进 v2 目录体系中：

- 架构知识库（历史沉淀）：`architecture/revoice-architecture/`
- 对接与实现（跨仓协作）：`integration/`
- How-to（具体问题操作手册）：`howto/`
- 审计与评估（产品迭代输入）：`audits/`
- 历史方案与任务清单（默认不持续维护）：`plans/archive/`
- 定价与产品策略（可能需要持续校验）：`product/pricing/`
