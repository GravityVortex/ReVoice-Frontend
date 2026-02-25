# Next.js 接口改造：单句字幕翻译（迁移到 Java）

本文档描述 Next.js 从 **Python 单句字幕翻译接口** 迁移到 **video-tools(Java) 内部实现** 后，需要做的接口改造点。

对应后端迁移方案：`docs/subtitle-single-translate-migration.md`

---

## 1. 新接口概览

- **Method**：`POST`
- **Path**：`/video/api/nextjs/subtitle/single/translate`
  - 注意：video-tools 配置了 `server.servlet.context-path: /video`，因此对外请求路径需要带 `/video` 前缀。
- **通信安全**：
  - 推荐沿用项目既有加密协议：`Content-Type: text/plain` + body 密文（见 3.2）
  - 若 `encryption.enabled=false`（仅建议本地调试），可直接发送 `application/json` 明文

---

## 2. 请求与响应

### 2.1 Request（明文 JSON 结构）

```json
{
  "text": "当前字幕段文本",
  "prevText": "上一条字幕段文本（可选）",
  "languageTarget": "zh",
  "themeDesc": "主题描述（可选）"
}
```

字段说明：
- `text`：必填，当前字幕段文本
- `prevText`：可选，上一条字幕段文本（用于上下文连贯）
- `languageTarget`：必填，目标语言码（建议保持 `zh/en` 等短码）
- `themeDesc`：可选，视频主题/上下文描述（用于提升翻译一致性）

### 2.2 Response（成功）

HTTP 200，返回 `ApiResponse`：

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "textTranslated": "翻译后的文本"
  },
  "timestamp": "..."
}
```

### 2.3 Response（失败）

失败时 **HTTP status 非 200**，body 仍为 `ApiResponse`（`data=null`）：

```json
{
  "code": 502,
  "message": "Upstream error (SiliconFlow): status=500",
  "data": null,
  "timestamp": "..."
}
```

常见状态码：
- 400：请求参数错误；或 `X-Request-Deadline-Ms` 非法
- 408：客户端 deadline 已过期（可选，见 3.3）
- 429：上游限流（SiliconFlow 429/403 重试耗尽）
- 502：上游返回 4xx/5xx 或响应不可解析
- 504：网络/超时类失败（重试耗尽）

---

## 3. Next.js 调用方式

### 3.1 明文请求（仅建议本地调试）

```ts
const url = `${JAVA_BASE_URL}/video/api/nextjs/subtitle/single/translate`;
const data = { text, prevText, languageTarget, themeDesc };

const resp = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const json = await resp.json();
if (!resp.ok) throw new Error(json?.message ?? `HTTP ${resp.status}`);
return json.data.textTranslated;
```

### 3.2 加密请求（推荐）

video-tools 对 `/api/nextjs/**` 的 POST/PUT 支持密文请求体，Java 侧由 `EncryptionFilter` 自动解密。

要求：
- `Content-Type: text/plain`
- `body` 为密文字符串：`EncryptionUtil.encryptRequest(secret, data)` 的输出

示例（伪代码，复用你们已有的 `EncryptionUtil`）：

```ts
const url = `${JAVA_BASE_URL}/video/api/nextjs/subtitle/single/translate`;
const data = { text, prevText, languageTarget, themeDesc };
const encryptedBody = EncryptionUtil.encryptRequest(data);

const resp = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: encryptedBody,
});

const json = await resp.json();
if (!resp.ok) throw new Error(json?.message ?? `HTTP ${resp.status}`);
return json.data.textTranslated;
```

加密协议与实现参考：
- `docs/requirements/2025-12-07-Java与NextJS加解密通信.md`
- Java：`src/main/java/com/skytech/videotools/config/EncryptionFilter.java`

### 3.3 可选：deadline header（避免无意义的超时请求）

可选 header：
- `X-Request-Deadline-Ms`: epoch 毫秒时间戳（绝对 deadline）

行为：
- 缺失/空：不启用
- 非法（非整数或 <=0）：HTTP 400
- 已过期：HTTP 408，message 类似 `Client deadline exceeded (X-Request-Deadline-Ms)`

---

## 4. 迁移步骤（建议顺序）

1) Next.js 增加一个新的 Java 调用方法（不要直接改老方法，便于回滚）
2) 灰度切换：在单句翻译的调用点切到 Java 新接口
3) 观察失败码分布（429/502/504）与耗时
4) 稳定后删除旧的 Python 单句翻译调用逻辑

---

## 5. 自检（给前端同学的最小验证）

### 5.1 curl（明文）

```bash
curl -sS -X POST 'http://<JAVA_BASE>/video/api/nextjs/subtitle/single/translate' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello","prevText":"Hi","languageTarget":"zh","themeDesc":""}'
```

验收：
- HTTP 200 + `data.textTranslated` 非空

