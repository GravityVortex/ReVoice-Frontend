import { NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/core/auth';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionType, findCreditsByUserId } from '@/shared/models/credit';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has credits (to avoid duplicate grants)
    const existingCredits = await findCreditsByUserId(session.user.id, 'social register');
    if (existingCredits) {
      return NextResponse.json({ success: true, message: 'Credits already granted' });
    }

    await createCredit({
      id: getUuid(),
      transactionNo: getShortUUID(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: 'social register',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      userId: session.user.id,
      userEmail: session.user.email,
      status: CreditStatus.ACTIVE,
      description: 'Social register',
      credits: 60,
      remainingCredits: 60,
      consumedDetail: '',
      metadata: '',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Grant social credits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to grant credits' }, { status: 500 });
  }
}
