import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { updateSingleSubtitleItemById } from '@/shared/models/vt_task_subtitle';
import { javaR2CoverWriteFile } from '@/shared/services/javaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isSafeSubtitleId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    !id.includes('..') &&
    !id.includes('/') &&
    !id.includes('\\')
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, type, id, pathName, item } = body;

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    if (!taskId || !type || !id || !item || !pathName) {
      return respErr('missing required parameters');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) {
      return respErr('task not found');
    }
    if (task.userId !== user.id) {
      return respErr('no permission');
    }

    if (typeof pathName !== 'string' || pathName.includes('..') || pathName.startsWith('/')) {
      return respErr('invalid pathName');
    }

    if (type !== 'translate_srt') {
      return respErr('unsupported type');
    }
    if (!isSafeSubtitleId(id) || !isSafeSubtitleId((item as any)?.id)) {
      return respErr('invalid subtitle id');
    }

    const sourcePath = `${task.userId}/${taskId}/${pathName}`;
    const targetPath = `${task.userId}/${taskId}/adj_audio_time/${id}.wav`;

    const bucketName = (await getSystemConfigByKey('r2.bucket.public')) || 'zhesheng-public';
    const backJO = await javaR2CoverWriteFile(sourcePath, targetPath, bucketName);
    if (backJO.code !== 200) {
      return respErr('r2 file move save failed');
    }

    const nowMs = Date.now();
    const nextItem = {
      ...item,
      id,
      audio_url: `adj_audio_time/${id}.wav`,
      audio_rev_ms: nowMs,
      vap_voice_status: 'ready',
      vap_needs_tts: false,
    };

    await updateSingleSubtitleItemById(taskId, type, id, nextItem);

    return respData({ taskId, type, id, message: '保存成功' });
  } catch (e) {
    console.log('update subtitle item failed:', e);
    return respErr('update subtitle item failed');
  }
}
