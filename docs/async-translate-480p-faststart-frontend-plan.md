# 异步翻译任务（前端）：优先 480p + 自动回退（差网可拖动）实施改造方案

作者视角：别把“体验优化”做成 breaking change。旧任务没有 480p 文件是常态，前端必须能自动回退。

适用仓库：

- 前端：`/Users/dashuai/webProjects/ReVoice-web-shipany-two`
- 控制面（Java）：`/Users/dashuai/IdeaProjects/video-tools`
- 后端（Python）实施文档另见：`/Users/dashuai/PycharmProjects/ReVoice-v-a-processing/docs/async-translate-480p-faststart-plan.md`

---

## 1. 背景与目标

需求非常直接：

- 后端会新增 480p（全长原片/全长无声原片/预览/成品）并做 `faststart`，让 MP4 在差网也能更快起播、并支持拖动 seek。
- 前端需要“优先加载 480p”，并且 **旧任务/失败场景必须自动回退到旧 key**，避免 404 或编辑器不可用。

前端侧真正要交付的是两件事：

1) **默认用 480p**（更小体积、更快首帧、更好拖动）。
2) **自动回退**（历史数据、best-effort 产物缺失、或者 480p 生成失败都不影响使用）。

---

## 2. 后端产物契约（前端依赖）

说明：以下都是“相对 key”，真实访问通过 Java 统一签名（私桶）或走既有 `/api/storage/privater2-url` 获取 signed URL。

### 2.1 既有 key（必须继续可用，不改名）

- 无声视频（原分辨率）：`split_audio_video/video/video_nosound.mp4`
- 成品（真实码率）：`merge_audio_video/video/video_new.mp4`
- 预览：`preview/video/video_new_preview.mp4`（key 不变；后端会把它改为 480p+faststart 的 60s 预览）

### 2.2 新增 key（480p + faststart；可能缺失，必须回退）

- 全长原片 480p（带音频）：`original/video/video_original_480p.mp4`
- 全长无声原片 480p（编辑器用）：`split_audio_video/video/video_nosound_480p.mp4`
- 成品 480p：`merge_audio_video/video/video_new_480p.mp4`

scope（路径前缀）约定（用于“同一原视频多次翻译可复用”）：

- file-scope（同一 `originalFileId` 共享）：
  - `original/video/video_original_480p.mp4`
  - `split_audio_video/video/video_nosound_480p.mp4`
- task-scope（每次 `taskId` 独立）：
  - `merge_audio_video/video/video_new_480p.mp4`
  - `preview/video/video_new_preview.mp4`

### 2.3 前端拼接规则（当前代码约定）

当前通用拼接函数：

- `getVideoR2PathName(userId, id, r2Key) -> "${userId}/${id}/${r2Key}"`：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/shared/lib/utils.ts:135-143`
  - task-scope：`id=taskId`
  - file-scope：`id=originalFileId`

因此“候选 key”应按优先级构造为：

- 成品播放：`merge_audio_video/video/video_new_480p.mp4` -> 回退 `merge_audio_video/video/video_new.mp4`
- 编辑器无声视频：
  - primary（file-scope，`originalFileId` 前缀）：`split_audio_video/video/video_nosound_480p.mp4`
  - fallback（task-scope，`taskId` 前缀）：`split_audio_video/video/video_nosound.mp4`
- 原片查看（file-scope，`originalFileId` 前缀）：`original/video/video_original_480p.mp4` -> 回退 `original/video/video_original.mp4`

注意：旧任务上 480p key 很可能不存在；**一开始就得按“可能缺失”设计**。

### 2.4 生产级“就绪契约”（禁止 probe，DB 为准）

你已明确担心 CF/R2 请求次数限制：因此 **不允许**前端通过 `HEAD` / `Range GET` 去探测对象是否存在（这是额外请求，规模上来必超限）。

前端应以 DB 为准（`vt_file_final`）：

- `fileType=video`：真实码率成品（`merge_audio_video/video/video_new.mp4`），语义不变
- `fileType=video_480p`：成品 480p（`merge_audio_video/video/video_new_480p.mp4`）
- `fileType=nosound_480p`：无声 480p（`split_audio_video/video/video_nosound_480p.mp4`，**file-scope：用 `originalFileId` 前缀**）
- `fileType=preview`：预览（key 不变，但内容为 60s 480p+faststart；后端有失败兜底）

> 依赖：Java 必须在“上传完成后”把 `video_480p/nosound_480p` upsert 到 `vt_file_final`，否则前端无法做到“零探测、零 404 试错”的确定性选择。

---

## 3. 前端实施方案（按模块拆解）

### 3.1 共通原则：优先 480p，失败立刻回退

前端不要做“重试三次、指数退避”这种花活；视频加载失败时最有效的兜底策略就是 **换源回退**。

建议实现方式（最小且可复用）：

- 统一让播放器组件支持 `candidates: string[]`（按优先级排列）
- 播放逻辑：
  1) 取 candidates[0] -> 拉取 signed url -> 设置 `<video src=...>`
  2) `<video onError>` 触发 -> 切到 candidates[1]（如果存在）重复上述步骤

这样：

- 列表页/项目页/弹窗/按钮复用同一套回退策略
- **存在性判断**不靠探测：由 DB（`vt_file_final`）决策是否把 480p 放进 candidates（避免额外请求/404）

### 3.2 播放弹窗：VideoPlayerModal 支持候选 key + onError 回退

已实现（代码现状）：

- `VideoPlayerModal` 已支持 `videoUrlCandidates?: string[]` + `<video onError>` 自动回退
- 并设置了 `preload="metadata"`

文件：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/shared/components/ui/video-player-modal.tsx`

### 3.3 列表页播放：默认使用成品 480p key

目标：

- 列表页要“默认快”：优先 480p（体积小、首帧快、seek 更稳）
- 但不能靠“先 480p 再 404 回退”当主流程（会制造额外请求/异常路径）

生产级做法（DB 为准）：

1) `/api/video-task/list` 在返回 tasks 时注入每个 task 的 `finalFileList`（读取 `vt_file_final`）
2) 列表页播放时：
   - 若 `finalFileList` 存在 `fileType=video_480p`，primary 用其 `r2Key`
   - 否则 primary 直接用 `fileType=video`（真实码率成品）
3) 仍然保留 `videoUrlCandidates` 的 fallback（兜底，不当主流程）

同样逻辑需要同步到 dashboard projects 列表页：

- `/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/dashboard/projects/page.tsx:54-63`

### 3.4 项目详情页播放：result 模式优先 480p

现状：

- 详情页从 DB 的 `finalFileList` 里找 `fileType === 'video'` 得到 r2Key：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/shared/blocks/video-convert/project-detail-view.tsx:370-375`

改造建议（生产级，依赖 DB 就绪契约）：

- result 模式：
  - 若 `finalFileList` 存在 `fileType=video_480p`，使用其 `r2Key`
  - 否则使用 `fileType=video`（避免 404 试错）
- preview 模式继续用 `preview/video/video_new_preview.mp4`（key 不变，后端会保证 480p+faststart，且有兜底）
- original 模式（可选增强）：增加一个“原片 480p”按钮或候选源：
  - `original/video/video_original_480p.mp4` -> 回退 `original/video/video_original.mp4`

文件：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/shared/blocks/video-convert/project-detail-view.tsx`

### 3.5 编辑器：无声视频默认用 480p（但不改 ConvertObj 结构）

现状：

- 编辑器接口直接拼无声 key 并请求 Java 签名，最终返回 `noSoundVideoUrl`（一个已签名的 HTTP URL）：
  - 拼 key：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/api/video-task/editVideoAudiosubtitleDetail/db-data.ts:72-90`
  - 返回结构包含 `processDurationSeconds/noSoundVideoUrl/...`：`.../db-data.ts:161-184`
- 编辑器侧直接用 `convertObj.noSoundVideoUrl`：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/page.tsx:467-474`

改造目标：

- 不大改编辑器 UI（它复杂、容易回归出问题）
- 仍然只返回一个 `noSoundVideoUrl` 字段，但该字段优先指向 480p 无声视频

生产级建议（必须按 2.4 做，禁止 probe）：

1) Next route 先查 `vt_file_final`：
   - 若存在 `fileType=nosound_480p`，取其 `r2Key` 作为无声源
   - 否则回退 `split_audio_video/video/video_nosound.mp4`
2) 只签名“最终选择”的那一个 key（不签两个，不探测对象存在性）
3) 最终仍然只返回一个 `noSoundVideoUrl`

落点文件：

- `/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/api/video-task/editVideoAudiosubtitleDetail/db-data.ts`

补充（给“视频编辑/查看”用的原片 480p）：

- 可以在该接口返回中额外追加一个可选字段（不破坏既有 consumers），例如：
  - `originalVideo480pUrl`（同样走 Java 签名 + HEAD 判定存在）
  - UI 后续加一个“查看原片（480p）”按钮即可

### 3.6 下载接口：默认真实码率，允许下载 480p

现状：下载 API 写死签 `video_new.mp4`：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/api/video-task/download-video/route.ts:44-51`

改造建议：

- 新增 query 参数：`variant=source|480p`
  - 默认 `source`：签 `merge_audio_video/video/video_new.mp4`（保持旧行为）
  - `variant=480p`：签 `merge_audio_video/video/video_new_480p.mp4`
- 如果 480p 不存在：**API 内部回退**到 source（与“DB 为真相来源”的策略一致，避免用户点下载得到 404）

文件：`/Users/dashuai/webProjects/ReVoice-web-shipany-two/src/app/api/video-task/download-video/route.ts`

---

## 4. 验证与验收（前端）

### 4.1 兼容性回归（必须过）

- 打开一个历史任务（无 480p 文件）：编辑器能正常加载无声视频（走回退），列表页/项目页能播放（走回退）。
- 新任务产出 480p 后：默认播放/编辑加载走 480p（更快首帧）。

### 4.2 seek/差网体验验证（建议做法）

- 浏览器 DevTools -> Network：
  - 观察 `<video>` 请求是否出现 `Range:` 请求头（拖动时应出现分段拉取）
  - 响应需包含 `206 Partial Content`（这属于存储/CDN能力，但前端要验证）
- 拖动测试：
  - 新任务：默认 480p 源，拖动到中间位置应在可接受时间内恢复播放
  - 回退源（真实码率）仍能播放（即便体验差一点也不能坏）

---

## 5. 风险与回滚

风险：

- 480p 产物是 best-effort：缺失是常态；如果前端没写回退，会直接把历史任务打爆。
- 如果前端用 probe/探测去判断 480p 是否存在：会额外消耗 CF/R2 请求次数，用户量上来后是确定性风险（禁止）。

回滚（确保随时能撤回体验优化）：

- 播放端：把默认 primary key 改回 `video_new.mp4`，但保留回退逻辑（这样未来恢复 480p 也不需要再改）。
- 编辑器端：把 `noSoundVideoUrl` 的优先顺序改回 `video_nosound.mp4`（无需 probe）。
