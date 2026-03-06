# 术语表（对齐研发/需求）

> 最后校验：2026-03-04

---

## 核心 id

- `userId`：用户主键（Auth 系统）
- `fileId`：原始文件 id（对应 `vt_file_original.id`）
- `taskId`：任务 id（对应 `vt_task_main.id`）

---

## 任务与产物

- `vt_file_original`：原视频文件元信息
- `vt_task_main`：任务主表（状态、优先级、进度、metadata）
- `vt_task_subtitle`：字幕结构化数据（json）
- `vt_file_final`：最终产物清单（前端下载/展示只信它）
- `vt_file_task`：任务中间产物索引（按 task/step -> r2 key）

---

## 配置

- env：部署时注入（DB/服务地址/密钥）
- `config` 表：后台可编辑配置（支付/OAuth/开关）
- `vt_system_config`：视频链路运行参数（积分单价、R2 base url 等）

---

## 计费

- credits（积分）：以 `credit` 表流水体现（grant/consume）
- subscription（订阅）：`subscription` 表记录 provider 订阅与账期
- order（订单）：`order` 表记录支付创建与回调结果

