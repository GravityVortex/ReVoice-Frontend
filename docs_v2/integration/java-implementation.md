# Java 端实施步骤（统一交付文档）

本文件把 **Java 端需要实现的全部内容** 汇总在一起（单一入口，避免多文档漂移）：

1) **订阅月积分发放定时任务（含年付）**：按“订阅账期月（对日顺延）”发放当期订阅积分并在期末过期。  
2) **任务调度与 claim（vt_task_main）**：Paid 明显更快但 Free 不饿死；WRR + Aging + per-user 并发上限 + 原子 claim。

> 相关产品/口径来源：`docs_v2/product/pricing/SoulDub定价策略.md`

---

## A. 订阅月积分发放定时任务（含年付）

### A.1 背景

产品口径要求：

- 订阅积分按“订阅账期月”发放，且**当期到期清零**（不结转）。
- **年付也按月发放**（不能一次性发全年）。

现实约束：

- 年付在支付平台侧通常一年只扣一次；只靠 webhook/renewal **无法做到每月发放**。
- 所以 Java 端必须定时扫描 `subscription`，按月切分并写入 `credit(grant)`。

### A.2 目标（必须满足）

- 单一真相：订阅月积分发放逻辑只在 Java 端实现并写 DB；Web 端仅同步订阅状态。
- 幂等：同一订阅月最多发放一次（可重复触发/重试/多实例并发不双发）。
- 不补历史：只补齐“当期订阅月”的积分（漏跑几天不影响；漏跑几个月也不回补）。
- 可观测：扫描数/发放数/失败数/耗时可采集，失败可报警。

### A.3 非目标（不要做）

- 不按自然月（1 号到月底）结算；一律按支付平台定义的 current period + 对日规则切分。
- 不做复杂订阅叠加（同用户多条有效订阅）的全面支持；V1 只做**防御性去重**。
- 不做“过期 credit.status 批量改 expired”的清理任务：可用性以 `expires_at` 判定即可。

### A.4 依赖数据（DB）

subscription（最小字段）：

- `subscription_no`
- `user_id` / `user_email`
- `status`：只处理 `active/pending_cancel/trialing`
- `credits_amount`：**每个订阅月**应发放的积分数（注意不是全年）
- `current_period_start` / `current_period_end`
- `created_at`：同用户多订阅取最新

credit（写入 grant）：

- 幂等：`transaction_no` UNIQUE
- `transaction_type='grant'`
- `transaction_scene='subscription'`
- `available_at=NULL`
- `expires_at=period_end`
- `status='active'`
- `credits=remaining_credits=subscription.credits_amount`

### A.5 核心口径（必须一致）

1) 订阅月切分（对日规则）

- 以 `current_period_start` 为锚点，每次 `+1 month` 形成一个“订阅月”窗口：
  - `periodStart = anchor + k months`
  - `periodEnd = min(periodStart + 1 month, current_period_end)`

2) 发放点

- 只发放“包含 now 的那一个订阅月窗口”的积分。
- 若 `now < current_period_start`（订阅尚未开始）则不发放。

3) 幂等键（transaction_no）

- 固定格式：`sub_month:${subscriptionNo}:${periodStartIsoUtc}`
- `periodStartIsoUtc` 必须用 **UTC + 稳定格式**（推荐 `ISO_INSTANT`）。

### A.6 定时任务流程（KISS）

0) 多实例互斥（必须）

任选其一：

1. Postgres advisory lock（推荐，依赖最少）
   - `SELECT pg_try_advisory_lock(<fixed_key>)` 成功才执行
   - 结束后 `SELECT pg_advisory_unlock(<fixed_key>)`
2. ShedLock / Redis 锁 / 单实例开关

> 没有互斥也不会双发（transaction_no 唯一约束兜底），但会反复全表扫/反复插入尝试，属于低级浪费。

1) 扫描“有效订阅”（去重取每用户最新）

```sql
SELECT DISTINCT ON (user_id)
  subscription_no,
  user_id,
  user_email,
  credits_amount,
  current_period_start,
  current_period_end,
  created_at
FROM subscription
WHERE status IN ('active', 'pending_cancel', 'trialing')
  AND current_period_end > NOW()
ORDER BY user_id, created_at DESC;
```

2) 计算“当期订阅月窗口”

输入：`anchorStart=current_period_start`、`providerPeriodEnd=current_period_end`、`now`

算法：

1. `periodStart = anchorStart`
2. `periodEnd = min(anchorStart + 1 month, providerPeriodEnd)`
3. while `periodEnd <= now` and `periodEnd < providerPeriodEnd`:
   - `periodStart = periodEnd`
   - `periodEnd = min(periodStart + 1 month, providerPeriodEnd)`

> 用 `periodEnd <= now`（包含等号）是为了让“新订阅月开始的瞬间”能立刻切到新窗口并发放新积分。

3) 幂等插入 credit grant

```sql
INSERT INTO credit (
  id,
  user_id,
  user_email,
  subscription_no,
  transaction_no,
  transaction_type,
  transaction_scene,
  credits,
  remaining_credits,
  description,
  available_at,
  expires_at,
  status,
  consumed_detail,
  metadata,
  created_at,
  updated_at
) VALUES (
  :id,
  :userId,
  :userEmail,
  :subscriptionNo,
  :transactionNo,
  'grant',
  'subscription',
  :credits,
  :credits,
  'Grant subscription monthly credits',
  NULL,
  :expiresAt,
  'active',
  '',
  :metadataJson,
  NOW(),
  NOW()
)
ON CONFLICT (transaction_no) DO NOTHING;
```

4) 统计与报警（必须）

每次 job 输出：

- `scannedSubscriptions`（去重后）
- `granted`（insert 成功数）
- `failed`（异常数）
- `durationMs`

报警建议：

- `failed > 0` 连续 N 次
- `durationMs` 突然暴涨（索引缺失/表膨胀）
- `scannedSubscriptions` 异常暴涨（订阅状态同步异常）

### A.7 时区/时间口径（非常关键）

强制要求：

- Java 内部所有计算用 **UTC**。
- `periodStartIsoUtc` 必须稳定，否则幂等键漂移会导致重复发放。

若 DB 字段是 `timestamp without time zone`：

- JDBC 读取不要用 JVM 默认时区解释；统一转 `Instant` 后按 UTC 算。
- 连接层建议固定 session 时区为 UTC：`SET TIME ZONE 'UTC'`。

### A.8 索引建议（订阅量上来后必须做）

- `subscription(status, current_period_end)`
- 若用 `DISTINCT ON (user_id) ORDER BY created_at DESC`，再加 `subscription(user_id, created_at)` 更稳。

### A.9 验收用例（必须过）

1. 月付：`current_period_start=2026-01-15T10:00Z`，`now=2026-01-20T00:00Z`
   - 窗口：`[2026-01-15T10:00Z, 2026-02-15T10:00Z)`
2. 月付月末：`current_period_start=2026-01-31T10:00Z`，`now=2026-02-01T00:00Z`
   - `plusMonths(1)` 应落到 2 月月末（对日规则）
3. 年付：`current_period_start=2026-02-08T10:00Z`，`current_period_end=2027-02-08T10:00Z`
   - 任意时刻只发放当期窗口 1 笔，不补历史、不超前发未来
4. 幂等：同一时刻多次运行/多实例并发运行
   - 同一 `subscriptionNo + periodStart` 只存在 1 笔 grant（靠 unique transaction_no）

---

## B. 任务调度与 claim（vt_task_main）

> 目标：Paid 明显更快，但 Free 不饿死；实现简单、可解释、可审计。

### B.1 输入契约（Web 入队时已固化）

Web 端创建任务时写入：

- `vt_task_main.status='pending'`
- `vt_task_main.priority`：
  - 有效订阅或有效限时特惠：`2`（Paid）
  - 否则：`4`（Free；包含“只充值积分”用户）
- `vt_task_main.user_id`
- `vt_task_main.created_at`

Java 端原则：

- 只按 `priority` 分层调度；不在 Java 端再查 subscription/order/credits 重算优先级。

### B.2 状态机（已确认）

`vt_task_main.status` 取值（字符串）：

- `pending`
- `processing`
- `completed`
- `failed`
- `cancelled`

Java 端只做：`pending -> processing -> (completed|failed|cancelled)`  
不要新增 `running/retrying` 等状态（会把口径打散）。

### B.3 层级定义（priority）

- `priority=1`：企业（若暂未开放可不产生）
- `priority=2`：Paid（标准/高级/限时特惠）
- `priority=4`：Free（非订阅且无特惠；含“只充值积分”的用户）

### B.4 调度算法（WRR + Aging，主流且最小可落地）

采用：分层队列 + 加权轮询（Weighted Round Robin）+ 防饿死兜底（Aging）。

WRR（加权轮询）：

- 配置一个循环模式（例如：`paid,paid,paid,paid,free`）
- 每次尝试从对应层级 claim 1 个任务；取不到就跳到下一个

Aging（防饿死兜底）：

- 若存在等待超过阈值的 Free 任务，则下一次调度**强制**先 claim 该任务（即使当前轮到 paid）

建议配置（内部参数，不对外展示）：

- `schedule.wrr.pattern`（例如 `paid,paid,paid,paid,free`）
- `schedule.free.force_pick_after_seconds`

### B.5 并发配额（每用户并发上限）

目的：防止单用户占满资源（不是对外卖点，是稳定性底线）。

建议配置：

- `schedule.user_concurrency_limit.paid`
- `schedule.user_concurrency_limit.free`

统计口径（KISS）：

- 只统计 `status='processing'` 的数量作为“执行中并发”。

实现建议（避免 busy-loop）：

- claim 时把“并发上限”作为筛选条件，让“已超限用户”的 pending 任务不会被反复捞起又跳过。

### B.6 原子 claim（必须保证不重复消费）

PostgreSQL 推荐“一条 SQL 原子 claim”（按 priority）：

```sql
WITH picked AS (
  SELECT id
  FROM vt_task_main
  WHERE del_status = 0
    AND status = 'pending'
    AND priority = ?
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE vt_task_main
SET status = 'processing',
    started_at = NOW(),
    updated_at = NOW()
WHERE id IN (SELECT id FROM picked)
  AND status = 'pending'
RETURNING *;
```

带 per-user 并发上限的版本（推荐，避免“捞起又放下”）：

```sql
WITH picked AS (
  SELECT t.id
  FROM vt_task_main t
  WHERE t.del_status = 0
    AND t.status = 'pending'
    AND t.priority = ?
    AND (
      SELECT COUNT(*)
      FROM vt_task_main p
      WHERE p.del_status = 0
        AND p.status = 'processing'
        AND p.user_id = t.user_id
    ) < ?
  ORDER BY t.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE vt_task_main
SET status = 'processing',
    started_at = NOW(),
    updated_at = NOW()
WHERE id IN (SELECT id FROM picked)
  AND status = 'pending'
RETURNING *;
```

注意：

- 必须带 `AND status='pending'` 更新；更新 1 行才算 claim 成功。
- claim 失败说明被别的 worker 抢走，直接下一轮。

### B.7 Worker 主循环（实现步骤）

1) 先做 aging 检查（Free 超时兜底）：

- 查 1 条最老的 free pending，若等待超过阈值则直接用上面的 claim SQL 抢该任务（priority=4）。

2) 若未命中 aging，则按 WRR pattern 循环尝试 claim：

- pattern 中 `paid -> priority=2`，`free -> priority=4`。
- 任意一次 claim 成功就开始处理；全部失败则 sleep 一小段再试（避免空转）。

### B.8 监控与报警（最低配）

至少要有：

- paid/free pending 数量与等待时长分布（p50/p90/p99）
- aging 命中次数
- 因并发上限导致“claim 空结果”的次数（可作为压力信号）

### B.9 验收（调度侧）

- paid 的平均等待显著小于 free（内部可观测，不对外承诺数字）。
- free 在高峰期仍持续出队（aging 生效）。
- 多 worker 并发下不重复消费同一任务（claim 原子化）。

---

## C. Java 端实施顺序（建议）

1) 先实现 **B.6 原子 claim**（最关键，不对就全盘崩）。
2) 再实现 **B.4 WRR + Aging**（保证公平与可控）。
3) 再实现 **B.5 per-user 并发上限**（稳定性底线）。
4) 最后上线 **A 订阅月积分发放定时任务**（含 UTC/锁/指标/报警）。
