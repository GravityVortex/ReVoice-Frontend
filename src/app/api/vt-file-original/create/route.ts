import {getUuid} from '@/shared/lib/hash';
import {respData, respErr} from '@/shared/lib/resp';
import {getUserInfo} from '@/shared/models/user';
import {insertVtFileOriginal} from '@/shared/models/vt_file_original';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const {
      fileName,
      fileSizeBytes,
      fileType,
      r2Key,
      r2Bucket,
      videoDurationSeconds,
      checksumSha256,
      uploadStatus = 'pending',
    } = body;

    if (!fileName || !fileSizeBytes || !fileType || !r2Key || !r2Bucket) {
      return respErr('Missing required fields');
    }
    const userId = user.id;

    const result = await insertVtFileOriginal({
      id: getUuid(),
      userId: userId,
      fileName,
      fileSizeBytes,
      fileType,
      r2Key,
      r2Bucket,
      videoDurationSeconds,
      checksumSha256,
      // coverR2Key,// 封面图片
      // coverSizeBytes,
      // coverUpdatedAt,
      uploadStatus,
      createdBy: userId,
      updatedBy: userId,
    });

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
