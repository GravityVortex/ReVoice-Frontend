import { NextRequest, NextResponse } from 'next/server';

import { deletePathAndFiles } from '@/extensions/storage/privateR2Util';
import { deleteById } from '@/shared/models/vt_file_original';
import { deleteByOriginalFileId } from '@/shared/models/vt_task_main';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originalFileId = searchParams.get('originalFileId');
    const userId = searchParams.get('userId');

    if (!originalFileId) {
      return NextResponse.json({ code: 400, message: '缺少originalFileId参数' }, { status: 400 });
    }
    // 删除vt_task_main表数据
    await deleteByOriginalFileId(originalFileId);
    // 删除vt_file_original表数据
    await deleteById(originalFileId);

    if (userId) {
      let env = process.env.ENV || 'dev';
      // const keyV = 'original/video/video_original.mp4';
      const r2Path = `${env}/${userId}/${originalFileId}/`;
      // 删除R2指定路径及其下所有文件
      await deletePathAndFiles(r2Path);
    }

    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json({ code: 500, message: '删除失败' }, { status: 500 });
  }
}
