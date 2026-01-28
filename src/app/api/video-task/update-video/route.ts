import { respData, respErr } from "@/shared/lib/resp";
import { findVtFileOriginalById, updateVtFileOriginalCoverTitle } from "@/shared/models/vt_file_original";
import { getUserInfo } from "@/shared/models/user";
import { hasPermission } from "@/shared/services/rbac";
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

    const user = await getUserInfo();
    if (!user) {
      return respErr("no auth, please sign in");
    }

    const file = await findVtFileOriginalById(id);
    if (!file) {
      return respErr("video not found");
    }
    if (file.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr("no permission");
      }
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
