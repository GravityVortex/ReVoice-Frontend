import { respData, respErr } from "@/shared/lib/resp";
import { getVideoConvertList, getVideoConvertTotal } from "@/shared/models/video_convert";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || '1');
    const limit = parseInt(searchParams.get("limit") || '20');
    const userId = searchParams.get("userId") || '';

    // 获取视频列表和总数
    const videoList = await getVideoConvertList(userId, page, limit);
    const totalCount = await getVideoConvertTotal(userId);
    
    // 计算分页信息
    const totalPages = Math.ceil((totalCount || 0) / limit);
    
    const paginationData = {
      list: videoList,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      }
    };

    return respData(paginationData);
  } catch (e) {
    console.log("failed:", e);
    return respErr("failed");
  }
}
