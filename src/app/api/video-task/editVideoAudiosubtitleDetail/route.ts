import { NextRequest, NextResponse } from 'next/server';
import { getMockJsonData } from './mock-data';
import { getDBJsonData } from './db-data';

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


    // TODO 本地模拟（宝20251205修复后）
    // const resData = getMockJsonData(convertId, 'local_001');
    // xuww上传的（宝20251205修复后）
    // const resData = getMockJsonData(taskMainId, 'upload_001');
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
