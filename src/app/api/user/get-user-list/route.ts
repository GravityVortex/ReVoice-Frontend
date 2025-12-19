import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo, getUsers, getUsersCount } from '@/shared/models/user';

/**
 * GET /api/user/info
 * 获取当前用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' });
    }
    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get('email') || '';
    const pageNum = parseInt(searchParams.get('pageNum') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '30');

    const total = await getUsersCount({
      email,
    });
    const users = await getUsers({
      email,
      page: pageNum,
      limit: pageSize,
    });

    return NextResponse.json({
      success: true,
      users,
      total,
      pageNum,
      pageSize,
    });
  } catch (error) {
    console.error('Get user info error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get user info' }, { status: 500 });
  }
}
