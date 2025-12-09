import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { findUserByEmail } from '@/shared/models/user';

// 临时存储验证码（生产环境应使用 Redis）
const verificationCodes = new Map<string, { code: string; expires: number }>();

/**
 * POST /api/user/send-verification-code
 * 发送邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId } = body;

    if (!email || !userId) {
      return NextResponse.json(
        { success: false, error: 'Email and userId are required' },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // 检查邮箱是否已被其他用户使用
    const existingUser = await findUserByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 409 }
      );
    }

    // 生成6位数验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 存储验证码，5分钟有效期
    const expires = Date.now() + 5 * 60 * 1000;
    verificationCodes.set(`${userId}:${email}`, { code, expires });

    // TODO: 发送邮件验证码转发java接口
    // 这里应该调用邮件服务发送验证码
    console.log(`[验证码] 用户 ${userId} 的邮箱 ${email} 验证码: ${code}`);
    
    // 开发环境下直接返回验证码（生产环境删除）
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        success: true,
        message: 'Verification code sent',
        // 开发环境返回验证码方便测试
        devCode: code,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
    });
  } catch (error) {
    console.error('Send verification code error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send verification code' },
      { status: 500 }
    );
  }
}

// 导出验证码存储供其他 API 使用
export { verificationCodes };
