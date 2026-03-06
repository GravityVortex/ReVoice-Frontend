# 功能地图（模块 -> 代码入口 -> 迭代点）

> 最后校验：2026-03-04  
> 用法：当你要改一个需求，先定位它属于哪个模块，再去找对应入口文件。

---

## 1) Web 路由分区（页面层）

路由主入口：`src/app/[locale]/*`（项目强制 `/{locale}` 前缀）

- Landing（营销页）：`src/app/[locale]/(landing)/*`
- Docs（文档站）：`src/app/[locale]/(docs)/*`
- Blog（博客）：通常在 Landing 主题里渲染（数据来自 `content/posts`）
- Auth（登录注册相关）：`src/app/[locale]/(auth)/*`、`src/app/[locale]/(auth-split)/*`
- Dashboard（用户工作台）：`src/app/[locale]/(dashboard)/*`
- Admin（管理后台）：`src/app/[locale]/(admin)/*`
- Legal（法律页，不带 locale 前缀）：`src/app/(legal)/*`

---

## 2) API 路由分区（BFF 层）

API 入口：`src/app/api/**/route.ts`

常见分组：

- 视频任务：`src/app/api/video-task/*`
- 存储/上传：`src/app/api/storage/*`
- 支付：`src/app/api/payment/*`
- AI：`src/app/api/ai/*`、`src/app/api/chat/*`
- 鉴权：`src/app/api/auth/*`（better-auth）
- 工具代理：
  - `src/app/api/proxy-srt/route.ts`（SRT 跨域代理，域名白名单）
  - `src/app/api/request-proxy/route.ts`（通用请求代理，当前无鉴权，需重点关注）

API 与鉴权边界详见：`06-api-and-auth.md`

---

## 3) 关键业务模块（服务层/模型层）

### 3.1 视频翻译（核心链路）

- 任务创建/扣积分：`src/app/api/video-task/create/route.ts`
- 任务列表/详情/进度：`src/app/api/video-task/list/*`、`src/app/api/video-task/detail/*`、`src/app/api/video-task/getTaskProgress/*`
- 下载：`src/app/api/video-task/download-video/*` 等
- 字幕编辑与重生成：`src/app/api/video-task/generate-subtitle-voice/*`、`src/app/api/video-task/generate-video/*`

外部服务调用封装：

- Java 调用：`src/shared/services/javaService.ts`、`src/shared/services/javaR2Multipart.ts`
- Python 调用：`src/shared/services/pythonService.ts`、`src/shared/services/pythonAuth.ts`

数据模型（DB 直连）：

- `src/shared/models/vt_*`
- 以及 `src/config/db/schema.ts` 的 `vt_*` 表定义

### 3.2 计费（积分/订阅/支付）

- 支付聚合：`src/shared/services/payment.ts`
- 支付 Provider：`src/extensions/payment/*`
- 订单/订阅/积分模型：`src/shared/models/order.ts`、`src/shared/models/subscription.ts`、`src/shared/models/credit.ts`
- Webhook 回调入口：`src/app/api/payment/notify/[provider]/route.ts`

配置来源：

- 支付/登录等配置来自 DB `config` 表（后台设置页写入）
- 与视频链路强相关的运行参数来自 DB `vt_system_config`（如积分单价、R2 base url）

### 3.3 登录与权限（better-auth + RBAC）

- better-auth 配置：`src/core/auth/*`、`src/app/api/auth/[...all]/route.ts`
- RBAC 表：`role/permission/user_role/...`（见 `src/config/db/schema.ts`）
- RBAC 初始化脚本：`scripts/init-rbac.ts`

### 3.4 内容与运营（Landing / Docs / Blog）

- 文档/页面/博客内容源：
  - Docs：`content/docs/*`
  - Pages：`content/pages/*`
  - Posts：`content/posts/*`
- 文档渲染：`src/core/docs/source.ts` + fumadocs

### 3.5 AI Chat / AI 生成

- Chat API：`src/app/api/chat/route.ts`
- AI 生成：`src/app/api/ai/generate/route.ts`
- 数据表：`ai_task/chat/chat_message`（见 `src/config/db/schema.ts`）

---

## 4) 需求迭代时的“快速定位问题”清单

- 属于哪个模块？（视频/计费/登录/内容/AI/管理后台）
- 入口是页面还是 API？（`src/app/[locale]` vs `src/app/api`）
- 真相源在哪张表？（`config` / `vt_system_config` / `vt_*` / `order/subscription/credit`）
- 是否需要改外部系统？（Java/Python/R2/Stripe）

需求模板与验收：`09-requirements-iteration.md`

