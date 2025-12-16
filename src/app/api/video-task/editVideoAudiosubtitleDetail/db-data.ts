import { doPost } from '@/app/api/request-proxy/route';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { R2Provider } from '@/extensions/storage';
import { generatePrivateR2SignUrl } from '@/extensions/storage/privateR2Util';
import { getSystemConfigByKey, JAVA_SERVER_BASE_URL, USE_JAVA_REQUEST } from '@/shared/cache/system-config';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { getVtFileTaskListByTaskId, VtFileTask } from '@/shared/models/vt_file_task';
import { findVtSystemConfigByKey } from '@/shared/models/vt_system_config';
import { findVtTaskMainById, VtTaskMain } from '@/shared/models/vt_task_main';
import { getVtTaskSubtitleListByTaskIdAndStepName, VtTaskSubtitle } from '@/shared/models/vt_task_subtitle';
import { getPreSignedUrl, SignUrlItem } from '@/shared/services/javaService';
import { getStorageService } from '@/shared/services/storage';

/**
 * 查出真实数据供前端视频剪辑音频字幕。
 * @param taskMainId
 * @description 文件需求：
 * @description 1、需要无声视频url(私桶)
 * @description 2、背景音频(私桶)
 * @description 3、几百段字幕音频(公桶)
 * @description 4、原字幕列表(db)
 * @description 5、翻译后字幕列表(db)
 */
export const getDBJsonData = async (taskMainId: string) => {
  const startTime = Date.now();
  console.log('[getDBJsonData] 开始查询, taskMainId:', taskMainId);

  try {
    // 1、根据taskMainId查出vt_task_main表数据taskMainItem
    const step1Start = Date.now();
    const taskMainItem = await findVtTaskMainById(taskMainId);
    console.log('[getDBJsonData] 步骤1 - 查询vt_task_main耗时:', Date.now() - step1Start, 'ms');
    if (!taskMainItem) {
      return { error: 'taskMainId不存在' };
    }

    // 2、根据taskMainItem.original_file_id查vt_file_original表videoItem
    const step2Start = Date.now();
    const videoItem = await findVtFileOriginalById(taskMainItem.originalFileId);
    console.log('[getDBJsonData] 步骤2 - 查询vt_file_original耗时:', Date.now() - step2Start, 'ms');

    if (!videoItem) {
      return { error: '原始文件不存在' };
    }

    // 3、根据taskMainId查vt_file_task表，查出tempFileTaskList(几百条翻译字幕音频
    // + 几百条原字幕音频 + 人声分离音频2个 + 背景音分离2个)
    // const step3Start = Date.now();
    // // 列表长度应该只有4条
    // const stepNameArr = ['split_audio_video', 'split_vocal_bkground'];
    // const tempFileTaskList = await getVtFileTaskListByTaskId(taskMainId, stepNameArr);
    // console.log('[getDBJsonData] 步骤3 - 查询vt_file_task耗时:', Date.now() - step3Start, 'ms, 数量:', tempFileTaskList.length);

    // 4、过滤步骤为"split_audio_video"且r2_key中含有video_nosound.mp4数据，当做无声视频url(私桶)
    // const step4Start = Date.now();
    // const noSoundVideoFile = tempFileTaskList.find(
    //   (file) => file.stepName === 'split_audio_video' && file.r2Key.includes('video_nosound.mp4')
    // );
    // console.log('[getDBJsonData] 步骤4 - 过滤无声视频耗时:', Date.now() - step4Start, 'ms');

    // 5、调用java访问签名URL，生成供前端可访问的URL，有效期长一点，可长时间编辑预览
    // const step5Start = Date.now();

    // 6、过滤步骤为"split_vocal_bkground"且r2_key中含有audio_bkground.wav数据，当做背景音频(私桶)
    // const step6Start = Date.now();
    // const backgroundAudioFile = tempFileTaskList.find(
    //   (file) => file.stepName === 'split_vocal_bkground' && file.r2Key.includes('audio_bkground.wav')
    // );
    // console.log('[getDBJsonData] 步骤6 - 过滤背景音频耗时:', Date.now() - step6Start, 'ms');

    // 7、调用java访问签名URL，生成供前端可访问的URL，有效期长一点，可长时间编辑预览
    const step7Start = Date.now();
    // let noSoundVideoUrl = noSoundVideoFile?.r2Key || '';
    // let backgroundAudioUrl = backgroundAudioFile?.r2Key || '';
    // {env}/{userId}/{taskId}/split_vocal_bkground/audio/audio_bkground.wav
    // {env}/{userId}/{taskId}/split_audio_video/video/video_nosound.mp4
    // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
    // let env = process.env.ENV || 'dev';
    let backgroundAudioUrl = `${taskMainItem.userId}/${taskMainId}/split_vocal_bkground/audio/audio_bkground.wav`;
    let noSoundVideoUrl = `${taskMainItem.userId}/${taskMainId}/split_audio_video/video/video_nosound.mp4`;
    // if (!backgroundAudioFile) {
    //   return { error: '背景音频不存在' };
    // }

    if (USE_JAVA_REQUEST) {
      const params: SignUrlItem[] = [
        { path: noSoundVideoUrl, operation: 'download', expirationMinutes:  24 * 60 }, // 无声视频
        { path: noSoundVideoUrl, operation: 'download', expirationMinutes:  24 * 60 }, // 背景音频
      ];
      const resUrlArr = await getPreSignedUrl(params);
      noSoundVideoUrl = resUrlArr[0].url;
      backgroundAudioUrl = resUrlArr[1].url;
    } else {
      // 调用自己的接口
      const r2KeyArr = [noSoundVideoUrl, backgroundAudioUrl];
      const resUrlArr = await generatePrivateR2SignUrl(r2KeyArr, 86400); // 24小时有效期
      noSoundVideoUrl = resUrlArr[0];
      backgroundAudioUrl = resUrlArr[1];
    }
    console.log('[getDBJsonData] 步骤7 - 生成背景音频URL耗时:', Date.now() - step7Start, 'ms, 使用Java:', USE_JAVA_REQUEST);

    // 8、过滤步骤为"split_audio"，当做原字幕音频(公桶)(几百条)
    // const step8Start = Date.now();
    // const splitAudioFiles = tempFileTaskList.filter(
    //     (file) => file.stepName === 'split_audio'
    // );
    // console.log('[getDBJsonData] 步骤8 - 过滤原字幕音频耗时:', Date.now() -
    // step8Start, 'ms, 数量:', splitAudioFiles.length);

    // 9、过滤步骤为"adj_audio_time"，当做翻译字幕音频(公桶)(几百条)
    // const step9Start = Date.now();
    // const adjAudioTimeFiles = tempFileTaskList.filter(
    //     (file) => file.stepName === 'adj_audio_time'
    // );
    // console.log('[getDBJsonData] 步骤9 - 过滤翻译字幕音频耗时:', Date.now() -
    // step9Start, 'ms, 数量:', adjAudioTimeFiles.length);

    // 10、查询vt_system_config表中公桶访问前缀，供8、9步骤使用
    const step10Start = Date.now();
    // const publicBucketConfig = await
    // findVtSystemConfigByKey('r2.public.base_url'); const publicBaseUrl =
    // publicBucketConfig?.configValue || '';
    const publicBaseUrl = await getSystemConfigByKey('r2.public.base_url'); // 含缓存
    console.log('[getDBJsonData] 步骤10 - 查询公桶配置耗时:', Date.now() - step10Start, 'ms');

    // 为公桶文件生成完整URL
    // const originalAudioList = splitAudioFiles.map((file) => ({
    //     id: file.id,
    //     fileKey: file.fileKey,
    //     url: `${publicBaseUrl}/${file.r2Key}`,
    //     r2Key: file.r2Key,
    //     createdAt: file.createdAt,
    // }));

    // const translatedAudioList = adjAudioTimeFiles.map((file) => ({
    //     id: file.id,
    //     fileKey: file.fileKey,
    //     url: `${publicBaseUrl}/${file.r2Key}`,
    //     r2Key: file.r2Key,
    //     createdAt: file.createdAt,
    // }));

    // 11、查询vt_task_subtitle列表step_name为gen_subtitle或translate_srt的列表allSubtitleList
    const step11Start = Date.now();
    const stepNameArr2 = ['gen_srt', 'translate_srt'];
    const allSubtitleList = await getVtTaskSubtitleListByTaskIdAndStepName(taskMainId, stepNameArr2);
    // const translateSrtList = await
    // getVtTaskSubtitleListByTaskIdAndStepName(taskMainId, []);
    console.log('[getDBJsonData] 步骤11 - 查询字幕列表耗时:', Date.now() - step11Start, 'ms, 原字幕和翻译长度:', allSubtitleList.length);

    // 12、过滤getSubtitleList为原字幕列表
    const step12Start = Date.now();
    // const originalSubtitleList = allSubtitleList[0]?.subtitleData || [];
    const originalSubtitleItem = allSubtitleList.find((item) => item.stepName === 'gen_srt');
    console.log('[getDBJsonData] 步骤12 - 格式化原字幕耗时:', Date.now() - step12Start, 'ms');

    // 13、过滤translateList为翻译字幕列表
    const step13Start = Date.now();
    const translatedSubtitleItem = allSubtitleList.find((item) => item.stepName === 'translate_srt');
    console.log('[getDBJsonData] 步骤13 - 格式化翻译字幕耗时:', Date.now() - step13Start, 'ms');

    // 返回完整数据
    const totalTime = Date.now() - startTime;
    console.log('[getDBJsonData] 总耗时:', totalTime, 'ms');

    return {
      code: '0',
      publicBaseUrl,
      videoItem,
      taskMainItem: {
        id: taskMainItem.id,
        userId: taskMainItem.userId,
        originalFileId: taskMainItem.originalFileId,
        status: taskMainItem.status,
        priority: taskMainItem.priority,
        progress: taskMainItem.progress,
        currentStep: taskMainItem.currentStep,
        sourceLanguage: taskMainItem.sourceLanguage,
        targetLanguage: taskMainItem.targetLanguage,
        speakerCount: taskMainItem.speakerCount,
        processDurationSeconds: taskMainItem.processDurationSeconds,
        startedAt: taskMainItem.startedAt,
        completedAt: taskMainItem.completedAt,
        noSoundVideoUrl,
        backgroundAudioUrl,
        srt_source_arr: originalSubtitleItem?.subtitleData || [],
        srt_convert_arr: translatedSubtitleItem?.subtitleData || [],

        // originalAudioList, // 根据字幕拼接R2访问路径
        // translatedAudioList,// 根据字幕拼接R2访问路径
      },
      performance: {
        totalTime,
        useJavaSignUrl: USE_JAVA_REQUEST,
      },
    };
  } catch (error) {
    console.error('[getDBJsonData] 查询失败:', error);
    return {
      error: error instanceof Error ? error.message : '查询失败',
    };
  }
};

/**
 * 调用Java服务器
 * @param url
 * @param params
 * @returns
 */
// async function getJavaServer(url: string, params: any[]) {
//   // const params = params;// '{"name":"李四"}';// json格式string
//   const headers = {
//     Authorization: '',
//   };

//   const backJO = await doPost(url, JSON.stringify(params), headers);
//   const jsonData = await backJO.json();
//   console.log('服务器之间POST请求响应--->', JSON.stringify(jsonData));
//   if (!jsonData || !jsonData.success) {
//     // throw new Error('获取签名URL失败');
//     return [...Array(params?.length)].map(() => '');
//   }
//   return jsonData.data;
// }
