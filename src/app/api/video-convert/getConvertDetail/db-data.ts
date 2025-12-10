import { findVtFileOriginalById } from "@/shared/models/vt_file_original";
import { findVtTaskMainById, VtTaskMain } from "@/shared/models/vt_task_main";
import { getVtFileTaskListByTaskId, VtFileTask } from "@/shared/models/vt_file_task";
import { getVtTaskSubtitleListByTaskIdAndStepName, VtTaskSubtitle } from "@/shared/models/vt_task_subtitle";
import { findVtSystemConfigByKey } from "@/shared/models/vt_system_config";
import { getStorageService } from "@/shared/services/storage";
import { R2Provider } from "@/extensions/storage";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSystemConfigByKey, JAVA_SERVER_BASE_URL, USE_JAVA_REQUEST } from "@/shared/cache/system-config";
import { doPost } from "@/app/api/request-proxy/route";


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

        // 3、根据taskMainId查vt_file_task表，查出tempFileTaskList(几百条翻译字幕音频 + 几百条原字幕音频 + 人声分离音频2个 + 背景音分离2个)
        const step3Start = Date.now();
        // 列表长度应该只有4条
        const stepNameArr = ['split_audio_video', 'split_vocal_bkground'];
        const tempFileTaskList = await getVtFileTaskListByTaskId(taskMainId, stepNameArr);
        console.log('[getDBJsonData] 步骤3 - 查询vt_file_task耗时:', Date.now() - step3Start, 'ms, 数量:', tempFileTaskList.length);

        // 4、过滤步骤为"split_audio_video"且r2_key中含有video_nosound.mp4数据，当做无声视频url(私桶)
        const step4Start = Date.now();
        const noSoundVideoFile = tempFileTaskList.find(
            (file) => file.stepName === 'split_audio_video' && file.r2Key.includes('video_nosound.mp4')
        );
        console.log('[getDBJsonData] 步骤4 - 过滤无声视频耗时:', Date.now() - step4Start, 'ms');

        // 5、调用java访问签名URL，生成供前端可访问的URL，有效期长一点，可长时间编辑预览
        // const step5Start = Date.now();
        let noSoundVideoUrl = '';
        // if (noSoundVideoFile) {
        //     if (USE_JAVA_REQUEST) {
        //         // 调用Java服务器
        //         const url = `${JAVA_SERVER_BASE_URL}/api/r2/presigned-url`;
        //         const params = JSON.stringify({ key: noSoundVideoFile.r2Key, expiresIn: 86400 });
        //         noSoundVideoUrl = await getJavaServer(url, params);
        //     } else {
        //         // 调用自己的接口24小时有效期
        //         noSoundVideoUrl = await generatePrivateR2SignUrl(noSoundVideoFile.r2Key, 86400);
        //     }
        // }
        // console.log('[getDBJsonData] 步骤5 - 生成无声视频URL耗时:', Date.now() - step5Start, 'ms, 使用Java:', USE_JAVA_REQUEST);

        // 6、过滤步骤为"split_vocal_bkground"且r2_key中含有audio_bkground.wav数据，当做背景音频(私桶)
        const step6Start = Date.now();
        const backgroundAudioFile = tempFileTaskList.find(
            (file) => file.stepName === 'split_vocal_bkground' && file.r2Key.includes('audio_bkground.wav')
        );
        console.log('[getDBJsonData] 步骤6 - 过滤背景音频耗时:', Date.now() - step6Start, 'ms');

        // 7、调用java访问签名URL，生成供前端可访问的URL，有效期长一点，可长时间编辑预览
        const step7Start = Date.now();
        let backgroundAudioUrl = '';
        if (backgroundAudioFile) {
            if (USE_JAVA_REQUEST) {
                // 调用Java服务器
                const url = `${JAVA_SERVER_BASE_URL}/api/r2/presigned-url`;
                const params = JSON.stringify({ key: backgroundAudioFile.r2Key, expiresIn: 86400 });
                backgroundAudioUrl = await getJavaServer(url, params);
            } else {
                // 调用自己的接口
                const r2KeyArr = [noSoundVideoFile?.r2Key, backgroundAudioFile?.r2Key];
                const resUrlArr = await generatePrivateR2SignUrl(r2KeyArr, 86400); // 24小时有效期
                noSoundVideoUrl = resUrlArr[0];
                backgroundAudioUrl = resUrlArr[1];
            }
        }
        console.log('[getDBJsonData] 步骤7 - 生成背景音频URL耗时:', Date.now() - step7Start, 'ms, 使用Java:', USE_JAVA_REQUEST);

        // 8、过滤步骤为"split_audio"，当做原字幕音频(公桶)(几百条)
        // const step8Start = Date.now();
        // const splitAudioFiles = tempFileTaskList.filter(
        //     (file) => file.stepName === 'split_audio'
        // );
        // console.log('[getDBJsonData] 步骤8 - 过滤原字幕音频耗时:', Date.now() - step8Start, 'ms, 数量:', splitAudioFiles.length);

        // 9、过滤步骤为"adj_audio_time"，当做翻译字幕音频(公桶)(几百条)
        // const step9Start = Date.now();
        // const adjAudioTimeFiles = tempFileTaskList.filter(
        //     (file) => file.stepName === 'adj_audio_time'
        // );
        // console.log('[getDBJsonData] 步骤9 - 过滤翻译字幕音频耗时:', Date.now() - step9Start, 'ms, 数量:', adjAudioTimeFiles.length);

        // 10、查询vt_system_config表中公桶访问前缀，供8、9步骤使用
        const step10Start = Date.now();
        // const publicBucketConfig = await findVtSystemConfigByKey('r2.public.base_url');
        // const publicBaseUrl = publicBucketConfig?.configValue || '';
        const publicBaseUrl = await getSystemConfigByKey('r2.public.base_url');// 含缓存
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
        const stepNameArr2 = ['gen_subtitle', 'translate_srt'];
        const allSubtitleList = await getVtTaskSubtitleListByTaskIdAndStepName(taskMainId, stepNameArr2);
        // const translateSrtList = await getVtTaskSubtitleListByTaskIdAndStepName(taskMainId, []);
        console.log('[getDBJsonData] 步骤11 - 查询字幕列表耗时:', Date.now() - step11Start, 'ms, 原字幕和翻译长度:', allSubtitleList.length);

        // 12、过滤getSubtitleList为原字幕列表
        const step12Start = Date.now();
        // const originalSubtitleList = allSubtitleList[0]?.subtitleData || [];
        const originalSubtitleItem = allSubtitleList.find((item) => item.stepName === 'gen_subtitle');
        console.log('[getDBJsonData] 步骤12 - 格式化原字幕耗时:', Date.now() - step12Start, 'ms');

        // 13、过滤translateList为翻译字幕列表
        const step13Start = Date.now();
        const translatedSubtitleItem = allSubtitleList.find((item) => item.stepName === 'translate_srt');
        console.log('[getDBJsonData] 步骤13 - 格式化翻译字幕耗时:', Date.now() - step13Start, 'ms');

        // 返回完整数据
        const totalTime = Date.now() - startTime;
        console.log('[getDBJsonData] 总耗时:', totalTime, 'ms');

        return {
            success: true,
            data: {
                publicBaseUrl,
                videoItem,
                taskMainItem,

                noSoundVideoUrl,
                backgroundAudioUrl,
                // originalAudioList, // 根据字幕拼接R2访问路径
                // translatedAudioList,// 根据字幕拼接R2访问路径

                originalSubtitle: originalSubtitleItem?.subtitleData || '{}',
                translatedSubtitle: translatedSubtitleItem?.subtitleData || '{}',

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
 * 生成私桶文件的预签名URL
 * @param r2KeyArr R2文件key数组
 * @param expiresIn 过期时间（秒）
 * @returns 预签名URL数组
 */
async function generatePrivateR2SignUrl(r2KeyArr: any[] = [], expiresIn: number = 3600): Promise<string[]> {
    try {
        // 多个存储桶公用一个
        const endpoint = 'https://a611f60c1436512acfe03a1efe79a50a.r2.cloudflarestorage.com';
        const client = new S3Client({
            region: 'auto',
            endpoint,
            credentials: {
                accessKeyId: '8c8b2be18e4795250df389d2e7cbaa2b',// 每个存储桶单独id
                secretAccessKey: '114e0ccba3a492c6e8f76c0b057f554b8b5808d34f22bf35bfa86af0765b6d15',// 每个存储桶单独secret
            },
            forcePathStyle: false,
        });

        const urlList: string[] = [];
        for (const r2Key of r2KeyArr) {
            if (!r2Key) {
                continue;
            }
            const command = new GetObjectCommand({
                Bucket: 'zhesheng',// 存储桶名称
                Key: r2Key,
            });
            // 获取访问预览url
            const url = await getSignedUrl(client, command, { expiresIn: 3600 });
            // console.log('Generated presigned URL--->', url);
            urlList.push(url);
        }
        return urlList;
    } catch (error) {
        console.error('[generatePrivateR2SignUrl] 生成签名URL失败:', error);
        return [];
    }
}

async function getJavaServer(url: string, params: string) {
    const url2 = url;
    const params2 = params;// '{"name":"李四"}';// json格式string
    const headers = {
        'Authorization': '',
    };
    const backJO = await doPost(url2, params2, headers);
    const jsonData = await backJO.json();
    console.log('服务器之间POST请求响应--->', JSON.stringify(jsonData));
    return jsonData;
}