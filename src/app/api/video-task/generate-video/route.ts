import { NextRequest, NextResponse } from 'next/server';

import { respData, respErr, respJson } from '@/shared/lib/resp';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById, updateVtTaskMain } from '@/shared/models/vt_task_main';
import { getVtTaskSubtitleListByTaskIdAndStepName } from '@/shared/models/vt_task_subtitle';
import { pyMergeVideo } from '@/shared/services/pythonService';
import { getSystemConfigByKey } from '@/shared/cache/system-config';

/**
 * 合成最终final视频
 */
export async function GET() {
  return NextResponse.json(
    { code: 405, message: 'Method Not Allowed' },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const taskId = body?.taskId as string | undefined;
    const payCredit = Number.parseInt(body?.payCredit ?? '0', 10) || 0;

    if (!taskId) {
      return respErr('缺少参数taskId');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // DOEND 查询taskMain表中metaData判断今天已经使用保存几次了
    const taskItem = await findVtTaskMainById(taskId);
    if (!taskItem) {
      return respErr('找不到该任务！');
    }
    if (taskItem.userId !== user.id) {
      return respErr('no permission');
    }

    let creditRecordId = taskItem.creditId;
    console.log('taskItem---->', taskItem);

    // {date:'', saveNum: 2}
    const mdJO = JSON.parse(taskItem.metadata || '{"saveNum":0}');
    const today = new Date().toISOString().slice(0, 10);
    console.log('today---->', today);
    // 默认大保存
    if (payCredit === 0) {
      // 每日限制视频合并最大次数
      const dayMaxNum = await getSystemConfigByKey('limit.day.video_merge_num') || '3';
      const dayMaxNumInt = parseInt(dayMaxNum);
      if (mdJO.date === today) {
        if (mdJO.saveNum >= dayMaxNumInt) {
          // return respErr('今天保存次数超限制！');
          return respJson(-2, '今天保存次数超限制！', mdJO);
        }
      } else {
        mdJO.date = today;
        mdJO.saveNum = 0;
      }
    }
    // 点击弹框中支付了
    else {
      const userId = user.id;
      // 计算用户当前可用的剩余积分总额
      const remainingCredits = await getRemainingCredits(userId);
      // 积分不足2
      if (remainingCredits < payCredit) {
        return respJson(-3, '积分不足，请充值积分。', remainingCredits);
      }
      
      try {
        let creditRecord = await consumeCredits({
          userId,
          credits: payCredit,
          scene: 'merge_audio_video',
          description: '修改字幕音频，重新合并视频',
          metadata: JSON.stringify({ credits: payCredit, finalCredits: payCredit }),
        });
        creditRecordId = creditRecord.id;
      } catch (e: any) {
        return respJson(-3, '积分不足，请充值积分。', remainingCredits);
      }
    }
    const stepNameArr2 = ['translate_srt'];
    const allSubtitleList = await getVtTaskSubtitleListByTaskIdAndStepName(taskId, stepNameArr2);
    const translatedSubtitleItem = allSubtitleList.find((item) => item.stepName === 'translate_srt');
    const subtitleArray: any = translatedSubtitleItem?.subtitleData || [];
    if (!subtitleArray || subtitleArray.length === 0) {
      return respErr('没有合成的字幕数据');
    }
    // ["0001_00-00-00-000_00-00-04-000","0002_00-00-04-020_00-00-05-010"]
    const nameArray = subtitleArray.map((item: any) => item.id);
    console.log('nameArray--->', nameArray);
    // 调用python生成视频
    const backJO = await pyMergeVideo(taskId, nameArray);
    // const backJO = { code: 200 };
    if (backJO.code === 200) {
      // 更新当天保存次数
      mdJO.date = today;
      mdJO.saveNum += 1;
      // 更新taskMain表中metaData
      await updateVtTaskMain(taskId, {
        // ...taskItem,
        creditId: creditRecordId,// 新转换任务积分
        metadata: JSON.stringify(mdJO),
        updatedAt: new Date(),
      });

      return respData({
        metaData: mdJO,
        message: '视频合成任务已生成，较耗时请耐心等候。',
      });
    } else {
      return respErr('视频合成任务失败！');
    }
  } catch (error) {
    console.error('合成视频失败:', error);
    return respErr('合成失败');
  }
}
