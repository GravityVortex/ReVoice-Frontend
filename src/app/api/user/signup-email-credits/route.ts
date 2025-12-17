import { NextRequest, NextResponse } from 'next/server';

import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionType } from '@/shared/models/credit';
import { findUserByEmail } from '@/shared/models/user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await createCredit({
      id: getUuid(),
      transactionNo: getShortUUID(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: 'email register',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      userId: user.id,
      userEmail: user.email,
      status: CreditStatus.ACTIVE,
      description: 'Email register',
      credits: 60,
      remainingCredits: 60,
      consumedDetail: '',
      metadata: '',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Grant signup credits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to grant credits' }, { status: 500 });
  }
}
