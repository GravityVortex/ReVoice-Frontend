import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { account } from '@/config/db/schema';
import { getShortUUID, getUuid } from '@/shared/lib/hash';
import { createCredit, CreditStatus, CreditTransactionType, NewCredit } from '@/shared/models/credit';
import { findUserByEmail, findUserById, updateUserWithEmail } from '@/shared/models/user';

// import { verificationCodes } from '../send-verification-code/route';

/**
 * POST /api/user/verify-guest
 * 验证访客账号并升级为正式账号
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, verificationCode, password } = body;

    // 参数验证
    if (!userId || !email || !verificationCode || !password) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
    }

    // 验证密码规则：至少8位，包含大小写字母
    if (password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    if (!hasUpperCase || !hasLowerCase) {
      return NextResponse.json({ success: false, error: 'Password must contain both uppercase and lowercase letters' }, { status: 400 });
    }

    // 验证验证码
    const user = await findUserById(userId);
    // const key = `${userId}:${email}`;
    // const storedCode = verificationCodes.get(key);
    const storedCode = JSON.parse(user.data || '{}');
    // 调试日志
    console.log('[验证码验证] storedCode:', storedCode);

    if (!storedCode || !storedCode.code) {
      return NextResponse.json({ success: false, error: 'Verification code not found or expired' }, { status: 400 });
    }

    if (storedCode.expires < Date.now()) {
      // verificationCodes.delete(key);
      // 删除验证码
      await updateUserWithEmail(userId, { data: '' });
      return NextResponse.json({ success: false, error: 'Verification code expired' }, { status: 400 });
    }

    if (storedCode.code !== verificationCode) {
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 400 });
    }

    // 验证通过，删除验证码
    // verificationCodes.delete(key);
    // 删除验证码
    await updateUserWithEmail(userId, { data: '' });

    // 获取用户信息
    // const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // 验证是否是访客账号
    const currentEmail = user.email || '';
    if (!currentEmail.startsWith('guest_') || !currentEmail.endsWith('@temp.local')) {
      return NextResponse.json({ success: false, error: 'Not a guest account' }, { status: 400 });
    }

    // 再次检查邮箱是否已被其他用户使用（双重保险）
    const emailExists = await findUserByEmail(email);
    if (emailExists && emailExists.id !== userId) {
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });
    }

    // 更新用户邮箱和邮箱验证状态
    await updateUserWithEmail(userId, {
      email,
      emailVerified: true, // 标记邮箱已验证
    });

    // 使用 bcrypt 加密密码（与 better-auth 配置的加密方式一致）
    const hashedPassword = await bcrypt.hash(password, 10);

    // 更新或创建 account 记录（密码存储在 account 表）
    // 查找该用户的 credential account
    const [existingAccount] = await db().select().from(account).where(eq(account.userId, userId));

    if (existingAccount) {
      // 更新现有 account 的密码
      await db().update(account).set({ password: hashedPassword }).where(eq(account.userId, userId));
    } else {
      // 创建新的 credential account
      await db()
        .insert(account)
        .values({
          id: `${userId}_credential`,
          accountId: email,
          providerId: 'credential',
          userId: userId,
          password: hashedPassword,
        });
    }
    // 奖励40积分差额，在credit表中插入一条记录，有效期180天
    const creditAdd: NewCredit = {
      id: getUuid(),
      transactionNo: getShortUUID(),
      transactionType: CreditTransactionType.GRANT, // 增加
      transactionScene: 'guest verify',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 过期时间
      userId: userId,
      userEmail: email,
      status: CreditStatus.ACTIVE,
      description: 'guest用户认证奖励',
      credits: 40, // 匿名用户20积分，注册用户60积分，补差额
      remainingCredits: 40, // 充值积分，计数求和
      consumedDetail: '', // 消费关联1对多字段
      metadata: '',
    };
    createCredit(creditAdd);

    return NextResponse.json({
      success: true,
      message: 'Account verified successfully',
    });
  } catch (error: any) {
    console.error('Verify guest error:', error);

    // 处理邮箱重复错误
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });
    }

    return NextResponse.json({ success: false, error: 'Failed to verify account' }, { status: 500 });
  }
}
