import { NextRequest, NextResponse } from 'next/server';

import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionType, NewCredit } from '@/shared/models/credit';
import { findUserByEmail, getUserInfo } from '@/shared/models/user';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, credits, description, expiresAt } = body;

    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    if (!credits || credits <= 0) {
      return NextResponse.json({ success: false, error: 'Credits must be greater than 0' }, { status: 400 });
    }

    const theUser = await findUserByEmail(email);
    if (!theUser) {
      return NextResponse.json({ success: false, error: `User not found: ${email}` }, { status: 404 });
    }

    const creditAdd: NewCredit = {
      id: getUuid(),
      transactionNo: getShortUUID(),
      transactionType: CreditTransactionType.GRANT,
      transactionScene: 'admin give',
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      userId: theUser.id,
      userEmail: theUser.email,
      status: CreditStatus.ACTIVE,
      description: description || '手动充值',
      credits,
      remainingCredits: credits,
      consumedDetail: '',
      metadata: '',
    };

    await createCredit(creditAdd);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Grant credits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to grant credits' }, { status: 500 });
  }
}
