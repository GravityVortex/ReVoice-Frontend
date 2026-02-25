# SoulDub 定价策略实施任务清单（结合当前仓库）

基准文档：

- `docs/SoulDub定价策略.md`
- `docs/SoulDub定价策略-实施方案.md`

说明：

- 勾选口径：以“当前仓库代码是否已落地”为准；数据库真实结构需要在部署环境再做一次核对。
- 任务按端拆分：后端（Next.js/DB）/ 前端（Next.js UI）/ Java（调度执行）/ 运维与发布。

---

## A. 后端（Next.js API / DB）

- [x] 扣费口径服务端化：创建视频任务时按 `credit.points_per_minute` 扣费，分钟向上取整，积分不足直接拒绝（`src/app/api/video-task/create/route.ts`）。
- [x] create 失败不吞积分：若扣费成功但后续入库失败，best-effort 退回积分并软删除文件记录（`src/app/api/video-task/create/route.ts`）。
- [x] 编辑字幕/音频扣费：字幕段重翻译=1、音频段重生成=2，失败 best-effort 退回（`src/app/api/video-task/generate-subtitle-voice/route.ts`）。
- [x] 合成导出不扣积分：generate-video 不再接受客户端计费参数（`src/app/api/video-task/generate-video/route.ts`）。
- [x] 扣减顺序“先到期先用”+ 不用 OFFSET：按 `expiresAt asc nulls last` 扣减；过滤 `availableAt/expiresAt`（`src/shared/models/credit.ts`）。
- [x] 限时特惠（3 天）顺延 + “下一段才可用”：entitlement + purchase 两条 credit 记录，用 `availableAt` 表达（`src/shared/services/payment.ts`）。
- [x] 管理端加/删积分权限校验：`PERMISSIONS.CREDITS_WRITE`（`src/app/api/credit/add/route.ts`、`src/app/api/credit/delete/route.ts`）。

待做：

- [x] 充值积分 expiresAt 基准时间改为支付平台 `paidAt`（避免回调延迟造成有效期争议）：涉及 `calculateCreditExpirationTime()` 与 payment 发放链路（`src/shared/models/credit.ts`、`src/shared/services/payment.ts`）。
- [x] 数据库迁移/建表：你已确认数据库按当前 `schema.ts` 创建，因此 `credit.available_at` 已存在（若未来换库/重建，仍需核对该列）。
- [x] 代码清理：移除未使用/遗留的“配额类 configKey”（如 `quota.*.credits_per_30d`）（`src/shared/models/vt_system_config.ts`）。

保留问题（不在本次实现）：

- [ ] “不信任客户端视频时长”的强落地：目前 `videoDurationSeconds` 来自前端上传参数，存在被篡改少扣积分的理论风险（先记录风险，后续再立项）。

---

## B. 前端（Next.js UI）

- [x] 定价 SKU 已按新口径配置到 `pricing.json`（`src/config/locale/messages/zh/pricing.json`、`src/config/locale/messages/en/pricing.json`）。

待做（口径一致性）：

- [x] 清理所有 “2 积分/分钟” 的默认值/注释/展示：pointsPerMinute 默认兜底改为 3，且以 `/api/video-task/getconfig` 为准（`src/shared/blocks/video-convert/project-add-convert-modal.tsx`、`src/shared/blocks/video-convert/project-create-flow.tsx`）。
- [x] 删除/下线未引用的遗留组件（避免未来误用导致口径漂移）：`src/shared/blocks/video-convert/convert-add-modal.tsx`。

待做（样式与体验，按 frontend-design）：

- [x] 价格页（`/pricing`）视觉重做：从“紫色宇宙风”收敛到 SoulDub 的“配音棚/工作室”风格；强化限时特惠与订阅/充值差异点表达（不使用并发/队列数字）。
- [x] 费用预估/确认弹窗（CostEstimateModal）视觉对齐价格页风格；在“积分不足”场景引导去购买（不堆砌数字权益）。

---

## C. Java（任务调度/执行端）

待做（交付给 Java 端）：

- [ ] 定时任务（订阅月积分发放，含年付）：Java 直接扫描 DB `subscription`（有效订阅），计算“当期订阅月”窗口并写入 `credit`（`ON CONFLICT DO NOTHING` 幂等）；多实例需分布式锁/leader，需监控报警。（详见《实施方案》2.4.1）
- [ ] 按 `vt_task_main.priority` 分层调度：Paid=2 / Free=4（企业=1 可保留但不启用）。
- [ ] 调度算法：WRR + Aging 兜底 + per-user 并发上限（只统计 `processing`）。
- [ ] claim 原子化：`FOR UPDATE SKIP LOCKED` + `pending -> processing` 更新必须带条件，避免重复消费。
- [ ] 监控指标：paid/free 等待时长、队列长度、aging 命中次数、并发上限跳过次数。

---

## D. 运维与发布

- [ ] Java 端 DB 连接与时区口径：建议强制 UTC（否则订阅月“对日规则”可能漂移导致重复发放）。
