# 架构与端到端链路（看完就知道边界）

> 最后校验：2026-03-04  
> 目标：让研发/产品对齐“哪些能力在 Web、哪些在 Java、哪些在 Python”。

---

## 1) 系统组件（容器级）

```text
[Browser]
  |
  | 1) Upload Multipart (presigned)
  v
[Next.js Web/BFF] ----> [Postgres]
  |   \                 (DB 真相源)
  |    \
  |     \  encrypted text/plain
  v      v
[Java video-tools] ----> [Cloudflare R2]
  |
  | submit jobs / callbacks
  v
[Python VAP/TTS/Speaker]
```

角色分工（关键）：

- Next.js（本仓库）：UI + BFF（`src/app/api/**`）+ 业务 DB 读写（积分/任务/字幕等）
- Java（video-tools）：R2 控制面（预签名/multipart）、任务调度、Python 内部回调落库
- Python（VAP/TTS/Speaker）：重计算数据面（翻译、TTS、合成），通过 Java internal 获取预签名

---

## 2) 三条“必须不变”的系统契约

1) **DB 为真相源**

- 前端禁止用 HEAD/Range 等方式探测 R2 对象是否存在
- “成品是否就绪”以 DB 的成品清单为准（例如 `vt_file_final`）

2) **id 体系不可乱**

- `fileId`：上传与原始文件记录锚点（也影响 R2 key）
- `taskId`：任务幂等锚点（也影响合成恢复、外部 job id 对齐）

3) **multipart key 合同**

- 前端传给网关/Java 的 key 必须严格满足：
  - `{userId}/{fileId}/original/video/video_original.mp4`
  - 校验逻辑在 `src/shared/lib/multipart-upload-contract.ts`

---

## 3) 端到端链路 A：上传 -> 创建任务 -> 进度 -> 下载

### 3.1 上传（Browser 直传 R2，Next/Java 不搬运大文件）

```text
Browser -> Next.js JSON 网关 -> Java(加密) -> presigned URLs
Browser -> R2 (PUT parts)
Browser -> Next.js complete -> Java complete
```

相关入口：

- Next.js：`src/app/api/storage/multipart/*`
- Java 调用封装：`src/shared/services/javaR2Multipart.ts`

### 3.2 创建任务（写库 + 扣积分）

入口：`POST /api/video-task/create`  
实现：`src/app/api/video-task/create/route.ts`

关键动作：

- `consumeCredits(...)` 扣积分（按时长 + `vt_system_config.credit.points_per_minute`）
- 写 `vt_file_original`
- 写 `vt_task_main`（初始 `pending`，并按订阅/活动 entitlement 调整 `priority`）

### 3.3 任务进度（DB 为主，Java 可选增强）

入口：`GET /api/video-task/getTaskProgress`  
实现：`src/app/api/video-task/getTaskProgress/route.ts`

- 基础进度：读 DB `vt_task_main`
- steps 明细：可选转发 Java 缓存聚合状态（用于降低 DB 压力）

### 3.4 下载（只信 DB 就绪清单）

入口：`GET /api/video-task/download-video`  
关键约束：

- 前端不探测 R2；以 `vt_file_final` 作为“可下载清单”
- 下载 URL 的签名由 Java 生成（统一控制面）

---

## 4) 端到端链路 B：字幕编辑闭环（单段重生成 -> 合成新视频）

典型入口：

- 单句翻译/单段音频重生成：`src/app/api/video-task/generate-subtitle-voice/route.ts`
- 合成新视频（job 化 + 可恢复）：`src/app/api/video-task/generate-video/route.ts`

关键点：

- 合成任务元信息会写入 `vt_task_main.metadata.videoMerge`
- 依赖 `Idempotency-Key` 防止重复合成

---

## 5) 两种 Python 运行形态（需求评审必须点名是哪种）

系统同时支持：

1) Modal Job（生产常用）：Java 提交 job，Python worker 拉起执行
2) 本地/RunPod FastAPI（调试常用）：直接以服务形式对外暴露

对需求的影响：

- 超时/重试策略
- 并发门禁位置
- 回调与可观测性

