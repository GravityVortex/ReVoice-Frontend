import { headers } from 'next/headers';

import { getAuth } from '@/core/auth';
import { respData, respErr } from '@/shared/lib/resp';
import {
  generateGuestEmail,
  generateGuestId,
  generateGuestPassword,
} from '@/shared/models/guest-user';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fingerprint } = body;

    if (!fingerprint) {
      return respErr('fingerprint is required');
    }

    const guestId = generateGuestId(fingerprint);
    const email = generateGuestEmail(guestId);
    const password = generateGuestPassword(guestId);
    const name = `Guest_${guestId.substring(0, 6)}`;
    console.log('Guest login--->', { email, password, name });

    const auth = await getAuth();
    
    // Try to register the user
    // We ignore errors here because if the user already exists, we just want to return the credentials
    // so the client can sign in.
    try {
      await auth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
        // We don't need the session here, the client will sign in
        asResponse: false, 
      });
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
