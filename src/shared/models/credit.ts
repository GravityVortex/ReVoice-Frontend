import { and, asc, count, desc, eq, gt, isNull, lte, or, sql, sum } from 'drizzle-orm';
import { addDays, addMonths } from 'date-fns';

import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { PaymentType } from '@/extensions/payment';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import { getPromoEntitlementTransactionNo } from '@/shared/lib/promo';

import { Order } from './order';
import { getCurrentSubscription } from './subscription';
import { appendUserToResult, getUserByUserIds, User } from './user';

export type Credit = typeof credit.$inferSelect & {
  user?: User;
};
export type NewCredit = typeof credit.$inferInsert;
export type UpdateCredit = Partial<Omit<NewCredit, 'id' | 'transactionNo' | 'createdAt'>>;

export enum CreditStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DELETED = 'deleted',
}
// 信用交易类型
export enum CreditTransactionType {
  GRANT = 'grant', // grant credit，增加
  CONSUME = 'consume', // consume credit，消耗
}

export enum CreditTransactionScene {
  PAYMENT = 'payment', // payment
  SUBSCRIPTION = 'subscription', // subscription
  RENEWAL = 'renewal', // renewal
  GIFT = 'gift', // gift
  AWARD = 'award', // award
}

function createSubscriptionCreditTransactionNo({
  subscriptionNo,
  windowStart,
}: {
  subscriptionNo: string;
  windowStart: Date;
}) {
  return `sub_credit:${subscriptionNo}:${windowStart.getTime()}`;
}

async function ensureCurrentSubscriptionCreditBatch(userId: string) {
  const sub = await getCurrentSubscription(userId).catch(() => undefined);
  if (!sub) return;

  const creditsPerMonth = Number(sub.creditsAmount || 0);
  if (!Number.isFinite(creditsPerMonth) || creditsPerMonth <= 0) {
    return;
  }

  if (!sub.currentPeriodStart || !sub.currentPeriodEnd || !sub.subscriptionNo) {
    return;
  }

  const now = new Date();
  const periodStart = new Date(sub.currentPeriodStart);
  const periodEnd = new Date(sub.currentPeriodEnd);

  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime())) {
    return;
  }
  if (periodEnd <= now) {
    return;
  }

  // Find the "subscription month" window that contains `now`.
  let windowStart = periodStart;
  const maxSteps = 24; // safety valve; should never exceed 12 for annual plans
  for (let step = 0; step < maxSteps; step += 1) {
    const nextStart = addMonths(windowStart, 1);
    if (nextStart <= now && nextStart < periodEnd) {
      windowStart = nextStart;
      continue;
    }
    break;
  }

  const nextStart = addMonths(windowStart, 1);
  const windowEnd = nextStart < periodEnd ? nextStart : periodEnd;
  if (windowEnd <= now) {
    return;
  }

  const transactionNo = createSubscriptionCreditTransactionNo({
    subscriptionNo: sub.subscriptionNo,
    windowStart,
  });

  await db()
    .insert(credit)
    .values({
      id: getUuid(),
      userId: sub.userId,
      userEmail: sub.userEmail,
      orderNo: null,
      subscriptionNo: sub.subscriptionNo,
      transactionNo,
      transactionType: CreditTransactionType.GRANT,
      transactionScene: CreditTransactionScene.SUBSCRIPTION,
      credits: creditsPerMonth,
      remainingCredits: creditsPerMonth,
      description: 'Grant subscription credits',
      availableAt: windowStart,
      expiresAt: windowEnd,
      status: CreditStatus.ACTIVE,
      consumedDetail: '',
      metadata: JSON.stringify({
        subscriptionNo: sub.subscriptionNo,
        planName: sub.planName || '',
        creditsPerMonth,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      }),
    })
    .onConflictDoNothing({ target: credit.transactionNo });
}

// Calculate credit expiration time based on order and subscription info
export function calculateCreditExpirationTime({
  creditsValidDays,
  currentPeriodEnd,
  baseTime,
}: {
  creditsValidDays: number;
  currentPeriodEnd?: Date;
  // For one-time credits: the validity must be anchored to the actual payment time.
  // Fallback to "now" if the payment provider doesn't return a paidAt value.
  baseTime?: Date;
}): Date | null {
  const now = baseTime ? new Date(baseTime.getTime()) : new Date();

  // Subscription credits expire with the subscription billing period, regardless of `creditsValidDays`.
  if (currentPeriodEnd) {
    return new Date(currentPeriodEnd.getTime());
  }

  // One-time credits: `creditsValidDays <= 0` means never expires.
  if (!creditsValidDays || creditsValidDays <= 0) {
    return null;
  }

  // For one-time topups: product rule is "12 months validity".
  // Use month arithmetic to match "same day, else month end" semantics (avoid leap-year off-by-one).
  if (creditsValidDays === 365) {
    return addMonths(now, 12);
  }

  // Fallback: treat as day-based validity (legacy configs such as 60/90/120).
  return addDays(now, creditsValidDays);
}

// Helper function to create expiration condition for queries
export function createExpirationCondition() {
  const currentTime = new Date();
  // Credit is usable if:
  // - available_at IS NULL OR available_at <= now
  // - AND (expires_at IS NULL OR expires_at > now)
  return and(
    or(isNull(credit.availableAt), lte(credit.availableAt, currentTime)),
    or(isNull(credit.expiresAt), gt(credit.expiresAt, currentTime))
  );
}

// create credit
export async function createCredit(newCredit: NewCredit) {
  const [result] = await db().insert(credit).values(newCredit).returning();
  return result;
}

// get credits
export async function getCredits({
  userId,
  status,
  transactionType,
  getUser = false,
  page = 1,
  limit = 30,
}: {
  userId?: string;
  status?: CreditStatus;
  transactionType?: CreditTransactionType;
  getUser?: boolean;
  page?: number;
  limit?: number;
}): Promise<Credit[]> {
  const result = await db()
    .select()
    .from(credit)
    .where(
      and(
        userId ? eq(credit.userId, userId) : undefined,
        status ? eq(credit.status, status) : undefined,
        transactionType ? eq(credit.transactionType, transactionType) : undefined
      )
    )
    .orderBy(desc(credit.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (getUser) {
    return appendUserToResult(result);
  }

  return result;
}

// get credits count
export async function getCreditsCount({
  userId,
  status,
  transactionType,
}: {
  userId?: string;
  status?: CreditStatus;
  transactionType?: CreditTransactionType;
}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(credit)
    .where(
      and(
        userId ? eq(credit.userId, userId) : undefined,
        status ? eq(credit.status, status) : undefined,
        transactionType ? eq(credit.transactionType, transactionType) : undefined
      )
    );

  return result?.count || 0;
}

/**
 * 消耗积分业务
 * @param userId 用户ID
 * @param credits 要消耗的积分：如4
 * @param scene 场景，如：convert_video
 * @param description 描述，如：视频转换任务消耗积分
 * @param metadata 其他元信息 如：{"type":"test"}
 * @returns
 */
export async function consumeCredits({
  userId,
  credits,
  scene,
  description,
  metadata,
  idempotencyKey,
}: {
  userId: string;
  credits: number; // credits to consume
  scene?: string;
  description?: string;
  metadata?: string;
  idempotencyKey?: string;
}) {
  // Subscription credits are issued per "subscription billing month".
  // Keep it on-demand and server-side to avoid relying on cron/webhooks.
  await ensureCurrentSubscriptionCreditBatch(userId);

  const currentTime = new Date();

  // consume credits
  const result = await db().transaction(async (tx) => {
    const idemKey = String(idempotencyKey || '').trim();
    const idempotentTxnNo = idemKey
      ? `consume:${String(scene || 'default')}:${userId}:${idemKey}`
      : null;

    if (idempotentTxnNo) {
      const [existing] = await tx
        .select()
        .from(credit)
        .where(eq(credit.transactionNo, idempotentTxnNo))
        .limit(1);
      if (existing) {
        return existing;
      }
    }

    // 1. check credits balance
    const [creditsBalance] = await tx
      .select({
        total: sum(credit.remainingCredits), // 剩余积分额度
      })
      .from(credit)
      .where(
        and(
          eq(credit.userId, userId),
          eq(credit.transactionType, CreditTransactionType.GRANT),
          eq(credit.status, CreditStatus.ACTIVE),
          gt(credit.remainingCredits, 0),
          // Only count credits that are already available.
          or(isNull(credit.availableAt), lte(credit.availableAt, currentTime)),
          or(
            isNull(credit.expiresAt), // Never expires
            gt(credit.expiresAt, currentTime) // Not yet expired
          )
        )
      );

    // balance is not enough
    if (!creditsBalance || !creditsBalance.total || parseInt(creditsBalance.total) < credits) {
      throw new Error(`Insufficient credits, ${creditsBalance?.total || 0} < ${credits}`);
    }

    // 2. Consume from available GRANT records.
    //
    // Hard requirement:
    // - Spend credits by expiration time: whoever expires first is used first.
    // - Within the same expiration time, keep ordering stable.
    //
    // This matches the product rule: "谁先到期先用谁".
    //
    // We enforce this by sorting `expiresAt ASC NULLS LAST`:
    // - expiring credits first (both subscription and top-up batches)
    // - `expiresAt = NULL` (never expires / legacy data) last
    //
    // IMPORTANT: Never use OFFSET pagination here.
    // We mutate `remainingCredits` and filter with `remainingCredits > 0`, so OFFSET would
    // skip rows as soon as earlier rows become ineligible, and can incorrectly throw
    // "Insufficient credits" even when balance is enough.
    let remainingToConsume = credits;

    const batchSize = 1000;
    const maxBatches = 10_000; // safety valve; should be far above normal usage
    const consumedItems: any[] = [];

    for (let batchNo = 1; remainingToConsume > 0 && batchNo <= maxBatches; batchNo += 1) {
      const batchCredits = await tx
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.userId, userId),
            eq(credit.transactionType, CreditTransactionType.GRANT),
            eq(credit.status, CreditStatus.ACTIVE),
            gt(credit.remainingCredits, 0),
            or(isNull(credit.availableAt), lte(credit.availableAt, currentTime)),
            or(isNull(credit.expiresAt), gt(credit.expiresAt, currentTime))
          )
        )
        .orderBy(
          // soonest expiry first; non-expiring last
          sql`${credit.expiresAt} asc nulls last`,
          asc(credit.createdAt),
          asc(credit.id)
        )
        .limit(batchSize)
        .for('update');

      if (!batchCredits?.length) {
        break;
      }

      let progressed = false;
      for (const item of batchCredits) {
        if (remainingToConsume <= 0) {
          break;
        }

        const toConsume = Math.min(remainingToConsume, item.remainingCredits);
        if (toConsume <= 0) {
          continue;
        }

        await tx
          .update(credit)
          .set({ remainingCredits: item.remainingCredits - toConsume })
          .where(eq(credit.id, item.id));

        progressed = true;
        consumedItems.push({
          creditId: item.id,
          transactionNo: item.transactionNo,
          expiresAt: item.expiresAt,
          creditsConsumed: toConsume,
          creditsBefore: item.remainingCredits,
          creditsAfter: item.remainingCredits - toConsume,
          batchNo,
        });

        remainingToConsume -= toConsume;
      }

      // Defensive: if we fetched rows but didn't consume anything, we'd loop forever.
      if (!progressed) {
        throw new Error('Failed to consume credits: no progress');
      }
    }

    if (remainingToConsume > 0) {
      // Shouldn't happen because we pre-check the balance, but keep it as a hard guard.
      throw new Error('Insufficient credits');
    }

    // 3. create consumed credit
    const consumedCredit: NewCredit = {
      id: getUuid(),
      transactionNo: idempotentTxnNo || getSnowId(),
      transactionType: CreditTransactionType.CONSUME,
      transactionScene: scene,
      userId: userId,
      status: CreditStatus.ACTIVE,
      description: description,
      credits: -credits,
      consumedDetail: JSON.stringify(consumedItems),
      metadata: metadata,
    };
    await tx.insert(credit).values(consumedCredit);

    return consumedCredit;
  });

  return result;
}

export async function findCreditByTransactionNo(transactionNo: string) {
  const txn = String(transactionNo || '').trim();
  if (!txn) return undefined;
  const [result] = await db().select().from(credit).where(eq(credit.transactionNo, txn)).limit(1);
  return result;
}

/**
 * 退还积分业务
 * @param creditId 消费记录ID
 * @returns
 */
export async function refundCredits({ creditId }: { creditId: string }) {
  const result = await db().transaction(async (tx) => {
    // 查到此条消费记录，其中consumedDetail字段记录了关联的所有增加记录和消耗数量
    const [consumedCredit] = await tx.select().from(credit).where(eq(credit.id, creditId));

    if (!consumedCredit || consumedCredit.status !== CreditStatus.ACTIVE) {
      throw new Error('Credit record not found or already refunded');
    }
    // 关联记录都查出来，一一修改
    const consumedItems = JSON.parse(consumedCredit.consumedDetail || '[]');

    // 逐条更新关联的记录，把remaining_credits字段加回去
    await Promise.all(
      consumedItems.map((item: any) => {
        if (item && item.creditId && item.creditsConsumed > 0) {
          return tx
            .update(credit)
            .set({
              // remaining_credits字段加回去
              remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
            })
            .where(eq(credit.id, item.creditId));
        }
      })
    );

    // 标记此条消费记录为已删除
    await tx
      .update(credit)
      .set({
        status: CreditStatus.DELETED,
      })
      .where(eq(credit.id, creditId));

    return consumedCredit;
  });

  return result;
}

// get remaining credits
// 计算用户当前可用的剩余积分总额
export async function getRemainingCredits(userId: string): Promise<number> {
  try {
    await ensureCurrentSubscriptionCreditBatch(userId);
  } catch {
    // Best-effort: do not fail the caller due to subscription credit issuance.
  }

  const currentTime = new Date();

  const [result] = await db()
    .select({
      total: sum(credit.remainingCredits),
    })
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, CreditTransactionType.GRANT),
        eq(credit.status, CreditStatus.ACTIVE),
        gt(credit.remainingCredits, 0),
        or(isNull(credit.availableAt), lte(credit.availableAt, currentTime)),
        or(
          isNull(credit.expiresAt), // Never expires
          gt(credit.expiresAt, currentTime) // Not yet expired
        )
      )
    );

  return parseInt(result?.total || '0');
}

export async function hasActivePromoEntitlement(userId: string): Promise<boolean> {
  const currentTime = new Date();
  const transactionNo = getPromoEntitlementTransactionNo(userId);

  const [result] = await db()
    .select({ expiresAt: credit.expiresAt })
    .from(credit)
    .where(
      and(
        eq(credit.transactionNo, transactionNo),
        eq(credit.status, CreditStatus.ACTIVE),
        // Must have a future expiry to be considered active.
        gt(credit.expiresAt, currentTime)
      )
    )
    .limit(1);

  return Boolean(result?.expiresAt);
}

/**
 * 查询是否已赠送积分
 * @param userId 
 * @param transactionScene 
 * @returns 
 */
export async function findCreditsByUserId(userId: string, transactionScene: string) {
  const [result] = await db()
    .select()
    .from(credit)
    .where(and(eq(credit.userId, userId), eq(credit.transactionScene, transactionScene)));

  return result;
}
/**
 * 管理后台删除积分
 * @param id 
 * @returns 
 */
export async function deleteCredit(id: string) {
  const [creditRecord] = await db().select().from(credit).where(eq(credit.id, id));

  if (!creditRecord) {
    throw new Error('Credit record not found');
  }
  // Safety: never delete/modify a GRANT record that has been consumed (partially or fully).
  // It would break refund/audit correctness because CONSUME records reference GRANTs by id.
  if (creditRecord.credits !== creditRecord.remainingCredits) {
    const consumed = creditRecord.credits - creditRecord.remainingCredits;
    return { canDelete: false, consumed };
  }

  await db().delete(credit).where(eq(credit.id, id));
  return { canDelete: true };
}
