import { NextRequest, NextResponse } from 'next/server';

import { deleteCredit } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    const result = await deleteCredit(id);

    if (!result.canDelete) {
      return NextResponse.json({
        success: true,
        msg: `该积分已被消费 ${result.consumed} 积分，已标记删除，剩余积分无法再使用。`,
        consumed: result.consumed,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete credit error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete credit' }, { status: 500 });
  }
}
