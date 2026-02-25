export const PROMO_PRODUCT_ID = 'promo-3d';

const PROMO_ENTITLEMENT_TXN_PREFIX = 'promo_entitlement:';
const PROMO_PURCHASE_TXN_PREFIX = 'promo_purchase:';

export function getPromoEntitlementTransactionNo(userId: string) {
  return `${PROMO_ENTITLEMENT_TXN_PREFIX}${userId}`;
}

export function getPromoPurchaseTransactionNo(orderNo: string) {
  return `${PROMO_PURCHASE_TXN_PREFIX}${orderNo}`;
}

