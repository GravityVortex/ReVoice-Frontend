import { NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/core/auth';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionType, findCreditsByUserId } from '@/shared/models/credit';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || '';
    // const auth = await getAuth();
    // const session = await auth.api.getSession({ headers: request.headers });

    // if (!session?.user) {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    // }

    // Check if user already has credits (to avoid duplicate grants)
    const existingCredits = await findCreditsByUserId(userId, 'social register');
    if (existingCredits) {
      return NextResponse.json({ success: true, message: 'Credits already granted', credit: existingCredits});
    }
    return NextResponse.json({ success: true, message: '未奖励积分！' });
  } catch (error) {
    console.error('Grant social credits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to grant credits' }, { status: 500 });
  }
}
