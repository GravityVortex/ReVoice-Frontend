# API 面与鉴权边界（BFF 契约速查）

> 最后校验：2026-03-04  
> 单一来源：`src/app/api/**/route.ts`

本文的目标：让你在评审/实现需求时，快速判断：

- 该改哪个 API？
- 是否需要登录？
- 是否属于 webhook/回调/公开端点（需要额外安全措施）？

---

## 1) 鉴权方式（现状）

多数业务接口使用 `getUserInfo()`（better-auth session cookie）判断登录态：

- 典型写法：未登录直接 `respErr('no auth, please sign in')`
- 代码入口经常在：`src/shared/models/user.ts`

> 注意：并非所有接口都做了登录校验；存在公开端点（webhook/proxy/docs search）。

---

## 2) API 分组速查

### 2.1 视频任务（通常需要登录）

目录：`src/app/api/video-task/*`

常见能力：

- 创建任务：`POST /api/video-task/create`
- 任务列表/详情：`GET /api/video-task/list`、`GET /api/video-task/detail`
- 进度查询：`GET /api/video-task/getTaskProgress`
- 下载：`GET /api/video-task/download-video` 等
- 字幕编辑闭环：`POST /api/video-task/generate-subtitle-voice`、`GET /api/video-task/generate-video`

### 2.2 上传与存储（通常需要登录）

目录：`src/app/api/storage/*`

- multipart：`/api/storage/multipart/*`（initiate/presign-part/complete/abort/list-parts）
- 其它：如 stream/range 代理、图片上传等（以目录为准）

### 2.3 支付（部分公开，需严格校验）

目录：`src/app/api/payment/*`

关键点：

- `POST /api/payment/notify/[provider]` 是 webhook 回调入口（公开端点）
- 安全要求：
  - 必须做签名验证/事件校验（按 provider 实现）
  - 必须幂等（webhook 可能重放）

支付核心逻辑：`src/shared/services/payment.ts`

### 2.4 AI（通常需要登录）

- `src/app/api/chat/route.ts`
- `src/app/api/ai/generate/route.ts`

### 2.5 Docs Search（通常公开）

- `src/app/api/docs/search/route.ts`

### 2.6 Proxy 类端点（高风险，需要重点关注）

1) SRT 代理（公开但有域名白名单）：

- `GET /api/proxy-srt?url=...`
- 实现：`src/app/api/proxy-srt/route.ts`

2) 通用请求代理（当前无鉴权，风险极高）：

- `GET/POST /api/request-proxy`
- 实现：`src/app/api/request-proxy/route.ts`
- 现状：`Access-Control-Allow-Origin: *`，且可代理任意 URL

建议：

- 生产环境禁用或加管理员鉴权
- 增加 allowlist（域名/路径/方法）
- 增加审计日志与限流

---

## 3) 需求评审时的必问项（避免安全事故）

- 新接口是否必须登录？（用户态 vs 管理员态）
- 是否会被第三方回调调用？（webhook/回调）
- 是否涉及“代理/转发用户提供的 URL”？（SSRFi 风险）
- 是否涉及下载/预签名？（只能信 DB 清单，不要让前端探测对象存在）

