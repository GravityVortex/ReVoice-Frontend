import { NextRequest, NextResponse } from 'next/server';
import { updateUser } from '@/shared/models/user';

/**
 * POST /api/user/update
 * 更新用户信息
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, name, image } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    await updateUser(userId, {
      name: name.trim(),
      image: image || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
