import { respData, respErr } from "@/shared/lib/resp";
import { findVideoConvertById, updateVideoConvert } from "@/shared/models/video_convert";
import { getUserInfo } from "@/shared/models/user";
import { hasPermission } from "@/shared/services/rbac";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title, description, content, cover_url, duration } = body;

    if (!id) {
      return respErr("missing id parameter");
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr("unauthorized");
    }

    const videoId = parseInt(id);
    if (isNaN(videoId)) {
      return respErr("invalid id parameter");
    }

    const existing = await findVideoConvertById(videoId);
    if (!existing) {
      return respErr("video not found");
    }
    if (existing.user_uuid !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    if (cover_url !== undefined) updateData.cover_url = cover_url;
    if (duration !== undefined) updateData.duration = duration;
    
    // 添加更新时间
    updateData.updated_at = new Date();

    // 更新视频信息
    const updatedVideo = await updateVideoConvert(videoId, updateData);

    if (!updatedVideo) {
      return respErr("update video failed");
    }

    return respData(updatedVideo);
  } catch (e) {
    console.log("update video failed:", e);
    return respErr("update video failed");
  }
}
