import { NextRequest, NextResponse } from 'next/server';

import { deletePathAndFiles } from '@/extensions/storage/privateR2Util';
import { getUserInfo } from '@/shared/models/user';
import { deleteById, findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { deleteByOriginalFileId } from '@/shared/models/vt_task_main';
import { hasPermission } from '@/shared/services/rbac';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { code: 405, message: 'Method Not Allowed' },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ code: 401, message: '未授权' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const originalFileId =
      (body?.originalFileId as string | undefined) ||
      request.nextUrl.searchParams.get('originalFileId') ||
      '';

    if (!originalFileId) {
      return NextResponse.json({ code: 400, message: '缺少originalFileId参数' }, { status: 400 });
    }

    const file = await findVtFileOriginalById(originalFileId);
    if (!file) {
      return NextResponse.json({ code: 404, message: '文件不存在' }, { status: 404 });
    }
    if (file.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return NextResponse.json({ code: 403, message: '无权限' }, { status: 403 });
      }
    }

    // 删除vt_task_main表数据
    await deleteByOriginalFileId(originalFileId);
    // 删除vt_file_original表数据
    await deleteById(originalFileId);

    const env = process.env.ENV || 'dev';
    const r2Path = `${env}/${file.userId}/${originalFileId}/`;
    // 删除R2指定路径及其下所有文件
    await deletePathAndFiles(r2Path);

    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json({ code: 500, message: '删除失败' }, { status: 500 });
  }
}
