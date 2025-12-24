import { getBucketName, r2MoveFile } from '@/extensions/storage/privateR2Util';
import { getSystemConfigByKey, USE_JAVA_REQUEST } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { updateSingleSubtitleItem } from '@/shared/models/vt_task_subtitle';
import { javaR2CoverWriteFile, javaR2MoveFile } from '@/shared/services/javaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, taskId, type, seq, pathName, item } = body;

    if (!userId || !taskId || !type || !seq || !item || !pathName) {
      return respErr('missing required parameters');
    }
    // 保存单条json数据
    await updateSingleSubtitleItem(taskId, type, seq, item);
    
    // 移动r2中文件到新路径
    let sourcePath = '';
    let targetPath = '';
    // 翻译字幕
    if (type === 'translate_srt') {
      sourcePath = `${userId}/${taskId}/${pathName}`;
      targetPath = `${userId}/${taskId}/adj_audio_time/${item.id}.wav`;
    }

    let backJO = {code: 200};
    // java接口
    if (USE_JAVA_REQUEST) {
      // 私桶名字
      // const bucketName = await getBucketName();
      // 公桶名字
      const bucketName = await getSystemConfigByKey('r2.bucket.public') || 'zhesheng-public';
      // backJO = await javaR2MoveFile(sourcePath, targetPath, bucketName);
      backJO = await javaR2CoverWriteFile(sourcePath, targetPath, bucketName);
    }
    // next接口
    else {
      // backJO = await r2MoveFile(sourcePath, targetPath);
    }
    // 失败
    if (backJO.code !== 200) {
      return respErr('r2 file move save failed');
    }

    return respData({ taskId, type, seq, message: '保存成功' });
  } catch (e) {
    console.log('update subtitle item failed:', e);
    return respErr('update subtitle item failed');
  }
}
