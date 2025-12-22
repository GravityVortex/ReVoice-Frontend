import { and, asc, count, desc, eq, gt, isNull, or, sql, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import { credit } from '@/config/db/schema';
import { PaymentType } from '@/extensions/payment';
import { getSnowId, getUuid } from '@/shared/lib/hash';

import { Order } from './order';
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

// Calculate credit expiration time based on order and subscription info
export function calculateCreditExpirationTime({
  creditsValidDays,
  currentPeriodEnd,
}: {
  creditsValidDays: number;
  currentPeriodEnd?: Date;
}): Date | null {
  const now = new Date();

  // Check if credits should never expire
  if (!creditsValidDays || creditsValidDays <= 0) {
    // never expires
    return null;
  }

  const expiresAt = new Date();

  if (currentPeriodEnd) {
    // For subscription: credits expire at the end of current period
    expiresAt.setTime(currentPeriodEnd.getTime());
  } else {
    // For one-time payment: use configured validity days
    expiresAt.setDate(now.getDate() + creditsValidDays);
  }

  return expiresAt;
}

// Helper function to create expiration condition for queries
export function createExpirationCondition() {
  const currentTime = new Date();
  // Credit is valid if: expires_at IS NULL OR expires_at > current_time
  return or(isNull(credit.expiresAt), gt(credit.expiresAt, currentTime));
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
}: {
  userId: string;
  credits: number; // credits to consume
  scene?: string;
  description?: string;
  metadata?: string;
}) {
  const currentTime = new Date();

  // consume credits
  const result = await db().transaction(async (tx) => {
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

    // 2. get available credits, FIFO queue with expiresAt, batch query
    let remainingToConsume = credits; // remaining credits to consume

    // only deal with 10000 credit grant records
    let batchNo = 1; // batch no
    const maxBatchNo = 10; // max batch no
    const batchSize = 1000; // batch size
    const consumedItems: any[] = [];

    while (remainingToConsume > 0) {
      // get batch credits
      const batchCredits = await tx
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.userId, userId),
            eq(credit.transactionType, CreditTransactionType.GRANT),
            eq(credit.status, CreditStatus.ACTIVE),
            gt(credit.remainingCredits, 0),
            or(
              isNull(credit.expiresAt), // Never expires
              gt(credit.expiresAt, currentTime) // Not yet expired
            )
          )
        )
        .orderBy(
          // FIFO queue: expired credits first, then by expiration date
          // NULL values (never expires) will be ordered last
          asc(credit.expiresAt)
        )
        .limit(batchSize) // batch size
        .offset((batchNo - 1) * batchSize) // offset
        .for('update'); // lock for update

      // no more credits
      if (batchCredits?.length === 0) {
        break;
      }

      // consume credits for each item
      for (const item of batchCredits) {
        // no need to consume more
        if (remainingToConsume <= 0) {
          break;
        }
        const toConsume = Math.min(remainingToConsume, item.remainingCredits);

        // update remaining credits
        await tx
          .update(credit)
          .set({ remainingCredits: item.remainingCredits - toConsume })
          .where(eq(credit.id, item.id));

        // update consumed items
        consumedItems.push({
          creditId: item.id,
          transactionNo: item.transactionNo,
          expiresAt: item.expiresAt,
          creditsToConsume: remainingToConsume,
          creditsConsumed: toConsume,
          creditsBefore: item.remainingCredits,
          creditsAfter: item.remainingCredits - toConsume,
          batchSize: batchSize,
          batchNo: batchNo,
        });

        batchNo += 1;
        remainingToConsume -= toConsume;

        // if too many batches, throw error
        if (batchNo > maxBatchNo) {
          throw new Error(`Too many batches: ${batchNo} > ${maxBatchNo}`);
        }
      }
    }

    // 3. create consumed credit
    const consumedCredit: NewCredit = {
      id: getUuid(),
      transactionNo: getSnowId(),
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
        or(
          isNull(credit.expiresAt), // Never expires
          gt(credit.expiresAt, currentTime) // Not yet expired
        )
      )
    );

  return parseInt(result?.total || '0');
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
  // 不想等说明已经被消费了
  if (creditRecord.credits !== creditRecord.remainingCredits) {
    const consumed = creditRecord.credits - creditRecord.remainingCredits;
    await db().update(credit).set({ status: CreditStatus.DELETED }).where(eq(credit.id, id));
    return { canDelete: false, consumed };
  }

  await db().delete(credit).where(eq(credit.id, id));
  return { canDelete: true };
}



