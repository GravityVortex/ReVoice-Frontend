# Stripe 订阅支付成功赠送积分逻辑

## 概述

本文档说明 Stripe 订阅支付成功后自动赠送积分的完整实现逻辑。

## 工作流程

### 1. Stripe Webhook 事件触发

当用户订阅支付成功时，Stripe 会发送以下 webhook 事件：

- **首次订阅**：`checkout.session.completed`
- **订阅续费**：`invoice.payment_succeeded`

### 2. Webhook 接口处理

**文件位置**：[src/app/api/payment/notify/[provider]/route.ts](src/app/api/payment/notify/[provider]/route.ts)

```typescript
// 接收 Stripe webhook 通知
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> })
```

**处理逻辑**：

1. 获取支付提供商（stripe）
2. 解析 webhook 事件
3. 根据事件类型分发处理：
   - `CHECKOUT_SUCCESS`：首次订阅支付 → `handleCheckoutSuccess`
   - `PAYMENT_SUCCESS` + `RENEWAL`：订阅续费 → `handleSubscriptionRenewal`

### 3. 事件类型映射

**文件位置**：[src/extensions/payment/stripe.ts:344-359](src/extensions/payment/stripe.ts#L344-L359)

```typescript
private mapStripeEventType(eventType: string): PaymentEventType {
  switch (eventType) {
    case 'checkout.session.completed':
      return PaymentEventType.CHECKOUT_SUCCESS;
    case 'invoice.payment_succeeded':
      return PaymentEventType.PAYMENT_SUCCESS;
    // ...
  }
}
```

### 4. 订阅周期类型识别

**文件位置**：[src/extensions/payment/stripe.ts:489-494](src/extensions/payment/stripe.ts#L489-L494)

通过 `invoice.billing_reason` 判断：
- `subscription_create`：首次订阅
- `subscription_cycle`：订阅续费

## 积分赠送实现

### 首次订阅赠送积分

**文件位置**：[src/shared/services/payment.ts:118-253](src/shared/services/payment.ts#L118-L253)

**函数**：`handleCheckoutSuccess`

**流程**：

1. 更新订单状态为 `PAID`
2. 创建订阅记录（包含 `creditsAmount` 和 `creditsValidDays`）
3. 创建积分记录：

```typescript
if (order.creditsAmount && order.creditsAmount > 0) {
  newCredit = {
    userId: order.userId,
    credits: order.creditsAmount,  // 积分数量
    transactionType: CreditTransactionType.GRANT,
    transactionScene: CreditTransactionScene.SUBSCRIPTION,
    expiresAt: calculateCreditExpirationTime({
      creditsValidDays: order.creditsValidDays,
      currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
    }),
    status: CreditStatus.ACTIVE,
  };
}
```

### 订阅续费赠送积分

**文件位置**：[src/shared/services/payment.ts:378-498](src/shared/services/payment.ts#L378-L498)

**函数**：`handleSubscriptionRenewal`

**流程**：

1. 验证订阅信息
2. 更新订阅周期（`currentPeriodStart`、`currentPeriodEnd`）
3. 创建续费订单（`PaymentType.RENEW`）
4. **自动赠送积分**：

```typescript
// 从订阅记录中读取积分配置
if (order.creditsAmount && order.creditsAmount > 0) {
  newCredit = {
    userId: order.userId,
    credits: order.creditsAmount,  // 从 subscription.creditsAmount 获取
    transactionType: CreditTransactionType.GRANT,
    transactionScene: CreditTransactionScene.PAYMENT,
    expiresAt: calculateCreditExpirationTime({
      creditsValidDays: order.creditsValidDays,
      currentPeriodEnd: subscriptionInfo?.currentPeriodEnd,
    }),
    status: CreditStatus.ACTIVE,
  };
}
```

5. 在事务中更新订阅和创建积分记录

## 积分有效期计算

**文件位置**：[src/shared/models/credit.ts:36-50](src/shared/models/credit.ts#L36-L50)

**函数**：`calculateCreditExpirationTime`

**逻辑**：

```typescript
export function calculateCreditExpirationTime({
  creditsValidDays,
  currentPeriodEnd,
}: {
  creditsValidDays: number;
  currentPeriodEnd?: Date;
}): Date | null {
  // creditsValidDays <= 0：永不过期
  if (!creditsValidDays || creditsValidDays <= 0) {
    return null;
  }

  // 有订阅周期：使用 currentPeriodEnd
  // 无订阅周期：当前时间 + creditsValidDays
}
```

## 配置说明

### 如何设置每月赠送 300 积分

在创建订阅产品时，需要配置以下字段：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| `creditsAmount` | 每次赠送的积分数量 | `300` |
| `creditsValidDays` | 积分有效天数（0 表示永不过期） | `30` 或 `0` |

这些配置会保存在 `subscriptions` 表中，每次续费时自动读取。

### 数据库表结构

**订阅表**（`subscriptions`）：
- `creditsAmount`：积分数量
- `creditsValidDays`：积分有效天数
- `currentPeriodStart`：当前周期开始时间
- `currentPeriodEnd`：当前周期结束时间

**积分表**（`credits`）：
- `credits`：积分数量
- `remainingCredits`：剩余积分
- `transactionType`：交易类型（`grant` / `consume`）
- `transactionScene`：交易场景（`subscription` / `payment` / `renewal`）
- `expiresAt`：过期时间

## 防重复赠送机制

### 首次订阅

通过订单状态（`OrderStatus.PAID`）防止重复处理。

### 订阅续费

1. 检查订阅是否存在
2. 验证 `subscriptionId` 匹配
3. 每次 webhook 事件创建新的续费订单和积分记录

## Webhook 配置

### Stripe Dashboard 配置

需要在 Stripe Dashboard 中配置 webhook 端点：

```
https://your-domain.com/api/payment/notify/stripe
```

### 监听事件

- `checkout.session.completed`
- `invoice.payment_succeeded`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 环境变量

```env
STRIPE_SECRET_KEY=sk_xxx
STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_SIGNING_SECRET=whsec_xxx  # Webhook 签名密钥
```

## 测试验证

### 检查订阅配置

```sql
SELECT subscriptionNo, userId, creditsAmount, creditsValidDays, status
FROM subscriptions
WHERE status = 'active';
```

### 检查积分记录

```sql
SELECT userId, credits, transactionScene, expiresAt, createdAt
FROM credits
WHERE transactionType = 'grant'
ORDER BY createdAt DESC
LIMIT 10;
```

### Stripe CLI 测试

```bash
# 测试续费 webhook
stripe trigger invoice.payment_succeeded
```

## 相关文件

- [src/app/api/payment/notify/[provider]/route.ts](src/app/api/payment/notify/[provider]/route.ts) - Webhook 接口
- [src/shared/services/payment.ts](src/shared/services/payment.ts) - 支付处理逻辑
- [src/extensions/payment/stripe.ts](src/extensions/payment/stripe.ts) - Stripe 提供商实现
- [src/shared/models/credit.ts](src/shared/models/credit.ts) - 积分模型
- [src/shared/models/subscription.ts](src/shared/models/subscription.ts) - 订阅模型
- [src/shared/models/order.ts](src/shared/models/order.ts) - 订单模型

## 注意事项

1. **Webhook 安全性**：必须配置 `STRIPE_SIGNING_SECRET` 验证 webhook 签名
2. **幂等性**：Stripe 可能重发 webhook，需确保处理逻辑幂等
3. **事务处理**：订单、订阅、积分更新在同一事务中完成
4. **积分过期**：根据 `creditsValidDays` 自动计算过期时间
5. **错误处理**：webhook 处理失败会返回 500，Stripe 会自动重试
