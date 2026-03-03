import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { updateSingleSubtitleItem } from '@/shared/models/vt_task_subtitle';
import { javaR2CoverWriteFile } from '@/shared/services/javaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function stripVapFields(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === 'string' && k.startsWith('vap_')) continue;
    out[k] = v;
  }
  return out;
}

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
    const { taskId, type, seq, pathName, item } = body;

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    if (!taskId || !type || typeof seq === 'undefined' || !item || !pathName) {
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

    // 保存单条json数据
    // - 不把编辑期草稿字段(vap_*)固化到正式字幕item里（避免污染/兼容风险）
    const cleanItem = stripVapFields(item);
    
    // 移动r2中文件到新路径
    let sourcePath = '';
    let targetPath = '';
    // 翻译字幕
    if (type === 'translate_srt') {
      if (!isSafeSubtitleId((cleanItem as any)?.id)) {
        return respErr('invalid subtitle id');
      }
      sourcePath = `${task.userId}/${taskId}/${pathName}`;
      targetPath = `${task.userId}/${taskId}/adj_audio_time/${cleanItem.id}.wav`;
    } else {
      return respErr('unsupported type');
    }

    const bucketName = (await getSystemConfigByKey('r2.bucket.public')) || 'zhesheng-public';
    const backJO = await javaR2CoverWriteFile(sourcePath, targetPath, bucketName);
    // 失败
    if (backJO.code !== 200) {
      return respErr('r2 file move save failed');
    }

    // 合并任务输入版本号：
    // - audio_rev_ms 只在“应用配音/落盘成功”后写入，用于刷新后判断是否需要重新合成视频。
    const nowMs = Date.now();
    const nextItem = { ...cleanItem, audio_rev_ms: nowMs };
    await updateSingleSubtitleItem(taskId, type, seq, nextItem);

    return respData({ taskId, type, seq, message: '保存成功' });
  } catch (e) {
    console.log('update subtitle item failed:', e);
    return respErr('update subtitle item failed');
  }
}
