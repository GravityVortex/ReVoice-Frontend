import { respData, respErr } from "@/shared/lib/resp";
import { updateSingleSubtitleItem } from "@/shared/models/vt_task_subtitle";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, type, seq, item } = body;

    if (!taskId || !type || !seq || !item) {
      return respErr("missing required parameters");
    }

    await updateSingleSubtitleItem(taskId, type, seq, item);

    return respData({ taskId, type, seq, message: '保存成功' });
  } catch (e) {
    console.log("update subtitle item failed:", e);
    return respErr("update subtitle item failed");
  }
}
