import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { account } from '@/config/db/schema';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { respErr } from '@/shared/lib/resp';
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
    // sync the credential password so the deterministic password keeps working.
    let existingUser = await findUserByEmail(email);
    if (!existingUser) {
      try {
        const res = await auth.api.signUpEmail({
          body: { email, password, name },
          asResponse: false,
        });

        if (res?.user) {
          existingUser = res.user as any;
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
      } catch (e) {
        // Likely a race (already exists) or DB error; only fall back when the user exists.
        existingUser = await findUserByEmail(email);
        if (!existingUser) {
          console.error('Guest registration failed:', e);
          return respErr('guest login failed');
        }
      }
    }

    if (!existingUser) {
      return respErr('guest login failed');
    }

    // Ensure credential account password matches the deterministic guest password.
    // If we ever change the guest password algorithm, this keeps old guest users working.
    const whereCredentialAccount = and(
      eq(account.userId, existingUser.id),
      eq(account.providerId, 'credential')
    );

    const [credentialAccount] = await db()
      .select({ password: account.password })
      .from(account)
      .where(whereCredentialAccount)
      .limit(1);

    if (!credentialAccount) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db().insert(account).values({
        id: getUuid(),
        accountId: existingUser.id,
        providerId: 'credential',
        userId: existingUser.id,
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      const currentPassword = credentialAccount.password;
      const isBcryptHash =
        typeof currentPassword === 'string' && currentPassword.startsWith('$2');
      const matches =
        isBcryptHash ? await bcrypt.compare(password, currentPassword) : false;

      if (!matches) {
        await db()
          .update(account)
          .set({ password: await bcrypt.hash(password, 10), updatedAt: new Date() })
          .where(whereCredentialAccount);
      }
    }

    // Sign in server-side so the client doesn't need a second request that can fail/race.
    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });

    // Forward all auth cookies (better-auth sets multiple Set-Cookie headers).
    // Some runtimes don't expose Headers.getSetCookie(); iterating preserves duplicates.
    const setCookies: string[] = (() => {
      const headersAny = signInResponse.headers as any;
      if (typeof headersAny.getSetCookie === 'function') {
        return headersAny.getSetCookie();
      }

      const cookies: string[] = [];
      for (const [key, value] of signInResponse.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
          cookies.push(value);
        }
      }
      if (cookies.length > 0) {
        return cookies;
      }

      const cookie = signInResponse.headers.get('set-cookie');
      return cookie ? [cookie] : [];
    })();

    if (!signInResponse.ok) {
      console.error('Guest sign-in failed:', signInResponse.status);
      return respErr('guest login failed');
    }

    // Don't return session tokens to JS; cookie is already set.
    const signInData = await signInResponse.json().catch(() => null);
    const responseHeaders = new Headers();
    for (const cookie of setCookies) {
      responseHeaders.append('set-cookie', cookie);
    }

    return Response.json(
      { code: 0, message: 'ok', data: { user: signInData?.user } },
      { headers: responseHeaders }
    );
  } catch (e) {
    console.error('Guest login failed:', e);
    return respErr('guest login failed');
  }
}
