import { v4 as uuidv4 } from 'uuid';

import { respData, respErr } from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    console.log('[API] Received video file:', {
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });

    if (!file) {
      return respErr('No file provided');
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      return respErr(`File ${file.name} is not a video`);
    }

    // Validate file size (500MB limit)
    const maxSize = 500 * 1024 * 1024; // 500MB in bytes
    if (file.size > maxSize) {
      return respErr('File size exceeds 500MB limit');
    }

    // Generate unique key
    const ext = file.name.split('.').pop();
    const key = `videos/${Date.now()}-${uuidv4()}.${ext}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storageService = await getStorageService();

    // Upload to storage
    const result = await storageService.uploadFile({
      body: buffer,
      key: key,
      contentType: file.type,
      disposition: 'inline',
    });

    if (!result.success) {
      console.error('[API] Upload failed:', result.error);
      return respErr(result.error || 'Upload failed');
    }

    console.log('[API] Upload success:', result.url);

    return respData({
      url: result.url,
      key: result.key,
      filename: file.name,
      size: file.size,
    });
  } catch (e) {
    console.error('upload video failed:', e);
    return respErr('upload video failed');
  }
}
