import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { getPreSignedUrl, SignUrlItem } from '@/shared/services/javaService';
import { hasPermission } from '@/shared/services/rbac';

/**
 * 下载音频
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');
    const expiresInParam = searchParams.get('expiresIn');
    const taskId = searchParams.get('taskId');

    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ code: 401, message: '未授权' }, { status: 401 });
    }

    if (!key) {
      return NextResponse.json({ code: -1, message: '缺少 key 或 bucket 参数' }, { status: 400 });
    }
    if (!taskId) {
      return NextResponse.json({ code: -1, message: '缺少 taskId 参数' }, { status: 400 });
    }
    if (key.includes('..') || key.startsWith('/')) {
      return NextResponse.json({ code: -1, message: '非法 key' }, { status: 400 });
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) {
      return NextResponse.json({ code: -1, message: '任务不存在' }, { status: 404 });
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return NextResponse.json({ code: -1, message: '无权限' }, { status: 403 });
      }
    }
    if (!key.startsWith(`${task.userId}/${taskId}/`)) {
      return NextResponse.json({ code: -1, message: '无权限' }, { status: 403 });
    }

    // 解析过期时间（默认 1 小时）
    const expiresInRaw = Number.parseInt(expiresInParam || '', 10);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3600;
    const expirationMinutes = Math.max(1, Math.min(24 * 60, Math.ceil(expiresIn / 60)));
    // 计算实际过期时间
    let downloadUrl;

    // Always sign via Java (centralized control-plane).
    const params: SignUrlItem[] = [{ path: key, operation: 'download', expirationMinutes }];
    const resUrlArr = await getPreSignedUrl(params);
    downloadUrl = resUrlArr[0].url;

    return NextResponse.json({
      code: 0,
      message: '成功',
      data: {
        url: downloadUrl,
        expiresIn: expiresIn,
        // expiresAt: expiresAt?.toISOString(),
        key,
      },
    });
  } catch (error) {
    console.error('[Download API] 生成下载链接失败:', error);
    return NextResponse.json(
      {
        code: -1,
        message: error instanceof Error ? error.message : '生成下载链接失败',
      },
      { status: 500 }
    );
  }
}
