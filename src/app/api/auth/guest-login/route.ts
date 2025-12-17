import { headers } from 'next/headers';

import { getAuth } from '@/core/auth';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createCredit, CreditStatus, CreditTransactionType, NewCredit } from '@/shared/models/credit';
import { generateGuestEmail, generateGuestId, generateGuestPassword } from '@/shared/models/guest-user';
import { findUserByEmail } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { visitorId, fingerprint, metadata } = body;

    // 优先使用 visitorId，向后兼容 fingerprint
    const deviceId = visitorId || fingerprint;

    if (!deviceId) {
      return respErr('visitorId or fingerprint is required');
    }

    const guestId = generateGuestId(deviceId);
    const email = generateGuestEmail(guestId);
    const password = generateGuestPassword(guestId);
    const name = `Guest_${guestId.substring(0, 6)}`;

    console.log('Guest login--->', {
      visitorId: deviceId,
      email,
      password,
      name,
      metadata: metadata
        ? {
            userAgent: metadata.userAgent,
            language: metadata.language,
          }
        : null,
    });

    const auth = await getAuth();

    // Try to register the user
    // We ignore errors here because if the user already exists, we just want to return the credentials
    // so the client can sign in.
    try {
      const res = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
        // We don't need the session here, the client will sign in
        asResponse: false,
      });
      console.log('res--->', res)
      // 查询刚注册的用户
      // const theUser = await findUserByEmail(email);
      const theUser = res.user;
      if (theUser) {
        // guest用户送积分
        const creditAdd: NewCredit = {
          id: getUuid(),
          transactionNo: getShortUUID(),
          transactionType: CreditTransactionType.GRANT, // 增加
          transactionScene: 'guest register',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 过期时间
          userId: theUser.id,
          userEmail: email,
          status: CreditStatus.ACTIVE,
          description: 'guest register',
          credits: 20, // 消耗积分
          remainingCredits: 20, // 充值积分，计数求和
          consumedDetail: '', // 消费关联1对多字段
          metadata: '',
        };
        createCredit(creditAdd);
      }
    } catch (e) {
      // Ignore error if user already exists
      // In a real app we might want to check specifically for "user already exists" error
      console.log('Guest registration error (likely already exists):', e);
    }

    return respData({
      email,
      password,
    });
  } catch (e) {
    console.error('Guest login failed:', e);
    return respErr('guest login failed');
  }
}
