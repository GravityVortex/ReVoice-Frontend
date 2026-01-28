import { v4 as uuidv4 } from 'uuid';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { getStorageService } from '@/shared/services/storage';
import { getUuid } from '@/shared/lib/hash';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const fileId = formData.get('fileId') as string;

    console.log('[API] Received files:', files.length);
    files.forEach((file, i) => {
      console.log(`[API] File ${i}:`, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
    });

    if (!files || files.length === 0) {
      return respErr('No files provided');
    }

    const uploadResults = [];

    const user = await getUserInfo();
    if (!user) {
      return respErr('Unauthorized');
    }
    // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
    let env = process.env.ENV || 'dev';

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return respErr(`File ${file.name} is not an image`);
      }

      // Generate unique key
      const ext = file.name.split('.').pop();
      // const key = `uploads/${Date.now()}-${uuidv4()}.${ext}`;
      // const key = `images/${Date.now()}-${uuidv4()}.${ext}`;

      // DOEND: 封面图片融入视频Id困难，上传组件业务不相关
      const key = `frame_img/image/${file.name}`;
      // const imgId = getUuid();
      // const pathName = `${env}/${user?.id}/frame_img/image/${imgId}.jpg`;
      const pathName = `${env}/${user.id}/${fileId}/` + key;


      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const storageService = await getStorageService();

      // Upload to storage
      const result = await storageService.uploadFile({
        body: buffer,
        key: pathName,
        contentType: file.type,
        disposition: 'inline',
      });

      if (!result.success) {
        console.error('[API] Upload failed:', result.error);
        return respErr(result.error || 'Upload failed');
      }

      console.log('[API] Upload success:', result.url);

      uploadResults.push({
        status: 'uploaded',
        url: result.url,
        key: key,
        filename: file.name,
      });
    }

    console.log(
      '[API] All uploads complete. Returning URLs:',
      uploadResults.map((r) => r.url)
    );

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch (e) {
    console.error('upload image failed:', e);
    return respErr('upload image failed');
  }
}
