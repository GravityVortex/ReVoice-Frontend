import { getUuid } from "@/shared/lib/hash";
import { respData, respErr } from "@/shared/lib/resp";
// import { newStorage } from "@/shared/lib/storage";
import { getStorageService } from '@/shared/services/storage';
import { insertVideoConvert } from "@/shared/models/video_convert";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // basic validation for mp4
    // const res = {};
    // console.log("upload-file success--->", res);
    const user_uuid = (form.get("user_uuid") as string) || '';
    const title = (form.get("title") as string) || '';
    const description = (form.get("description") as string) || '';
    const content = (form.get("content") as string) || '';
    const duration = (form.get("duration") as string) || '';
    const source_vdo_url = (form.get("source_vdo_url") as string) || '';

    // 添加视频转换记录
    const videoConvert = await insertVideoConvert({
      uuid: getUuid(),
      user_uuid: user_uuid,
      title: title,
      description: description,
      content: content,
      duration: duration,
      source_vdo_url: source_vdo_url,
      created_at: new Date(),
      status: "created",
      locale: "zh",
    });

    // 将视频转换记录添加到返回结果中
    return respData({
      ...res,
      videoConvert
    });
  } catch (e) {
    console.log("upload-file failed:", e);
    return respErr("upload file failed");
  }
}
