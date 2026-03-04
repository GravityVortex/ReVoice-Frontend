# ReVoice 视频翻译系统知识库（总览）

> 生成日期：2026-03-04  
> 覆盖范围：前端（Next.js）/ Java 后端（video-tools）/ Python v-a-processing / Python TTS / Python 说话人分割


## 🎯 阅读顺序（推荐）

1. `00-system-architecture.md`：总体架构图 + 端到端时序（两种部署形态）
2. `60-data-and-storage.md`：DB 表职责 + R2 路径规范（系统的“契约”）
3. 子系统拆解
   - `10-frontend-nextjs.md`
   - `20-backend-java-video-tools.md`
   - `30-python-vap.md`
   - `40-python-tts.md`
   - `50-python-speaker-diarization.md`
4. 运维与安全
   - `70-deployment-and-ops.md`
   - `80-security-and-secrets.md`
   - `90-troubleshooting-faq.md`


## 🧩 系统组件一览（容器级）

- 浏览器：上传文件、发起任务、编辑字幕、下载结果
- Next.js（`ReVoice-web-shipany-two`）：UI + BFF + 部分业务读写 DB
- Java（`video-tools`）：任务调度、R2 控制面、Python 内部回调入口、加密网关、积分/订阅相关任务
- Python VAP（`ReVoice-v-a-processing`）：视频翻译端到端编排与处理流水线
- Python TTS（`ReVoice-tts`）：语音合成（批量/单条/字幕片段重生成闭环）
- Python Speaker（`ReVoice-speaker-reg`）：说话人分割（diarization）
- 外部依赖：Supabase Postgres、Cloudflare R2（公桶/私桶）、SiliconFlow（LLM 翻译）、Stripe（订阅/支付）、Modal/RunPod（GPU 运行时）


## 🔑 核心不变量（务必统一）

- `task_id`：端到端幂等键（Modal Job 模式下 `job_id == task_id`）
- **DB 为真相来源**：前端禁止通过 HEAD/Range 探测 R2 对象存在性；成品就绪以 `vt_file_final` 为准（由 Java 写入）
- R2 路径：区分 **file-scope**（按 `originalFileId` 复用）与 **task-scope**（按 `taskId` 独立），详见 `60-data-and-storage.md`

