# 排障速查（开发/联调常见问题）

> 最后校验：2026-03-04  
> 建议：先看报错栈与请求路径，再按本页定位到“是哪一层出问题”（Web/DB/Java/Python/R2）。

---

## 1) Web 启动就报错

### `DATABASE_URL is not set`

- 说明：DB 没配或没被加载
- 处理：
  - 检查 `.env` 是否存在
  - 检查 `DATABASE_URL` 是否为空

### OAuth 登录跳回旧域名 / redirect_uri_mismatch

- 典型原因：`NEXT_PUBLIC_APP_URL` / `AUTH_URL` 没同步
- 参考：`docs_v2/howto/social-login-setup.md`

---

## 2) 上传相关

### `invalid key` / `key must start with userId/`

- 说明：multipart key 合同不满足 `{userId}/{fileId}/original/video/video_original.mp4`
- 校验逻辑：`src/shared/lib/multipart-upload-contract.ts`

### initiate/presign/complete 报 401

- 多数原因：未登录（multipart API 需要 `getUserInfo()`）
- 检查浏览器 cookie/session

---

## 3) 创建任务成功但一直 pending

优先按链路定位：

1) Web 是否写入了 `vt_task_main`？（`POST /api/video-task/create`）
2) Java 调度是否在 claim pending？（Java 仓库日志/调度频率）
3) Python job 是否提交成功？（Modal/RunPod 平台侧）
4) Java internal 回调是否能写进度/写成品清单？

> 核心原则：前端展示/下载只信 DB；如果 `vt_file_final` 没写入，前端就不会认为成品就绪。

---

## 4) 下载失败

常见原因：

- DB 没有对应 `vt_file_final` 记录（成品清单没落库）
- Java 预签名接口异常（Java base url 或加密密钥不一致）

检查项：

- `JAVA_SERVER_BASE_URL` 是否正确
- `ENCRYPTION_SECRET` 是否与 Java 一致

---

## 5) Webhook/支付相关

症状：支付回调 500、订单状态不更新、积分不发放

排查：

- 确认 webhook 入口：`src/app/api/payment/notify/[provider]/route.ts`
- 确认 `config` 表里对应 provider key 是否已配置（建议走后台设置页）
- 确认幂等：webhook 可能重放，不能重复发放积分

---

## 6) “代理”接口安全问题

如果你在生产环境看到异常外部请求，重点关注：

- `src/app/api/request-proxy/route.ts`（当前无鉴权，可代理任意 URL）

建议生产禁用或加管理员鉴权 + allowlist + 限流 + 审计日志。
