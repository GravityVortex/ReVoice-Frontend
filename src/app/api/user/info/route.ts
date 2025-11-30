import { NextRequest, NextResponse } from 'next/server';
import { getUserInfo } from '@/shared/models/user';

/**
 * GET /api/user/info
 * 获取当前用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserInfo();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Get user info error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get user info' },
      { status: 500 }
    );
  }
}
