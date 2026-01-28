import { getUuid } from "@/shared/lib/hash";
import { respData, respErr } from "@/shared/lib/resp";
// import { newStorage } from "@/shared/lib/storage";
import { getStorageService } from '@/shared/services/storage';
import { insertVideoConvert } from "@/shared/models/video_convert";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { getAllConfigs } from '@/shared/models/config';
import { getUserInfo } from '@/shared/models/user';
import { checkSoulDubAccess } from '@/shared/lib/souldub';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr("unauthorized");
    }

    const configs = await getAllConfigs();
    if (!checkSoulDubAccess(user.email, configs, !!(user as any).isAdmin)) {
      return respErr("SoulDub feature is currently in early access. Please contact support to join the waitlist.");
    }

    const form = await req.formData();
    const file = form.get("file");
    const prefix = (form.get("prefix") as string) || "uploads/videos";

    if (!file || !(file instanceof File)) {
      return respErr("missing file field");
    }

    // basic validation for mp4
    const contentType = file.type || "video/mp4";
    const filename = file.name || "video.mp4";
    const lower = filename.toLowerCase();
    if (!lower.endsWith(".mp4") || !contentType.includes("mp4")) {
      return respErr("only .mp4 files are allowed");
    }

    // Optional: size gate (e.g., 300MB)
    const maxSize = 300 * 1024 * 1024; // 300MB
    if (typeof file.size === "number" && file.size > maxSize) {
      return respErr("file too large (max 200MB)");
    }

    // Create a simple, collision-resistant key
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${prefix}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;

    // const storage = newStorage();

    // Read content into memory (simple approach). For very large files, prefer presigned URL direct upload.
    const body = new Uint8Array(await file.arrayBuffer());

    const storageService = await getStorageService();
    const res = await storageService.uploadFile({
      body,
      key,
      contentType,
      disposition: "inline",
    });
    console.log("upload-file success--->", res);


    const user_uuid = user.id;
    const title = (form.get("title") as string) || '';
    const description = (form.get("description") as string) || '';
    const content = (form.get("content") as string) || '';
    const duration = (form.get("duration") as string) || '';

    // 添加视频转换记录
    const videoConvert = await insertVideoConvert({
      uuid: getUuid(),
      user_uuid: user_uuid,
      title: title,
      description: description,
      content: content,
      duration: duration,
      source_vdo_url: res.url,
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
