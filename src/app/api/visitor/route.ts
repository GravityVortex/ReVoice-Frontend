import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

/**
 * 访客 ID 验证和同步 API
 * 
 * POST /api/visitor
 * - 验证客户端提交的访客 ID
 * - 如果没有 ID，生成新的服务端 ID
 * - 通过 Cookie 实现跨浏览器共享
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { visitorId: clientVisitorId, metadata } = body;

    // 直接使用客户端生成的硬件指纹作为访客 ID
    // 因为硬件指纹在同一台电脑的不同浏览器上是一致的
    let finalVisitorId: string;

    if (clientVisitorId && !clientVisitorId.startsWith('fallback_')) {
      // 客户端有有效的硬件指纹，直接使用
      finalVisitorId = clientVisitorId;
    } else {
      // 降级方案：生成服务端 ID
      finalVisitorId = `visitor_${nanoid(21)}`;
    }

    // 记录访客信息（可选：存入数据库进行去重和验证）
    console.log('Visitor tracked:', {
      visitorId: finalVisitorId,
      metadata,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
    });

    // 返回访客 ID（不再依赖 Cookie，因为 Cookie 无法跨浏览器）
    const response = NextResponse.json({
      success: true,
      visitorId: finalVisitorId,
    });

    return response;
  } catch (error) {
    console.error('Visitor API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process visitor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/visitor
 * - 获取当前访客 ID
 */
export async function GET(request: NextRequest) {
  const visitorId = request.cookies.get('visitor_id')?.value;

  if (visitorId) {
    return NextResponse.json({
      success: true,
      visitorId,
    });
  }

  return NextResponse.json(
    { success: false, error: 'No visitor ID found' },
    { status: 404 }
  );
}
