import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

import { findUserByEmail, updateUserWithEmail } from '@/shared/models/user';
import { sendEmail } from '@/shared/services/javaService';


/**
 * POST /api/user/send-verification-code
 * 发送邮箱验证码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email} = body;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email are required' }, { status: 400 });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
    }
    // 检查邮箱是否已被其他用户使用
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });
    }
    // 生成6位数验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;
    // 这里应该调用邮件服务发送验证码
    console.log(`注册发送验证码 ${email} 验证码: ${code}`);
    // 发送
    const backJO = await sendEmail(
      email,
      '【这声】验证码',
      `<h1>【这声】验证码</h1><p>欢迎使用【这声】产品，您的验证码为：${code}，有效期5分钟，请勿泄露。</p>`
    );
    // 发送失败
    if (backJO.code !== 1000) {
      return NextResponse.json({ success: false, error: 'Failed to send verification code' });
    }

    return NextResponse.json({
      success: true,
      code: code,
      expires: expires,
      message: 'Verification code sent to your email',
    });

  } catch (error) {
    console.error('Send verification code error:', error);
    return NextResponse.json({ success: false, error: 'Failed to send verification code' }, { status: 500 });
  }
}

// 导出验证码存储供其他 API 使用
// export { verificationCodes };
