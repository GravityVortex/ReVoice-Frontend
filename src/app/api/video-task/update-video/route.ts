import { respData, respErr } from "@/shared/lib/resp";
import { updateVideoConvert } from "@/shared/models/video_convert";
import { updateVtFileOriginal, updateVtFileOriginalCoverTitle } from "@/shared/models/vt_file_original";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, fileName, cover_key, cover_size} = body;

    if (!id || !cover_key) {
      return respErr("missing id parameter");
    }

    // const videoId = parseInt(id);
    // if (isNaN(videoId)) {
    //   return respErr("invalid id parameter");
    // }

    // 修改vt_file_orginal表数据
    const res = await updateVtFileOriginalCoverTitle(id, fileName, cover_key, cover_size);
    
    if (!res) {
      return respErr("update video failed");
    }

    return respData(res);
  } catch (e) {
    console.log("update video failed:", e);
    return respErr("update video failed");
  }
}
