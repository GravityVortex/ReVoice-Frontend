import { NextRequest, NextResponse } from 'next/server';
import { getUserInfo } from '@/shared/models/user';
import { deleteFileOriginalById, findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { hasPermission } from '@/shared/services/rbac';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ code: 401, message: '未授权' }, { status: 401 });
    }

    const { taskMainId } = await request.json();
    if (!taskMainId) {
      return NextResponse.json({ code: 400, message: '缺少taskMainId参数' }, { status: 400 });
    }

    const file = await findVtFileOriginalById(taskMainId);
    if (!file) {
      return NextResponse.json({ code: 404, message: '文件不存在' }, { status: 404 });
    }
    if (file.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return NextResponse.json({ code: 403, message: '无权限' }, { status: 403 });
      }
    }

    // 更新del_status为1
    await deleteFileOriginalById(taskMainId);

    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json({ code: 500, message: '删除失败' }, { status: 500 });
  }
}
