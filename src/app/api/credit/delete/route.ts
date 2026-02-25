import { NextRequest, NextResponse } from 'next/server';

import { deleteCredit } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { PERMISSIONS } from '@/core/rbac';
import { hasPermission } from '@/shared/services/rbac';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const canWrite = await hasPermission(user.id, PERMISSIONS.CREDITS_WRITE).catch(() => false);
    if (!canWrite) {
      return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    const result = await deleteCredit(id);

    if (!result.canDelete) {
      return NextResponse.json(
        {
          success: false,
          error: `Credit already consumed (${result.consumed}). Refusing to delete for ledger safety.`,
          consumed: result.consumed,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete credit error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete credit' }, { status: 500 });
  }
}
