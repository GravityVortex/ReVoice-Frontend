# Next.js + Java R2 Multipart Upload 实施清单（基于 v1.3）

本文是对 `docs/nextjs-multipart-upload-api.md`（v1.3）的**落地任务清单**与**验收用例**，用于确保“分片上传 + Java 控制面 + Next 网关 + 任务链路”最终可用。

---

## 1. 目标（必须达成）

- 浏览器只调用 Next.js API（带 Session）；**不直连 Java**。
- 浏览器只拿到 presigned URL 直传 R2（数据面）；**不暴露 R2 密钥**。
- Next.js 的 multipart API 对外统一 wrapper：`{code:0/-1,message,data}` 且 HTTP 200。
- Next.js 到 Java 走 `text/plain` 加密协议；Java 返回 `ApiResponse(code=200/4xx/5xx)`。
- `keyV` 固定：`original/video/video_original.mp4`；`key={userId}/{fileId}/{keyV}`；Java 内部拼 `fullKey={envPrefix}/{key}`。
- `complete` 不依赖浏览器 ETag；Java **必须** `ListParts` 聚合全量 parts 后再 complete。

---

## 2. Next.js 需要做的事（本仓库）

### 2.1 API 网关（浏览器 -> Next）

实现/改造以下 Route（全部 POST）：

- `/api/storage/multipart/initiate`
- `/api/storage/multipart/presign-part`
- `/api/storage/multipart/complete`
- `/api/storage/multipart/abort`
- `/api/storage/multipart/list-parts`（可选但建议实现，用于续传/排障）

约束：

- 必须 `getUserInfo()` 校验登录。
- 必须对 `key` 做严格校验（属于 userId、固定 keyV、拒绝 `..`、拒绝以 `/` 开头、fileId 只能单段）。
- 对外返回必须是 wrapper（HTTP 200 固定）。
- 字段映射必须按 v1.3 表格：
  - presign-part：`url -> presignedUrl`
  - complete：`downloadUrl -> publicUrl`

### 2.2 Next.js -> Java 调用（控制面）

- 新增 Java 调用封装：加密 + `Content-Type: text/plain` + 解析 `ApiResponse`
- Java 返回非 200 或 HTTP 非 2xx 时，Next 必须转换成 `code=-1`（对外仍 HTTP 200）

### 2.3 前端 uploader

- `MultipartUploader` 必须先解包 wrapper（不能直接把 `res.json()` 当 data 用）。
- UploadPart PUT 成功判断：**任意 2xx** 都算成功（200/204 等）。
- 默认参数建议（可根据体验调整）：
  - `chunkSize=16MB`
  - `concurrency=6`
  - `timeoutMs=10min`

### 2.4 任务链路与跳转

- 上传完成后，提交翻译任务必须携带 `fileId/r2Key/r2Bucket` 等字段，确保 DB 能定位对象。
- 任务创建成功后页面跳转到：`/dashboard/projects/{fileId}`。

---

## 3. Java 需要做的事（不在本仓库，但必须完成）

按 `docs/nextjs-multipart-upload-api.md` 第 4 章提供接口：

- `POST /api/nextjs/r2/multipart/initiate`
- `POST /api/nextjs/r2/multipart/presign-part`
- `POST /api/nextjs/r2/multipart/complete`
- `POST /api/nextjs/r2/multipart/abort`
- `POST /api/nextjs/r2/multipart/list-parts`

强制要求：

- Java 内部统一使用 `fullKey={envPrefix}/{key}`，Next 永远只传 `key`。
- complete/list-parts 必须 `ListParts` 分页拉全（聚合后对外一次性返回全量）。
- 对外 `etag` 不带引号。

---

## 4. 验收测试用例（最终可用性验证）

### 4.1 自动化（最小单元测试）

运行以下脚本（均为纯本地单测/模拟，不依赖真实 R2/Java）：

0) 数据库连接与权限（非破坏性）
- 运行：`npm run test:db`
- 覆盖：DB 可连通、关键表存在、TEMP 表写入权限（不落库、无持久副作用）

1) key 校验规则
- 运行：`npx tsx scripts/test-multipart-key-contract.ts`
- 覆盖：key 归属校验、固定 keyV、拒绝路径穿越

2) Next 网关校验 + 字段映射（Java->Next）
- 运行：`npx tsx scripts/test-multipart-gateway.ts`
- 覆盖：入参校验、`url->presignedUrl`、`downloadUrl->publicUrl`、parts 透传/忽略规则

3) Next->Java 加密协议 + Java 响应处理（mock Java server）
- 运行：`npx tsx scripts/test-java-r2-multipart-service.ts`
- 覆盖：`text/plain` 加密请求、HTTP 4xx/5xx 错误转异常、Java code!=200 处理

4) 前端 MultipartUploader 行为（mock fetch + mock XHR）
- 运行：`npx tsx scripts/test-multipart-uploader.ts`
- 覆盖：wrapper 解包、PUT 2xx 成功判定（200/204）、进度推进到 100、initiate code=-1 失败抛错

一键运行（推荐）：

```bash
npx tsx scripts/test-multipart-key-contract.ts \
  && npx tsx scripts/test-multipart-gateway.ts \
  && npx tsx scripts/test-java-r2-multipart-service.ts \
  && npx tsx scripts/test-multipart-uploader.ts
```

### 4.1.1 自动化（真实 Java + 真实 R2 的端到端验证）

当 Java 的 `/api/nextjs/r2/multipart/*` 已部署可用后，跑下面这个 E2E 用例来做**真实链路**验收（会真的把分片 PUT 到 R2）：

```bash
npm run test:e2e:java-multipart
```

该脚本覆盖点（均按 v1.3 语义断言）：

- initiate + list-parts（空）+ upload 1 part + list-parts（有 1 条）+ abort
- initiate + complete（未上传任何分片，必须报 “No parts uploaded …”）+ abort
- initiate + 上传全量分片 + complete **不传 parts**（模拟浏览器读不到 ETag）+ downloadUrl Range GET 校验

可选参数（不传则用默认值：`size=25MB, chunkSize=8MB`）：

```bash
npx tsx scripts/e2e-java-multipart-contract.ts --userId user_e2e_xxx --sizeMB 25 --chunkSizeMB 8
```

### 4.2 手工验收（必须做，覆盖端到端）

### 4.2.1 Java 未就绪时：本地 Mock Java（让 Next 先跑通）

当线上/测试环境 Java 的 `/api/nextjs/r2/multipart/*` 尚未部署时，可以用本仓库提供的 **mock Java server** 先把 Next 的分片链路跑通（仍然会把分片上传到真实 R2）。

1) 启动 mock server（会实现加密协议 + R2 multipart 控制面）：

```bash
npx tsx scripts/mock-java-r2-multipart-server.ts --port 18080 --prefix /video --envPrefix dev
```

可选：把非 multipart 的 `/api/nextjs/**` 请求转发到真实 Java（避免影响其他功能）：

```bash
MOCK_JAVA_PROXY_BASE_URL=https://video-tools-fov5.onrender.com/video \
  npx tsx scripts/mock-java-r2-multipart-server.ts --port 18080 --prefix /video --envPrefix dev
```

2) 启动 Next（把 `JAVA_SERVER_BASE_URL` 指向 mock）：

```bash
JAVA_SERVER_BASE_URL=http://127.0.0.1:18080/video npm run dev
```

3) 访问 `/dashboard/create` 上传真实 mp4，观察 Network：
- 只出现 Next 的 `/api/storage/multipart/**`
- 分片 PUT 到 R2 的 presigned URL
- 不出现浏览器直连 Java

#### 用例 A：正常上传 + 创建任务

前置：
- 已登录非管理员账号
- Java 服务可用，`JAVA_SERVER_BASE_URL` 配置正确

步骤：
1. 打开 `/dashboard/create`
2. 选择一个 mp4（建议 200MB+，模拟真实分片）
3. 观察上传进度能持续推进，最终提示上传成功
4. 点击提交任务
5. 期望跳转到 `/dashboard/projects/{fileId}`，并能看到任务状态

检查点：
- 浏览器 Network 中**不出现** Java 的 `/api/nextjs/**` 请求（只看到 Next 的 `/api/storage/multipart/**` + R2 presigned PUT）。
- `/api/storage/multipart/**` 的响应 body 是 `{code:0,...,data:{...}}` 格式。

#### 用例 B：complete 前不上传任何分片

步骤：
1. initiate 拿到 uploadId/key
2. 不 PUT 任何分片，直接调用 complete

期望：
- Next 返回 `code=-1`（message 含 “No parts uploaded ...” 或等价错误）

#### 用例 C：越权 key

步骤：
1. 登录 A 用户
2. 调用 presign-part/complete/abort/list-parts 时传入 `key` 前缀为其他 userId

期望：
- Next 直接 `code=-1`（不转发 Java）

#### 用例 D：网络不稳定（重试）

步骤：
1. 上传大文件时在浏览器 DevTools 限速（例如 Fast 3G）
2. 观察上传不会“整体失败后重来”；若单片失败，会在该片上重试，最终成功或明确失败

期望：
- 最终 complete 成功；或失败时 abort 成功清理（不会留下半拉 uploadId 无法回收）

#### 用例 E：ListParts 排障

步骤：
1. initiate 后上传一部分分片
2. 调用 list-parts

期望：
- 返回全量已上传 parts（按 partNumber 升序），且 etag 不带引号
