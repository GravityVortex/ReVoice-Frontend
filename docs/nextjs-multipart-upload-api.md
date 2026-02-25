# Next.js 分片上传对接接口文档（R2 Multipart Upload）

**文档版本**: v1.3  
**创建日期**: 2026-02-04  
**最后更新**: 2026-02-04  
**状态**: ✅ 已确认

---

## 1. 范围与架构

本文件只描述**原视频上传**的分片上传（S3 Multipart Upload）对接，包含两层接口：

1) **浏览器（前端） → Next.js API Route**：前端页面只调用 Next.js，自带用户认证（Session）。  
2) **Next.js API Route → Java 后端**：Next.js 作为网关，用加密请求（`text/plain`）调用 Java 的 multipart 控制面。

> 约束：浏览器不直接调用 Java；浏览器只用 presigned URL 直传 R2（这是上传数据面）。

---

## 2. 术语与关键约定

### 2.1 关键字段

- `uploadId`：S3 Multipart Upload 的上传会话 ID（initiate 返回）。
- `fileId`：原视频文件 ID（由 Java 生成 UUID，用于后续任务与文件定位）。
- `keyV`：固定为 `original/video/video_original.mp4`。
- `key`（对外 key，不带 env）：`{userId}/{fileId}/{keyV}`
- `fullKey`（R2 实际 key）：`{envPrefix}/{key}`
- `partNumber`：分片序号，从 1 开始，最大 10000。
- `etag`：每个分片上传成功后返回的 ETag（浏览器通常拿不到，见 2.4）。

### 2.2 key / fullKey / envPrefix（必须写死的契约）

为避免“谁加前缀/加几次”导致对象路径错乱，本项目规定：

- **Next.js → Java**：永远传 `key`（不带 env 前缀）；Next.js **禁止**自行拼 `fullKey`。
- **Java → R2**：Java 内部统一用 `fullKey={envPrefix}/{key}` 以及同一个 bucket 进行：
  - CreateMultipartUpload
  - presign UploadPart
  - ListParts（必须分页拉全：`maxParts<=1000`，循环直到 `isTruncated=false`，使用 `partNumberMarker/nextPartNumberMarker`）
  - CompleteMultipartUpload
  - AbortMultipartUpload
  - presign GetObject（用于预览/校验）

### 2.3 envPrefix 的来源与取值集合

当前实现中：

- `envPrefix` 来自 Java 配置 `CloudflareR2Config.environment`，其值由 `spring.profiles.active` 注入（对应环境变量 `SPRING_PROFILES_ACTIVE`，默认 `dev`）。
- 约束：`envPrefix` 必须是单段字符串（不允许包含 `/`），推荐只使用：`dev` / `test` / `prod`。
- 如果你使用了多个 Spring profile（例如 `prod, render`），则 **envPrefix 取规则如下**：
  - 按 `,` 分割后 `trim()`
  - 取第一个**非空**的 segment 作为 `envPrefix`
  - 示例：`"prod, render"` -> `prod`

> 说明：把 Spring profile 直接当作对象前缀是现有系统约定；如果未来要与 profile 解耦，应新增独立配置项（另开需求文档，不在本方案里扩展）。

### 2.4 ETag 可见性（重要）

浏览器 PUT 分片到 R2 后，服务端会返回 `ETag` 响应头；但若 R2 CORS 未 `ExposeHeaders: ETag`，浏览器代码通常**读不到**。

因此本方案规定：

- `complete` 接口**不要求**前端提供 `etag`；
- Java 在 `complete` 时**始终**调用 `ListParts` 拉取 parts+ETag，再执行 `CompleteMultipartUpload`。

### 2.5 分片规则（S3 规则，必须遵守）

- `partNumber` 从 1 开始递增；
- **除最后一片外，每片 >= 5MB**；
- 最大 10,000 片（`chunkSize * 10000` 决定最大支持文件大小）。

### 2.6 ETag 格式（对外统一）

为了避免前端/网关反复 `replace("\"","")`，本项目约定：

- 对外接口（Next.js 对浏览器、Java 对 Next.js）中的 `etag` **统一不带首尾引号**。
- Java 内部调用 S3 `CompleteMultipartUpload` 使用的 ETag 视 S3 返回为准（实现细节由 Java 处理，调用方无需关心）。

### 2.7 DB 存储契约（任务链路必须一致）

本次分片上传只解决“把原视频放到 R2”这一件事，但任务链路必须能稳定定位原视频对象。

约定如下（推荐做法）：

- `vt_task_main.original_file_id`：存 `fileId`（来自 initiate 返回）。
- `vt_file_original`（若使用该表用于列表/追踪）：
  - `id`：`fileId`
  - `user_id`：当前用户 ID
  - `file_name`：上传文件名
  - `file_size_bytes`：浏览器文件大小（字节）
  - `file_type`：MIME（例如 `video/mp4`）
  - `r2_bucket`：私有桶名（与 Java 配置一致）
  - `r2_key`：只存 **keyV**（即 `original/video/video_original.mp4`），不要存 `key/fullKey`
  - `upload_status`：`pending/uploading/completed/failed`

后续需要拼出原视频对象的完整路径时：

- `fullKey = {envPrefix}/{userId}/{fileId}/{r2_key}`

职责划分（当前实现）：

- Java multipart 控制面**不写数据库**（只返回 `fileId/key` 等信息）。
- Next.js 在“上传完成/确认”时负责写入/更新 `vt_file_original`（以及创建任务时写入 `vt_task_main.original_file_id`）。

> 说明：Java 侧已有 `buildFilePath(userId, fileId)` + `r2_key` 的拼接逻辑；如果 DB 存了 fullKey，会导致重复前缀和历史迁移灾难。

关于 `r2_bucket` 的“真值来源”：

- 以 **Java 返回的 bucket** 为准（Java 负责对该 bucket 签名、并执行 multipart 控制面；Next.js 不应自行猜测 bucket）。
- Next.js 对外接口不接受 `bucket` 入参（防止客户端注入错误 bucket）。

---

## 3. 浏览器（前端）→ Next.js API Route（对外接口）

> 这些接口是前端页面调用的接口。**前端不传 `userId`**，由 Next.js 从 Session 中取真实 userId 注入到后端请求。

### 3.1 通用响应结构

本项目 Next.js 对外（浏览器）响应统一走一套 wrapper（与现有 `resp.ts` 一致）：

- **HTTP status**：统一返回 `200`（不使用 HTTP status 表达业务错误；以 body 的 `code` 为准）
- **body**：
  - 成功：`{ code: 0, message: string, data: ... }`
  - 失败：`{ code: -1, message: "...", data: null }`
 - `message` **不作为稳定契约**（可能是 `"ok"`/`"Success"`/其他文案）；调用方只依赖 `code` 与 `data`。

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

失败：

```json
{
  "code": -1,
  "message": "xxx",
  "data": null
}
```

落地提醒（必须遵守，否则直接解析失败）：

- 前端 uploader **必须先解包 wrapper**：只使用 `resp.data` 作为业务数据。
- 严禁把 `res.json()` 当成 data 直接用（否则 `resp.uploadId` 这类访问会直接 `undefined`）。

推荐写法（示例）：

```ts
type ApiResp<T> = { code: number; message?: string; data: T };

async function unwrap<T>(res: Response): Promise<T> {
  const resp = (await res.json()) as ApiResp<T>;
  if (resp.code !== 0) throw new Error(resp.message || "request failed");
  return resp.data;
}
```

### 3.2 Initiate：创建 multipart upload

**接口**：`POST /api/storage/multipart/initiate`  
**认证**：必须（Session）  
**请求**（JSON）：

```json
{
  "filename": "a.mp4",
  "contentType": "video/mp4"
}
```

**响应 data**：

```json
{
  "uploadId": "xxxx",
  "fileId": "uuid",
  "bucket": "zhesheng",
  "keyV": "original/video/video_original.mp4",
  "key": "user_xxx/uuid/original/video/video_original.mp4"
}
```

说明：

- `bucket` **必填**：提供给 Next.js 用于落库（`vt_file_original.r2_bucket`）；浏览器端一般不需要使用它。
- Next.js 写库时以 Java 返回的 `bucket` 为准，不依赖 Next.js 自身配置，也不接受浏览器传入 bucket。

### 3.3 Presign Part：为单个分片生成 presigned URL

**接口**：`POST /api/storage/multipart/presign-part`  
**认证**：必须（Session）  
**请求**（JSON）：

```json
{
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "partNumber": 1,
  "expiresInSeconds": 3600
}
```

**响应 data**：

```json
{
  "partNumber": 1,
  "presignedUrl": "https://...X-Amz-Signature=..."
}
```

约束与建议：

- `expiresInSeconds` 可不传；服务端会做范围收敛（例如 `60..86400`）。
- 不要把额外 header 强绑定到签名（否则浏览器端一旦 header 不一致就会 403）。
- Next.js 必须做前置校验：
  - `key` 必须以 `${session.userId}/` 开头
  - `key` 必须以 `/${keyV}` 结尾（`keyV=original/video/video_original.mp4`）
  - 必须拒绝 `..`（路径穿越）
  - 必须拒绝以 `/` 开头的 key
  - 必须保证 `{fileId}` 是单段（`{userId}/{fileId}/{keyV}` 中间段不允许包含 `/`）
  - 失败则直接返回 `code=-1`，不要把无效请求转发给 Java（减少排障噪音）

推荐演进（v2，不在本期强推）：

- 浏览器后续只传 `fileId + uploadId (+partNumber)`，`key` 由 Next.js 计算，彻底消灭“客户端乱传 key”的事故面。

### 3.4 UploadPart：浏览器直传分片到 R2（数据面）

**接口**：对 `3.3` 返回的 `presignedUrl` 执行 `PUT`  
**方法**：`PUT {presignedUrl}`  
**请求体**：分片二进制数据（chunk）  

建议：

- 不要设置多余 header（除非你确认不会影响签名）；通常只需要默认即可。
- PUT 成功判断：**任意 2xx 都算成功**（常见 200/204）；`ETag` 在响应头中但可能不可读。

### 3.5 Complete：完成合并

**接口**：`POST /api/storage/multipart/complete`  
**认证**：必须（Session）  
**请求**（JSON，`parts` 可选）：

```json
{
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "parts": [
    { "partNumber": 1, "etag": "etag-1" }
  ]
}
```

说明：

- `parts` 可以不传或传空；**服务端不会依赖它**（Java 会 ListParts 拉全量 parts）。
- 若 Java `ListParts` 拉到的 parts 为空（uploadId 下尚未上传任何分片），Java `complete` 返回 HTTP 400（body：`{code:400,message:\"No parts uploaded for this uploadId\"}`）；Next.js 网关需转换为 `code=-1`。
- Next.js 必须做前置校验：`key` 必须属于 `${session.userId}`（同 3.3 规则），否则直接 `code=-1` 拒绝。

**响应 data**：

```json
{
  "success": true,
  "bucket": "zhesheng",
  "keyV": "original/video/video_original.mp4",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "fileId": "uuid",
  "publicUrl": "https://... (预览用，实际上是短期可用的 presigned GET，建议 4h)"
}
```

### 3.6 Abort：取消 multipart upload

**接口**：`POST /api/storage/multipart/abort`  
**认证**：必须（Session）  
**请求**（JSON）：

```json
{
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4"
}
```

**响应 data**：

```json
{ "success": true }
```

Next.js 必须做前置校验：`key` 必须属于 `${session.userId}`（同 3.3 规则），否则直接 `code=-1` 拒绝。

### 3.7 ListParts（可选）：查询已上传分片

**接口**：`POST /api/storage/multipart/list-parts`  
**认证**：必须（Session）  
**请求**（JSON）：

```json
{
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4"
}
```

**响应 data**：

```json
{
  "parts": [
    { "partNumber": 1, "etag": "etag-1" }
  ]
}
```

语义（必须写死）：

- 对外 **永远返回全量 parts**（Next.js/Java 必须在服务端完成分页聚合；对外接口不分页）。
- 该接口用于续传/排障：调用方可以直接拿 `partNumber` 集合判断哪些分片已完成。
- `parts` 按 `partNumber` 升序返回；若未上传任何分片则返回空数组。

Next.js 必须做前置校验：`key` 必须属于 `${session.userId}`（同 3.3 规则），否则直接 `code=-1` 拒绝。

---

## 4. Next.js API Route → Java 后端（网关接口）

> 这些接口是 Next.js 服务端调用的接口（浏览器不应直连）。  
> Java 端会校验 `key` 必须属于当前 `userId`，并强制 `keyV` 固定值。

### 4.1 加密协议（必须遵守）

**触发条件**：Java 端对 `/api/nextjs/**` 的 `POST/PUT` 且 `Content-Type: text/plain` 执行解密。  
实现参见：

- `src/main/java/com/skytech/videotools/config/EncryptionFilter.java`
- `src/main/java/com/skytech/videotools/util/EncryptionUtil.java`

**加密格式**：`randomKey(8) + md5(32) + encryptedData(base64)`  

- `time` 字段（Unix 秒）是协议字段：必须存在；Java 会校验超时（默认 300 秒）。
- Java 解密后会移除 `time` 字段再交给 Controller。

> 注意：这是项目现有协议，别擅自改算法/格式，否则 Java 解密直接失败。

### 4.1.1 Java 响应与错误码约定（网关必须处理）

Java 对 Next.js 的响应使用项目统一 `ApiResponse`：

- 成功：HTTP `200`，body：`{ code: 200, message: "Success", data: ... }`
- 参数/权限类错误：HTTP `400/401/403`，body：`{ code: 400/401/403, message: "...", data: null }`
- 服务器错误：HTTP `500`，body：`{ code: 500, message: "Internal server error", data: null }`

Next.js 网关必须把上述错误统一转换成对外的 `{code:-1,message,data:null}`（HTTP 仍返回 200）。

### 4.2 Initiate

**接口**：`POST /api/nextjs/r2/multipart/initiate`  
**Content-Type**：`text/plain`（body 为加密串）  

加密前 JSON：

```json
{
  "userId": "user_xxx",
  "filename": "a.mp4",
  "contentType": "video/mp4",
  "time": 1738646400
}
```

响应：

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "uploadId": "xxxx",
    "fileId": "uuid",
    "bucket": "zhesheng",
    "keyV": "original/video/video_original.mp4",
    "key": "user_xxx/uuid/original/video/video_original.mp4"
  }
}
```

### 4.3 Presign Part

**接口**：`POST /api/nextjs/r2/multipart/presign-part`  

加密前 JSON：

```json
{
  "userId": "user_xxx",
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "partNumber": 1,
  "expiresInSeconds": 3600,
  "time": 1738646400
}
```

响应：

```json
{
  "code": 200,
  "message": "Success",
  "data": { "partNumber": 1, "url": "https://...X-Amz-Signature=..." }
}
```

### 4.4 Complete

**接口**：`POST /api/nextjs/r2/multipart/complete`  

加密前 JSON（`parts` 可省略）：

```json
{
  "userId": "user_xxx",
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "parts": [
    { "partNumber": 1, "etag": "etag-1" }
  ],
  "time": 1738646400
}
```

说明：

- Java 端当前实现会 **始终 ListParts（含分页）**，`parts` 参数仅用于兼容/调试，**不会影响 complete 行为**。
- 若 Java `ListParts` 拉到的 parts 为空（uploadId 下尚未上传任何分片），Java 返回 HTTP 400（body：`{code:400,message:\"No parts uploaded for this uploadId\"}`）。

响应：

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
    "downloadUrl": "https://... (建议 4h)"
  }
}
```

### 4.5 Abort

**接口**：`POST /api/nextjs/r2/multipart/abort`  

加密前 JSON：

```json
{
  "userId": "user_xxx",
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "time": 1738646400
}
```

响应：

```json
{ "code": 200, "message": "Success", "data": { "success": true } }
```

### 4.6 ListParts（可选）

**接口**：`POST /api/nextjs/r2/multipart/list-parts`  

加密前 JSON：

```json
{
  "userId": "user_xxx",
  "uploadId": "xxxx",
  "key": "user_xxx/uuid/original/video/video_original.mp4",
  "time": 1738646400
}
```

响应：

```json
{
  "code": 200,
  "message": "Success",
  "data": { "parts": [ { "partNumber": 1, "etag": "etag-1" } ] }
}
```

语义（必须写死）：

- Java 对 Next.js 的 `list-parts` **必须返回全量 parts**（服务端聚合分页结果；不允许只返回一页）。
- `parts` 按 `partNumber` 升序返回；若未上传任何分片则返回空数组。

### 4.7 Next 网关字段映射（必须明确）

为避免实现时“想当然”，网关字段映射在这里一次写死（前端按此解析）：

| 接口 | Java data | Next.js 对外 data | 说明 |
| --- | --- | --- | --- |
| initiate | `uploadId,fileId,bucket,keyV,key` | `uploadId,fileId,bucket,keyV,key` | 原样透传字段名；wrapper 不同 |
| presign-part | `partNumber,url` | `partNumber,presignedUrl` | **改名**：`url -> presignedUrl` |
| complete | `success,bucket,key,keyV,fileId,downloadUrl` | `success,bucket,key,keyV,fileId,publicUrl` | **改名**：`downloadUrl -> publicUrl`（临时可预览 URL） |
| abort | `success` | `success` | 原样透传 |
| list-parts | `parts[{partNumber,etag}]` | `parts[{partNumber,etag}]` | 原样透传；**必须是全量 parts**；`etag` 对外不带引号 |

同时约定：

- Next.js 对外统一使用 `{code:0/-1,message,data}` wrapper；HTTP status 固定 200。
- Java 对 Next.js 的响应保持 `{code:200/4xx/5xx,...}`，HTTP status 使用 200/4xx/5xx（Next.js 网关需要统一兜底为 `code=-1`）。

---

## 5. 常见失败原因（快速定位）

- `code=-1 key must start with userId/`：Next.js 注入的 userId 与 key 不匹配（越权/拼错）。
- `code=-1 keyV must be original/video/video_original.mp4`：keyV 不符合固定规范。
- `code=-1 请求已过期`：加密请求 `time` 超出 300s（Next.js 与 Java 机器时间漂移或请求积压）。
- `code=-1 complete failed`：通常是 uploadId 不存在/已 abort/权限不足；或某些 parts PUT 失败但前端以为成功。
