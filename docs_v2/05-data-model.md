# 数据模型（表结构 + 真相源）

> 最后校验：2026-03-04  
> 单一来源：`src/config/db/schema.ts`（以代码为准，本文是面向理解的摘录与口径）。

---

## 1) 三类“配置”

1) **环境变量（env）**：部署时注入，决定运行时依赖（DB、Java/Python 地址等）  
2) **`config` 表**：后台可编辑的业务配置（支付/OAuth/开关/默认 provider 等）  
3) **`vt_system_config` 表**：与视频链路强相关的运行时参数（积分单价、R2 base url 等）

详见：`07-config-and-settings.md`

---

## 2) 视频翻译核心表（vt_*）

### `vt_file_original`（原始视频文件元信息）

用途：用户上传的“原视频”记录。

关键字段（常用）：

- `id`：fileId（上传链路锚点）
- `user_id`
- `r2_key` / `r2_bucket`
- `video_duration_seconds`
- `checksum_sha256`
- `upload_status`

主要写入方：Web（本仓库）  
典型写入：`src/app/api/video-task/create/route.ts`

### `vt_task_main`（任务主表）

用途：视频翻译任务状态机与调度信息。

关键字段：

- `id`：taskId
- `original_file_id`：关联 `vt_file_original.id`
- `status`：`pending/processing/completed/failed/...`（以代码与 Java 回调为准）
- `priority`：调度优先级（小值优先）
- `progress/current_step/error_message`
- `credit_id/credits_consumed`
- `metadata`：包含合成恢复信息等

主要写入方：

- Web：创建任务/更新部分元信息
- Java：调度与回写（视实现而定）

### `vt_task_subtitle`（字幕数据）

用途：字幕结构化 JSON（支持原字幕/译文/草稿等场景）。

关键字段：

- `task_id`
- `step_name`：字幕所属处理阶段
- `subtitle_data`：json

主要写入方：Web（编辑闭环）、Java/Python（pipeline 产出）  

### `vt_file_final`（最终产物清单）

用途：对前端暴露“哪些成品可下载/预览”的**真相源**。

关键字段：

- `task_id`
- `file_type`：例如最终视频/字幕等（以业务约定为准）
- `r2_key/r2_bucket`
- `download_count/last_downloaded_at`

主要写入方：通常由 Java 在 pipeline step 完成时写入（以实现为准）  
前端下载只应依赖它（不要探测 R2）。

### `vt_file_task`（任务中间文件/步骤文件）

用途：pipeline 中间产物的索引（按 task/step 关联到 R2 key）。

---

## 3) 计费相关表（order/subscription/credit）

### `order`

用途：支付订单与支付回调落库。

### `subscription`

用途：订阅状态与账期；与“每期赠送积分”等逻辑相关。

### `credit`

用途：积分流水（grant/consume），并用 `remaining_credits` 做 FIFO 消耗。

---

## 4) 账号与权限（Auth/RBAC）

Auth（better-auth）相关：

- `user`
- `session`
- `account`
- `verification`

RBAC：

- `role`
- `permission`
- `role_permission`
- `user_role`

---

## 5) 内容与 AI（非视频核心但常被忽略）

内容：

- `taxonomy`
- `post`

AI：

- `ai_task`
- `chat`
- `chat_message`

---

## 6) 重要说明：部分表可能在其它仓库（需要对齐口径）

架构文档中常见的 `vt_task_steps` / `vt_task_log` 在本仓库的 `schema.ts` 未定义；
若你的需求涉及 steps/log 细粒度展示，请先确认这些表是否由 Java 仓库创建与维护，
以及 Web 端要如何读取（DB 直读 / Java 聚合 API / 两者混合）。

