# Next.js 改造实施方案：单句字幕翻译改为 Java 调用（强制统一，无开关）

目标很明确：**Next 端的单句字幕翻译（gen_srt）不再调用 Python，而是固定调用 Java 的新接口**，且不引入任何“配置开关/灰度开关”去决定走哪条链路（即：代码层面强制统一走 Java）。

本文档基于现有仓库代码现状与 `docs_v2/howto/nextjs-subtitle-single-translate-api.md` 的接口定义，梳理出可直接落地的最小改造方案（KISS，避免大范围重构）。

---

## 1. 现状梳理（当前 Next 实际在跑的链路）

### 1.1 前端依赖的返回字段契约（不能破坏）

UI 读取翻译结果字段是硬编码的：`text_translated`。

- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx:346`
- `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/panel-audio-list.tsx:396`

因此：**不改前端 UI** 的前提下，Next API route 必须继续返回 `data.text_translated`。

### 1.2 前端调用的 Next API

前端调用的是 Next API route：

- `POST /api/video-task/generate-subtitle-voice`
- 路由实现：`src/app/api/video-task/generate-subtitle-voice/route.ts:40`

其中：

- `type === 'gen_srt'`：字幕段重翻译（也就是“单句字幕翻译”）
- `type === 'translate_srt'`：字幕 TTS 音频重生成（不在本次改造范围）

### 1.3 现状：gen_srt 在 Next 端走 Python Job

当 `USE_PYTHON_REQUEST` 为真时，`gen_srt` 会调用 Python Job：

- 分支入口：`src/app/api/video-task/generate-subtitle-voice/route.ts:77`
- 提交 Python job：`src/app/api/video-task/generate-subtitle-voice/route.ts:107`
- 写入 `vap_tr_job_id / vap_tr_request_key`（用于刷新恢复/轮询）：`src/app/api/video-task/generate-subtitle-voice/route.ts:142-147`

Python 封装与 URL：

- `pyOriginalTxtTranslateJobStart`：`src/shared/services/pythonService.ts:53`
- Python URL：`src/shared/services/pythonService.ts:61`（`/api/internal/subtitle/single/translate/jobs`）

UI 刷新恢复逻辑（用 `vap_draft_txt` 与 `vap_tr_job_id`）：

- 恢复草稿翻译：`src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx:189-192`
- 恢复待完成 job：`src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx:195-203`

---

## 2. 目标接口（Java 新接口，来自改造文档）

接口见：`docs_v2/howto/nextjs-subtitle-single-translate-api.md`

关键点摘要：

- Method：`POST`
- Path：`/video/api/nextjs/subtitle/single/translate`
  - 注意：仓库里 `JAVA_SERVER_BASE_URL` 由环境变量提供，且 `.env` 示例已包含 `/video` 前缀（例如 `...onrender.com/video`），因此 Next 端拼接应使用：
    - `${JAVA_SERVER_BASE_URL}/api/nextjs/subtitle/single/translate`
    - **不要再手动拼 `/video`，避免重复**
- 推荐通信：`Content-Type: text/plain` + body 密文
  - 仓库现有加密实现：`src/shared/lib/EncryptionUtil.ts:96`（`encryptRequest`）
  - 仓库现有 Java text/plain 调用范式：`src/shared/services/javaService.ts:69-75`
- Request JSON（明文结构）：
  - `text`（必填）
  - `prevText`（可选）
  - `languageTarget`（必填）
  - `themeDesc`（可选）
- Response：
  - `ApiResponse.data.textTranslated`

---

## 3. 改造原则（不破坏 userspace）

1) **前端契约不变**：Next API route 对 UI 的响应仍然返回 `data.text_translated`。

2) **只改 gen_srt**：`translate_srt`（TTS）链路保持不动，避免扩大影响面。

3) **不增加“选择走 Java/Python”的开关**：本次目标是“强制统一”，代码层面固定走 Java。

4) **保留现有 GET 轮询接口**：新链路不再产生 `gen_srt` jobId，但线上可能存在旧数据/刷新恢复时仍会用到（例如历史未完成的 Python job）。保留可避免破坏既有恢复逻辑。

---

## 4. 具体实施步骤（最小改动方案）

### Step 1：新增 Java 单句字幕翻译调用封装（复用 EncryptionUtil）

文件：`src/shared/services/javaService.ts`

新增函数建议签名（示例）：

```ts
export async function javaSubtitleSingleTranslate(args: {
  text: string;
  prevText?: string;
  languageTarget: string;
  themeDesc?: string;
}): Promise<{ textTranslated: string }>;
```

实现要点：

- URL：
  - `${JAVA_SERVER_BASE_URL}/api/nextjs/subtitle/single/translate`
- Headers：
  - `Content-Type: text/plain`
- Body：
  - `EncryptionUtil.encryptRequest({ ...args })`
- 错误处理（必须做，否则排障全靠猜）：
  - 即便 `HTTP != 200`，也尝试 parse JSON，优先透传 `message`。
  - 若返回体不是 JSON，则 fallback 为 `HTTP status/statusText` 的短错误。
- 返回值：
  - 返回 `data` 或直接返回 `{ textTranslated }`，由调用方映射为 `text_translated`。

### Step 2：修改 Next API route：gen_srt 分支固定改为调用 Java

文件：`src/app/api/video-task/generate-subtitle-voice/route.ts`

只改 `POST` 的 `type === 'gen_srt'` 分支（现为 Python job 提交）。

改造后的行为：

1) 仍保留现有鉴权/权限检查/扣费与幂等扣费 requestKey（不要动收费语义）：
   - requestKey 计算现状：`src/app/api/video-task/generate-subtitle-voice/route.ts:79-81`

2) 调用 Step 1 新增的 Java 翻译函数：
   - 入参映射：
     - `text`：现状的 `text`
     - `prevText`：现状的 `preText`
     - `languageTarget`：现状的 `languageTarget`
     - `themeDesc`：沿用空字符串即可（现状也是 `''`）

3) 成功时返回（保持 UI 契约不变）：

```ts
return respData({ text_translated: textTranslated });
```

4) 成功时写入草稿翻译到 `vt_task_subtitle.subtitle_data`，用于刷新恢复（对齐 UI 既有恢复逻辑）：

- 写入字段建议：
  - `vap_draft_txt: textTranslated`
  - 清理 job 标记（避免 UI 误判存在 pending job）：
    - `vap_tr_job_id: null`
    - `vap_tr_request_key: null`
  - `vap_tr_updated_at_ms: Date.now()`
- 现有原子 patch 工具：`patchSubtitleItemById`（`src/shared/models/vt_task_subtitle.ts:128`）

5) 失败时：
   - 退还扣过的积分（与现有 Python submit fail 的语义对齐）
   - `respErr(javaMessage)`：把 Java 的 `message` 尽可能原样带回（别吞掉）

### Step 3：保持 GET 轮询接口不动（兼容历史数据）

文件：`src/app/api/video-task/generate-subtitle-voice/route.ts`

原因：

- 新链路 `gen_srt` 不再生成 jobId，正常路径不会触发 GET。
- 但历史上写进 DB 的 `vap_tr_job_id` 仍可能被 UI 恢复逻辑拿来轮询（刷新/恢复场景）。
- 保持 GET 逻辑可避免破坏线上已有的“恢复 pending job”体验。

---

## 5. 验证标准（最低可接受）

### 5.1 手工验证（必须）

在字幕编辑页触发 `gen_srt`（字幕段重翻译）：

1) 成功后 UI 文本更新（基于 `text_translated`）
2) 刷新页面后仍能恢复草稿翻译（基于 `vap_draft_txt`）

对应代码点：

- UI 读取 `text_translated`：见 1.1
- UI 恢复 `vap_draft_txt`：`src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx:189-192`

### 5.2 接口验证（建议）

直接调用 Next route（仅验证返回字段稳定）：

- `POST /api/video-task/generate-subtitle-voice`
- body：`{ type:'gen_srt', text:'...', preText:'...', subtitleName:'...', taskId:'...', languageTarget:'zh' }`
- 预期：`code === 0` 且 `data.text_translated` 非空

### 5.3 单测（推荐但不强制写在第一步就做）

建议补 1 个 vitest 测试覆盖：

- Java 成功：route 返回 `text_translated`
- Java 失败：route 退还积分并返回错误 message

现有 route 测试写法参考：`tests/integration/video-task-add-run.test.ts`

---

## 6. 回滚策略（因为你要求“无开关”）

不增加任何 provider/灰度配置的结果就是：**回滚只能靠回退代码并重新发布**。

这不是建议，这是现实。

---

## 7. 风险清单（别等炸了才承认）

1) `JAVA_SERVER_BASE_URL` 是否包含 `/video`：
   - 当前 `.env` 示例包含（例如 `.../video`），所以实际调用拼接必须避免重复 `/video`。
2) 加密密钥一致性：
   - Next 侧使用 `ENCRYPTION_SECRET`（见 `src/shared/cache/system-config.ts:10`）
   - Java 侧必须使用同一套协议与 secret，否则会出现“全失败但看不懂”的问题。
3) 错误透传：
   - Java 失败常见是 HTTP 非 200，但 body 仍是 `ApiResponse`；不 parse message 会严重影响排障效率。

---

## 8. 不在本次范围（避免无谓扩散）

- `translate_srt`（TTS）迁移到 Java：不做。
- 删除 Python 代码/清理旧字段：不做（除非后续明确要求，否则属于无收益 churn）。
