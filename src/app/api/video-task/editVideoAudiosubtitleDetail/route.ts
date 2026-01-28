import { NextRequest, NextResponse } from 'next/server';
import { getMockJsonData } from './mock-data';
import { getDBJsonData } from './db-data';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { hasPermission } from '@/shared/services/rbac';

/**
 * 模拟接口：获取视频转换详情
 * GET /api/video-task/editVideoAudiosubtitleDetail?taskMainId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskMainId = searchParams.get('taskMainId');

    if (!taskMainId) {
      return NextResponse.json(
        {
          code: '400',
          msg: '缺少taskMainId参数',
          data: null,
        },
        { status: 400 }
      );
    }

    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { code: '401', msg: '未授权', data: null },
        { status: 401 }
      );
    }

    const task = await findVtTaskMainById(taskMainId);
    if (!task) {
      return NextResponse.json(
        { code: '404', msg: '任务不存在', data: null },
        { status: 404 }
      );
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return NextResponse.json(
          { code: '403', msg: '无权限', data: null },
          { status: 403 }
        );
      }
    }


    // DOEND 本地模拟（宝20251205修复后）
    // const resData = getMockJsonData(convertId, 'local_001');
    // xuww上传的（宝20251205修复后）
    // const resData = getMockJsonData(taskMainId, 'upload_001');

    // 延迟测试
    // await new Promise(resolve => setTimeout(resolve, 55500));

    const resDataReal = await getDBJsonData(taskMainId);
    console.log('真实请求resData--->', resDataReal);

    return NextResponse.json(resDataReal, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('获取转换详情失败:', error);
    return NextResponse.json(
      {
        code: '500',
        msg: '服务器错误',
        data: null,
      },
      { status: 500 }
    );
  }
}
