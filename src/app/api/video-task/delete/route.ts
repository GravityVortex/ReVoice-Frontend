import { NextRequest, NextResponse } from 'next/server';
import { getUserInfo } from '@/shared/models/user';
import { deleteFileOriginalById } from '@/shared/models/vt_file_original';

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

    // 更新del_status为1
    await deleteFileOriginalById(taskMainId);

    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json({ code: 500, message: '删除失败' }, { status: 500 });
  }
}
