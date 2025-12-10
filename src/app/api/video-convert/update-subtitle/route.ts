import { respData, respErr } from "@/shared/lib/resp";
import { updateSubtitleDataByTaskId } from "@/shared/models/vt_task_subtitle";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, type, content} = body;

    if (!taskId || !type || !content) {
      return respErr("missing taskId or type or content parameter");
    }

    // 更新字幕大JSON数据
    const updatedSubtitle = await updateSubtitleDataByTaskId(taskId, type, content);

    if (!updatedSubtitle) {
      return respErr("update subtitle failed");
    }

    return respData(updatedSubtitle);
  } catch (e) {
    console.log("update subtitle failed:", e);
    return respErr("update subtitle failed");
  }
}
