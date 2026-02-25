# SoulDub 定价策略实施方案（前后端拆分）

本文是基于《SoulDub定价策略》（`docs/SoulDub定价策略.md`）的**落地实施清单**，并对照当前仓库代码，明确需要改哪些、怎么改、验收口径是什么。

约束（KISS）：

- **服务端为唯一真相**：金额、积分、有效期、扣费规则全部以服务端计算为准，前端只展示。
- **不信任客户端输入**：不接受前端传入“扣多少积分/多少钱”作为权威；必要时连“视频时长”也不信任（该项先记为保留问题）。
- **可审计**：每次发放/扣减必须可追溯（transactionNo、consumedDetail、metadata）。
- **不引入复杂订阅叠加**：V1 不支持同一用户多条有效订阅；升级降级走支付平台 Billing Portal。

---

## 0. 口径摘要（来自定价策略文档）

- **视频翻译生成**：3 积分/分钟；计费分钟=`ceil(durationSeconds/60)`，最少按 1 分钟计费。
- **字幕段重翻译**：1 积分/次（GPU/AI 操作才扣）。
- **音频段重生成**：2 积分/次（GPU/AI 操作才扣）。
- **编辑后重新合成导出**：0（不扣积分）。
- **订阅积分**：按“订阅账期月”发放；当期有效，到期失效不结转；**年付也按月发放**。
- **充值积分（Top-up）**：每次购买一个批次；批次有效期 12 个月；批次可累加、不清零。
- **扣减顺序**：全局“先到期先用”，`expiresAt` 越早越先扣，`expiresAt=NULL` 最后扣；未到 `availableAt` 的积分不参与扣减。
- **限时特惠（$5.99/3 天）**：one-time；可复购顺延；每段 3 天只生效一笔，积分按付款时间依次生效；有效期内复购时，新购积分从下一段 3 天开始才可用（用 `availableAt` 表达）。
- **任务调度（Java）**：Paid（订阅/特惠）优先、Free 兜底不饿死；对外不承诺数字。

---

## 1. 当前代码对照（关键结论）

### 1.1 后端（Next.js API + DB）

- 结账入口：`src/app/api/payment/checkout/route.ts`（从 i18n pricing.json 读取 SKU，服务端计算金额；并限制“一人一条有效订阅”）。
- 支付回调/发货：`src/shared/services/payment.ts`
  - 订阅：只同步 subscription（状态/账期边界）；**订阅月积分发放由 Java 端直接写 DB**（见 2.4.1）。
  - 充值：按订单 credits/valid_days 发放 grant；valid_days=365 代表 12 个月（用 addMonths(12) 计算到期）。
  - 限时特惠：用 entitlement + purchase 两条 credit 记录实现“顺延 + 下一段才可用”。
- 积分账本：`src/shared/models/credit.ts`
  - 扣减按 `expiresAt asc nulls last`，并且支持 `availableAt`（未生效不计入余额/不参与扣减）。
  - `consumeCredits()` 内部已避免 OFFSET 扣减跳行问题，并记录 consumedDetail 用于退款/回滚。

### 1.2 前端（Next.js UI）

- 定价展示来自：
  - `src/config/locale/messages/zh/pricing.json`
  - `src/config/locale/messages/en/pricing.json`
- 视频生成流程中仍存在**“2 积分/分钟”默认值/注释**（展示口径漂移风险）：
  - `src/shared/blocks/video-convert/project-add-convert-modal.tsx`
  - `src/shared/blocks/video-convert/project-create-flow.tsx`
  - `src/shared/blocks/video-convert/convert-add-modal.tsx`（目前看是未引用的遗留/示例组件）

### 1.3 Java 执行端（任务调度）

- Web 端入队时已经写入 `vt_task_main.priority`（Paid=2，Free=4），Java 端应按该字段做分层调度（见《SoulDub定价策略.md》“后端调度（Java）实现规范”）。

### 1.4 需要调整的差异点汇总（按端）

后端（Next.js API / DB）：

- 补齐/确认 `credit.available_at` 的 DB 列与迁移（否则“特惠下一段才可用”无法可靠表达）。
- 充值积分的到期时间建议以支付平台 `paidAt` 作为基准时间（避免回调延迟带来的口径争议）。

前端（Next.js UI）：

- 清掉所有“2 积分/分钟”的默认值/文案/注释，默认兜底统一为 3，并以 `/api/video-task/getconfig` 为准。
- 删除/下线未引用的遗留组件（例如 `convert-add-modal`），避免未来误用导致口径漂移。

Java（worker/dispatcher）：

- 订阅月积分发放（含年付）：扫描有效订阅，计算“当期订阅月”窗口，幂等写入 credit grant（见 2.4.1）。
- 按 `priority` 分层调度（Paid=2 / Free=4），落地 WRR + Aging + per-user 并发上限 + 原子 claim（不重复消费）。

---

## 2. 后端实施方案（Next.js API / DB）

### 2.1 产品 SKU / 定价配置（pricing.json）

目标：SKU 固化、减少分支口径。

实施项：

1. 统一中英文 pricing.json 的业务字段一致性（product_id / amount / interval / credits / valid_days）。
2. 充值积分 valid_days 统一为 `365`（表示 12 个月有效期；实现层按 12 个月月算）。
3. 限时特惠 product_id 固定为 `promo-3d`，valid_days 固定为 3。

验收：

- `/api/payment/checkout` 仅依赖服务端 pricing.json 的数值生成订单，前端无法篡改 amount/credits。

### 2.1.1 充值积分到期时间的基准时间（paidAt vs now）

目标：严格符合“自充值成功起 12 个月有效期”。

实施项：

- 计算充值积分 expiresAt 时，优先使用支付平台返回的 `paidAt`（若缺失再用服务端当前时间兜底），避免“回调延迟导致有效期缩水/延长”的争议口径。

### 2.2 数据库/模型（credit.available_at）

目标：用时间边界表达“未生效/可用/过期”，不引入额外 status（例如 pending）。

实施项：

1. 确认 DB `credit` 表存在 `available_at` 列（对应 schema：`src/config/db/schema.ts` 的 `credit.availableAt`）。
2. 若缺失，走 drizzle 迁移/推送：
   - 方案 A（推荐，留痕）：`pnpm db:generate && pnpm db:migrate`
   - 方案 B（未上线阶段可用）：`pnpm db:push`

验收：

- 查询余额与扣减都满足：`availableAt <= now` 才可用；`expiresAt <= now` 不可用。

### 2.3 积分扣减（全局先到期先用）

目标：扣减顺序严格符合文档；并发下不乱账。

实施项（服务端）：

1. `consumeCredits()` 必须按 `expiresAt asc nulls last, createdAt asc, id asc` 扣减（已实现）。
2. `consumeCredits()` / `getRemainingCredits()` 统一过滤：
   - `remainingCredits > 0`
   - `availableAt IS NULL OR availableAt <= now`
   - `expiresAt IS NULL OR expiresAt > now`
3. 退款/回滚：失败时 best-effort `refundCredits()`（已在字幕/音频生成失败时执行）。

验收：

- 同时存在订阅积分 + 多批次充值积分：永远先扣即将过期批次（不区分类型）。
- 多次限时特惠购买：每段 3 天仅消耗一笔对应批次的积分，后续批次在其 `availableAt` 前不可用。

### 2.4 订阅积分按月发放（含年付）

目标：不依赖支付平台“年付每月扣款事件”，仍能做到年付每月发放。

实施项：

1. Webhook/回调职责收敛：
   - 只同步 subscription 的 `status/currentPeriodStart/currentPeriodEnd/...`
   - 不直接按“订阅订单”发放积分（避免年付一次性发全年）
2. 发放器（幂等，Java 内部实现）：
   - Java 实现 `ensureSubscriptionMonthlyCredits(subscription)`（或按 `userId` 查最新有效订阅再发放）。
   - 发放口径：只发“当期订阅月”的订阅积分（不做历史补发）。
   - expiresAt = 当期订阅月 `periodEnd`；transactionNo = `sub_month:${subscriptionNo}:${periodStartIsoUtc}`（依赖 `credit.transaction_no` 唯一约束实现幂等）。
3. 触发机制（KISS）：
   - 由 Java `@Scheduled` / Quartz 定时扫描有效订阅并执行发放器（Java 直接写 DB，不再经由 Web 端 cron API）。

#### 2.4.1 Java 端定时任务（发放器 + 调度）实施细节（定稿）

目标：把“准时发放订阅月积分”的职责全部放在 Java 端；保证**幂等、可观测、可扩展**，且不与 Web 端形成双实现口径漂移。

Java 端详细实现说明见：

- `docs/java-implementation.md`（A 订阅月积分发放定时任务 / B 调度与 claim）

推荐方案（KISS）：

- Java 端定时扫描 `subscription` 表（有效订阅），对每条订阅计算“当前订阅月”的 `[periodStart, periodEnd)`，然后向 `credit` 表插入一条 grant 记录（`ON CONFLICT DO NOTHING`）。

Java 端实现要求：

- **调度频率**：建议每 5~30 分钟触发一次；频率越高，越接近“订阅刚生效就立刻有积分”的体验（代价是更频繁扫描）。
- **索引建议**：若订阅量较大，建议补索引以避免全表扫：`subscription(status, current_period_end)`（至少能加速“有效订阅扫描”）。
- **多实例一致性**：
  - 若 Java 只有 1 个实例：直接 `@Scheduled` 即可。
  - 若 Java 多实例：必须保证同一时刻只跑 1 个（否则重复扫描浪费资源）。
    - 方案 A（最简单）：只在“指定 1 个实例”启用该 job（配置开关）。
    - 方案 B（更稳）：用分布式锁（例如 ShedLock / DB 锁 / Redis 锁）做 leader。
- **可观测**：记录扫描数量、实际新增 grant 数量、失败数、耗时（p50/p95）。
- **时区/时间口径**：强制用 UTC（或统一固定时区）解析/计算 `current_period_start/current_period_end`，否则“对日规则”与 transactionNo 会漂移导致重复发放。

Java（Spring）伪代码示例（核心流程）：

```java
@Scheduled(fixedDelayString = "${subscriptionCredits.fixedDelayMs:300000}")
public void grantSubscriptionMonthlyCredits() {
  // TODO: add distributed lock if multi-instance.

  // 1) scan active subscriptions
  List<SubscriptionRow> subs = subscriptionRepo.findActiveSubscriptions(Instant.now());

  int granted = 0;
  int failed = 0;

  for (SubscriptionRow sub : subs) {
    try {
      // 2) compute current billing month window [periodStart, periodEnd)
      BillingWindow w = billingMonth(sub.currentPeriodStart, sub.currentPeriodEnd, Instant.now());

      // 3) idempotent insert (transaction_no UNIQUE)
      String txn = "sub_month:" + sub.subscriptionNo + ":" + w.periodStartUtcIso;
      boolean inserted = creditRepo.insertGrantOnConflictDoNothing(
        txn,
        sub.userId,
        sub.userEmail,
        sub.subscriptionNo,
        sub.creditsAmount,
        w.periodEnd
      );

      if (inserted) granted++;
    } catch (Exception e) {
      failed++;
      // log error with subscriptionNo/userId
    }
  }

  // emit metrics/logs: subs.size(), granted, failed, durationMs
}
```

建议 SQL（示意，实际以你们的 DAO/ORM 为准）：

- 扫描有效订阅（只需最小字段）：

```sql
SELECT subscription_no, user_id, user_email, credits_amount, current_period_start, current_period_end
FROM subscription
WHERE status IN ('active','pending_cancel','trialing')
  AND current_period_end > NOW();
```

- 幂等发放（transaction_no UNIQUE）：

```sql
INSERT INTO credit (
  id, user_id, user_email, subscription_no,
  transaction_no, transaction_type, transaction_scene,
  credits, remaining_credits, description, expires_at, status, created_at, updated_at
) VALUES (
  ?, ?, ?, ?,
  ?, 'grant', 'subscription',
  ?, ?, 'Grant subscription monthly credits', ?, 'active', NOW(), NOW()
)
ON CONFLICT (transaction_no) DO NOTHING;
```

验收：

- 年付用户跨过“订阅月边界”后，不续费也能在新订阅月看到新一笔订阅积分（即使当月未触发 webhook）。

### 2.5 限时特惠（$5.99/3 天）

目标：既能“顺延”，又能保证“每段 3 天只生效一笔积分，不叠加”。

实施项：

1. 采用两类 credit 记录：
   - entitlement：`transactionNo=promo_entitlement:${userId}`，仅存 expiresAt（表示 Paid 身份到期时间）
   - purchase：`transactionNo=promo_purchase:${orderNo}`，存本次积分批次（credits/remaining/availableAt/expiresAt）
2. 复购顺延算法：
   - baseEnd = max(entitlement.expiresAt, paidAt)
   - newEnd = baseEnd + 3 days
   - purchase.availableAt = baseEnd（有效期内复购 => 下一段开始才可用）
   - purchase.expiresAt = newEnd

验收：

- 在有效期内连续购买 n 次：会形成 n 个连续 3 天窗口；每个窗口只激活 1 笔 purchase 批次；余额统计/扣费不会提前消耗未来窗口积分。

### 2.6 退款口径（仅充值积分）

目标：订阅无退款；充值积分仅退“未使用”部分并回收。

实施项：

- 充值退款必须基于 consumedDetail 精确回收对应批次未用部分（若要做退款 API，必须按账本回溯，不允许“直接把余额清零”）。

备注：当前仓库是否已有“充值退款”入口需单独盘点；没有就先不做（YAGNI）。

### 2.7 安全与下线清理

目标：杜绝刷积分/篡改扣费。

实施项：

1. 管理端加/删积分 API：仅允许具备 `PERMISSIONS.CREDITS_WRITE` 的账号调用（代码已做，但需要补齐审计字段/日志策略）。
2. 删除/下线所有测试扣费/退费接口（例如 `credits-test`）以及任何“注册赠送”链路（按策略已取消）。

### 2.8 保留问题（先记风险，不在本次实现）

- **不信任客户端视频时长**：目前 `videoDurationSeconds` 来自前端，理论上可被篡改少扣积分。
  - 现阶段按“保留问题”记录风险，不做强制落地。
  - 后续若出现争议/被刷：以服务端解析视频元数据（ffprobe/媒体库）作为扣费依据，再立项补齐。

---

## 3. 前端实施方案（Next.js UI）

### 3.1 定价页 / 购买入口

目标：展示简单、口径稳定，不出现“数字权益”误导（尤其是并发/队列）。

实施项：

1. 定价表完全由 pricing.json 驱动（已有）；不要在 UI 写死金额/积分/有效期。
2. 文案层只强调：
   - “订阅积分按账期月发放并到期清零”
   - “充值积分可累加，按批次 12 个月有效”
   - “更快/最快”（不写并发、队列、具体速度数字）
3. 限时特惠卡片文案需明确：
   - 有效期内复购可顺延
   - 新购积分按付款时间依次生效（不叠加）

### 3.2 视频上传/生成流程的口径一致性（积分/分钟）

目标：前端展示的“预估消耗积分”必须和服务端口径一致（避免用户认为被多扣/少扣）。

实施项：

1. 清理/替换所有 `pointsPerMinute: 2` 的默认值为 `3`（仅作为 UI 默认兜底；真实值以 `/api/video-task/getconfig` 返回为准）：
   - `src/shared/blocks/video-convert/project-add-convert-modal.tsx`
   - `src/shared/blocks/video-convert/project-create-flow.tsx`
2. 移除未引用的示例组件或显式标注“demo/unused”，避免未来误用：
   - `src/shared/blocks/video-convert/convert-add-modal.tsx`（当前仓库未被引用，建议删除）
3. 前端展示的“计费分钟”统一使用 `ceil(durationSeconds/60)`（和后端一致）。

### 3.2.1 「登录前允许上传视频」的最小落地（可选）

目标：符合《SoulDub定价策略.md》“原则”，但不引入匿名账号/guest 体系。

最小实现（推荐，KISS）：

- 登录前仅允许“选择文件 + 本地读取时长/预览 + 计算预估扣费”；真正的上传/创建任务仍在登录后进行。

若必须“字面意义的上传”：

- 需要新增匿名上传的服务端签名/限流/生命周期清理策略（属于单独项目，不建议和本次定价改造强耦合）。

### 3.3 积分展示（不做“权益数字承诺”）

目标：展示用户关心的“余额/到期”，不引入复杂权益项。

实施项：

1. 设置页积分总额展示保留即可（`/settings/credits`）。
2. 可选（不强制）：在积分列表里通过 description/metadata 区分来源（订阅/充值/特惠），但不需要新增状态（pending）。

### 3.4 编辑字幕/音频扣费提示

目标：扣费点明确，失败要给到“积分已退回/未扣成功”提示。

实施项：

1. 字幕重翻译 / 音频重生成操作触发前提示“会消耗积分”（1/2）。
2. 后端失败时，前端提示以服务端返回为准（并提示可能已自动退回）。

---

## 4. Java 端实施方案（调度/执行）

目标：Paid 明显更快，但 Free 不饿死；实现可控、可审计、可解释。

### 4.1 Web ↔ Java 契约（入队字段）

Web 端入队（已在 `src/app/api/video-task/create/route.ts`）写入：

- `vt_task_main.status='pending'`
- `vt_task_main.priority`：
  - 有效订阅或有效限时特惠：2
  - 否则：4
- `vt_task_main.user_id / created_at`

Java 端原则：

- **只按 priority 分层调度**；不在 Java 端再查 subscription/order 重算优先级。

### 4.2 调度算法（最小可落地）

采用：分层队列 + 加权轮询（WRR）+ Aging 兜底 + 每用户并发上限。

- WRR：例如循环模式 `paid,paid,paid,paid,free`（配置化）。
- Aging：免费任务等待超过阈值时强制捞一个（防饿死）。
- 并发上限：按 `user_id` 统计 `processing` 数量，超过则跳过该任务。

### 4.3 Claim（防重复消费）

PostgreSQL 推荐原子 claim（示例 SQL）：

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

### 4.4 监控（最低配）

- paid/free 各自 pending 数量与等待时长分布
- aging 命中次数
- 因并发上限跳过次数

---

## 5. 验收清单（端到端）

后端：

- 充值积分：支付成功发放一个批次；expiresAt=12 个月（按月算）；按 expiresAt 优先扣减。
- 订阅（月付）：每个订阅月发放一次；到期失效；跨账期后自动出现新一笔（请求兜底 / Java 定时触发任一生效）。
- 订阅（年付）：年付期内每个订阅月都能拿到当月积分（不依赖年付 renewal webhook）。
- 限时特惠：复购顺延；新购积分从下一段 3 天开始可用；每段 3 天仅生效一笔。
- 字幕/音频编辑：分别扣 1/2；失败自动退回（best-effort）。
- 合成导出：不扣积分。

前端：

- 任意入口展示的“预估扣费”与后端一致（pointsPerMinute 与分钟向上取整）。
- 定价页不展示并发/队列等数字权益；只做“更快/最快”描述。

Java：

- paid 的平均等待显著小于 free（不需要对外承诺数字，但内部应可观测）。
- free 在高峰期仍持续出队（aging 生效）。

---

## 6. 里程碑（建议）

1. 后端：DB/积分扣减/发放器/特惠链路先稳定（以接口为验收）。
2. 前端：清掉“2 积分/分钟”遗留与未引用组件，保证展示一致。
3. Java：按 priority 分层调度落地 + 监控指标上线。
4. 订阅月发放定时触发器（Java `@Scheduled`/Quartz **直接写 DB**，补强“万无一失”；不再通过 Next.js cron API）。
