# Java 端 R2 分片上传（Multipart Upload）改造方案

## 背景 / 现状

当前系统里“直传 R2”的签名 URL 由 Java 服务提供（`/api/nextjs/presigned-urls`），Next.js 侧统一走 Java（不再保留本地签名开关）。

你现在要求：

- **分片上传必须使用**（提升大文件成功率/可重试/并发）
- **必须走 Java 服务**（签名与 multipart 控制面必须由 Java 提供）

这意味着 Java 需要提供 **S3 Multipart Upload 的完整控制面**：`CreateMultipartUpload / UploadPart(预签名) / CompleteMultipartUpload / AbortMultipartUpload`，并解决浏览器端常见的 `ETag` 可见性问题。

## 目标（必须满足）

- 前端仍然是“浏览器直传分片到 R2”（避免代理上传的带宽翻倍与平台 body 限制）。
- Java 负责：
  - 创建 uploadId
  - 为每个 part 生成 presigned URL
  - 完成合并（必要时自行 `ListParts` 补齐 ETag）
  - 取消上传（abort）
- 兼容当前的加密请求格式（`text/plain` 密文 + `time` 防重放），返回 JSON：`{code,message,data}`。
- key 规则必须与现有 Java 模式一致：
  - **Java 模式对象路径：** `"{userId}/{fileId}/{keyV}"`
  - `keyV` 固定：`original/video/video_original.mp4`

## 非目标（不要做）

- 不做“后端代理上传”（除非你明确接受慢/贵/限制多）。
- 不引入数据库保存 upload session（第一期不需要，KISS）。
- 不做复杂的断点续传协议（multipart 本身已经具备可重试基础；续传只需要复用 uploadId + ListParts）。

## 关键约束与坑

1. **浏览器通常读不到 `ETag` 响应头**
   - R2/S3 的 CORS 如果没配置 `ExposeHeaders: ETag`，`XMLHttpRequest.getResponseHeader('ETag')` 会拿不到值。
   - 解决方案：**Complete 时由 Java 调 `ListParts` 获取 ETag 列表**，不要强依赖前端回传 ETag。

2. S3 Multipart Upload 规则：
   - partNumber 从 1 开始
   - **除最后一片外每片 >= 5MB**
   - 最大 10,000 parts（注意 chunkSize 与最大文件大小的关系）

3. “不暴露 R2 实际地址”与“浏览器直传”天然冲突：
   - 只要浏览器用 presigned URL 直传，Network 里一定能看到目标域名（这是 HTTP 的基本事实）。
   - 能做的只有两种：
     - 给 R2 绑 **自定义域名**（看到的是你自己的域）
     - 走 **代理上传**（完全不暴露，但代价很大）
   - 本方案默认采用“自定义域名”作为可选优化，不做代理。

## API 设计（Java 需要新增的接口）

### 通用约定

- **请求体：** `Content-Type: text/plain`，body 为密文字符串（与现有 `/api/nextjs/presigned-urls` 一致）
- **响应：** JSON
  - 成功：`{ "code": 200, "message": "Success", "data": ... }`
  - 失败：`{ "code": xxx, "message": "...", "data": null }`
- **鉴权：**
  - 依赖现有加密机制（共享 `ENCRYPTION_SECRET`），并要求请求里明确带 `userId`
  - 服务端强校验：`key` 必须以 `${userId}/` 开头

> 说明：前端不应直接调用 Java；仍建议 Next.js API 路由作为网关，校验登录态后再请求 Java。

---

### 1) Initiate：创建 multipart upload

`POST /api/nextjs/r2/multipart/initiate`

明文请求结构（加密前）：
```json
{
  "userId": "user_xxx",
  "filename": "a.mp4",
  "contentType": "video/mp4"
}
```

成功响应：
```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "uploadId": "xxxxx",
    "fileId": "uuid",
    "bucket": "zhesheng",
    "keyV": "original/video/video_original.mp4",
    "key": "user_xxx/uuid/original/video/video_original.mp4",
    "downloadUrl": "https://... (可选：预览下载 URL，complete 时再给也行)"
  }
}
```

实现要点：

- `fileId` 建议由 Java 生成（与现有单次签名逻辑一致），也可以由 Next 传入（但第一期别搞两套）。
- 调用 S3 API：`CreateMultipartUpload(bucket, key, ContentType)`
- 返回 `uploadId + key + fileId`，并把 `keyV` 固定返回给前端用于后续任务提交。

---

### 2) Presign Part：为单个分片生成 presigned URL

`POST /api/nextjs/r2/multipart/presign-part`

明文请求：
```json
{
  "userId": "user_xxx",
  "uploadId": "xxxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "partNumber": 1,
  "expiresInSeconds": 3600
}
```

成功响应：
```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "partNumber": 1,
    "url": "https://...X-Amz-Signature=..."
  }
}
```

实现要点：

- 使用 S3Presigner 预签名 `UploadPart`（包含 `bucket/key/uploadId/partNumber`）
- **不要**把额外 header（比如 Content-Type）纳入签名，避免前端必须匹配 header（减少故障点）。
- 校验 `partNumber` 合法性（>=1）。

> 可选优化（第二期）：支持批量 presign，减少请求次数：`presign-parts(partNumbers:[])`。

---

### 3) Complete：完成合并

`POST /api/nextjs/r2/multipart/complete`

明文请求（推荐允许 parts 可选）：
```json
{
  "userId": "user_xxx",
  "uploadId": "xxxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "parts": [
    {"partNumber": 1, "etag": "...."},
    {"partNumber": 2, "etag": "...."}
  ]
}
```

成功响应：
```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "success": true,
    "bucket": "zhesheng",
    "key": "user_xxx/uuid/original/video/video_original.mp4",
    "keyV": "original/video/video_original.mp4",
    "fileId": "uuid",
    "downloadUrl": "https://... (给 UI 预览用，建议 4h)"
  }
}
```

实现要点：

- **优先使用请求中的 parts（如果 etag 齐全）**。
- 如果 `parts` 缺失或有 etag 为空：
  - 调用 `ListParts(bucket, key, uploadId)` 拉取 `PartNumber/ETag`
  - 排序后组装 `CompleteMultipartUpload`
- `downloadUrl` 用 GetObject 预签名生成（`expiresIn` 建议 4h），供 UI 上传完成后即时预览。

---

### 4) Abort：取消 multipart upload（清理 uploadId）

`POST /api/nextjs/r2/multipart/abort`

明文请求：
```json
{
  "userId": "user_xxx",
  "uploadId": "xxxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4"
}
```

响应：
```json
{
  "code": 200,
  "message": "Success",
  "data": { "success": true }
}
```

实现要点：

- 调用 `AbortMultipartUpload(bucket, key, uploadId)`
- 不要暴露内部异常堆栈；返回可读错误信息即可。

---

### 5)（可选）ListParts：查询已上传分片（用于续传/排障）

`POST /api/nextjs/r2/multipart/list-parts`

明文请求：
```json
{ "userId": "user_xxx", "uploadId": "xxxxx", "key": "..." }
```

响应：
```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "parts": [
      { "partNumber": 1, "etag": "..." }
    ]
  }
}
```

第一期可不做；但如果要做“断点续传”（复用 uploadId）就必须有它。

## Java 侧实现建议（尽量简单）

### SDK 选型

- 建议 AWS SDK for Java v2：
  - `software.amazon.awssdk:s3`
  - `software.amazon.awssdk:s3-presigner`
- endpoint override 指向 R2：
  - `https://{accountId}.r2.cloudflarestorage.com` 或你自己的自定义域
- region：`auto`（与现有 Node/TS 侧一致）

### 代码结构（KISS）

- `R2ClientFactory`
  - 构造 `S3Client`（create/complete/abort/list）
  - 构造 `S3Presigner`（presign uploadPart/getObject）
- `MultipartController`
  - 4 个 endpoint，每个 endpoint：
    - 解密 + 校验 userId/key
    - 调用 service
    - 统一响应结构
- `MultipartService`
  - `initiate(userId, filename, contentType)`
  - `presignPart(userId, key, uploadId, partNumber, expires)`
  - `complete(userId, key, uploadId, optionalParts)`
  - `abort(userId, key, uploadId)`

### 校验规则（必须做）

- `userId` 必填
- `key` 必填，且必须以 `${userId}/` 开头
- `uploadId` 必填（除 initiate）
- `partNumber >= 1`
- `expiresInSeconds` 限制范围（例如 `60 <= expires <= 86400`）
- 统一对外错误码（400/401/403/500 由现有风格决定）

## Next.js 侧对接改造（为了落地，Java 必须知道）

你现有前端分片上传调用的是：

- `/api/storage/multipart/initiate`
- `/api/storage/multipart/presign-part`
- `/api/storage/multipart/complete`
- `/api/storage/multipart/abort`

落地方式推荐：

1. Next 这 4 个 API route 保留（前端不改路径，风险最小）
2. Next route 内部改成“转发请求到 Java”（复用现有 javaService 的加密请求模式）
3. Next route 仍负责：
   - 校验登录态（`getUserInfo()`）
   - 把 `userId` 塞进加密请求给 Java
   - 把 Java 返回的数据转换成前端需要的 shape（尽量保持不变）

这样可以做到：

- 前端强制走分片
- Java 强制参与签名与 complete
- 不在 Next 里保存 R2 密钥（只在 Java 里）

## 验收标准（上线前必须过）

1. 上传 300MB mp4：
   - 失败重试不会让进度条回退死循环
   - complete 成功后能拿到可播放的 `downloadUrl`
2. 断网/刷新：
   - abort 能成功清理 uploadId（至少不会泄漏到无法完成）
3. `ETag` 不可见场景：
   - 前端不回传 ETag（或为空），Java complete 仍能通过 `ListParts` 成功完成
4. 安全：
   - 传入 `key` 不以 userId 开头 => 必须拒绝
   - 过期密文请求（>5min）=> 必须拒绝

## 风险与规避

- **Java 端没有 ListParts/Complete 权限**：确认 R2 access key 对 bucket 具备 multipart 权限。
- **CORS 配置不全导致 PUT 失败**：bucket CORS 必须允许 `PUT`，并允许浏览器发起跨域（允许的 Origin/Headers）。
- **签名域名变更**：如要“看不到 r2.cloudflarestorage.com”，只能使用自定义域名；不改客户端逻辑。

---

## 附：推荐的 CORS（R2 桶）最小集

> 仅供参考，最终按你部署域名收敛 Origin。

- AllowedMethods: `PUT, GET, HEAD`
- AllowedHeaders: `*`（或至少 `content-type`）
- AllowedOrigins: `https://your-domain.com`（开发阶段可放宽）
- ExposeHeaders: （可选）`ETag`
