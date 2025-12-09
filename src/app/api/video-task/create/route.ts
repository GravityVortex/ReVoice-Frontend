import {getUuid} from '@/shared/lib/hash';
import {respData, respErr} from '@/shared/lib/resp';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import {insertVtFileOriginal} from '@/shared/models/vt_file_original';
import {insertVtTaskMain} from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const userId = formData.get('userId') as string;
    // 'guest' : 'registered'
    const userType = formData.get('userType') as string;
    const fileName = formData.get('fileName') as string;
    const fileSizeBytes = parseInt(formData.get('fileSizeBytes') as string);
    const fileType = formData.get('fileType') as string;
    const r2Key = formData.get('r2Key') as string;
    const r2Bucket = formData.get('r2Bucket') as string;
    const videoDurationSeconds = Math.round(parseFloat(formData.get('videoDurationSeconds') as string));
    const credits = parseInt(formData.get('credits') as string);
    const checksumSha256 = (formData.get('checksumSha256') as string) || '';
    const uploadStatus = 'pending';
    const sourceLanguage = formData.get('sourceLanguage') as string;
    const targetLanguage = formData.get('targetLanguage') as string;
    const speakerCount = formData.get('speakerCount') as string;

    if (!userId || !fileName || !fileSizeBytes || !fileType || !r2Key || !credits
        || !r2Bucket || !sourceLanguage || !targetLanguage || !speakerCount) {
      return respErr('Missing required fields');
    }

    // 1. 消耗积分
    // TODO 积分不足也扣，只处理部分视频时长
    const remainingCredits = await getRemainingCredits(userId);
    let finalCredits = credits;
    let finalHandlerTime = videoDurationSeconds;
    // 积分不足，按2积分/分钟计算可处理时长
    if (remainingCredits < credits) {
      finalCredits = remainingCredits;
      finalHandlerTime = finalCredits / 2 * 60; // 按2积分/分钟计算可处理时长
    }
    
    let creditRecord;
    try {
      creditRecord = await consumeCredits({
        userId,
        credits: finalCredits,
        scene: 'convert_video',
        description: '视频转换任务消耗积分',
        metadata: JSON.stringify({credits: credits, finalCredits: finalCredits}),
      });
    } catch (e: any) {
      return respErr(e.message || '积分不足');
    }

    // 2. 插入vt_file_original表
    const fileOriginal = await insertVtFileOriginal({
      id: getUuid(),
      userId,
      fileName,
      fileSizeBytes,
      fileType,
      r2Key,
      r2Bucket,
      videoDurationSeconds,
      checksumSha256,
      uploadStatus,
      createdBy: userId,
      updatedBy: userId,
    });

    // TODO 未区分包月和包年用户，设置任务优先级（注册用户registered）或 4（匿名用户guest）. 
    let priorityV = userType === 'registered' ? 3 : 4;
    // 3. 插入vt_task_main表
    const taskMain = await insertVtTaskMain({
      id: getUuid(),
      userId,
      originalFileId: fileOriginal.id,
      status: 'pending',
      priority: priorityV,
      sourceLanguage,
      targetLanguage,
      speakerCount,
      processDurationSeconds: finalHandlerTime,// 根据积分消耗调整
      creditId: creditRecord.id,
      creditsConsumed: finalCredits,
      createdBy: userId,
      updatedBy: userId,
    });

    return respData(taskMain);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
