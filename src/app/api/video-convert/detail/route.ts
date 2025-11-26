import { respData, respErr } from "@/shared/lib/resp";
import { findVideoConvertById } from "@/shared/models/video_convert";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return respErr("missing id parameter");
    }

    const videoId = parseInt(id);
    if (isNaN(videoId)) {
      return respErr("invalid id parameter");
    }

    // 获取视频详情
    const videoDetail = await findVideoConvertById(videoId);

    if (!videoDetail) {
      return respErr("video not found");
    }

    return respData(videoDetail);
  } catch (e) {
    console.log("get video detail failed:", e);
    return respErr("get video detail failed");
  }
}
