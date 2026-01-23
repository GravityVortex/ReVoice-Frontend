import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { account } from '@/config/db/schema';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { createCredit, CreditStatus, CreditTransactionType, NewCredit } from '@/shared/models/credit';
import { generateGuestEmail, generateGuestId, generateGuestPassword } from '@/shared/models/guest-user';
import { findUserByEmail } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { visitorId, fingerprint } = body;

    // 优先使用 visitorId，向后兼容 fingerprint
    const deviceId = visitorId || fingerprint;

    if (!deviceId) {
      return respErr('visitorId or fingerprint is required');
    }

    const guestId = generateGuestId(deviceId);
    const email = generateGuestEmail(guestId);
    const password = generateGuestPassword(guestId);
    const name = `Guest_${guestId.substring(0, 6)}`;

    // Avoid logging credentials (even guest ones).

    const auth = await getAuth();

    // Guest credentials must be stable. If the user already exists (e.g. password algorithm changed),
    // sync the credential password so the returned password always works.
    let existingUser = await findUserByEmail(email);
    if (!existingUser) {
      try {
        const res = await auth.api.signUpEmail({
          body: { email, password, name },
          // Client will sign in separately.
          asResponse: false,
        });

        if (res?.user) {
          const creditAdd: NewCredit = {
            id: getUuid(),
            transactionNo: getShortUUID(),
            transactionType: CreditTransactionType.GRANT,
            transactionScene: 'guest register',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            userId: res.user.id,
            userEmail: email,
            status: CreditStatus.ACTIVE,
            description: 'guest register',
            credits: 20,
            remainingCredits: 20,
            consumedDetail: '',
            metadata: '',
          };
          await createCredit(creditAdd);
        }

        return respData({ email, password });
      } catch (e) {
        // Likely a race (already exists) or DB error; only fall back when the user exists.
        existingUser = await findUserByEmail(email);
        if (!existingUser) {
          console.error('Guest registration failed:', e);
          return respErr('guest login failed');
        }
      }
    }

    // Ensure credential account password matches the deterministic guest password.
    // If we ever change the guest password algorithm, this keeps old guest users working.
    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await db()
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(eq(account.userId, existingUser.id), eq(account.providerId, 'credential'))
      )
      .returning({ id: account.id });

    if (updated.length === 0) {
      await db().insert(account).values({
        id: getUuid(),
        accountId: existingUser.id,
        providerId: 'credential',
        userId: existingUser.id,
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return respData({ email, password });
  } catch (e) {
    console.error('Guest login failed:', e);
    return respErr('guest login failed');
  }
}
