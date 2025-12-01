import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/shared/services/storage';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `uploads/${Date.now()}-${file.name}`;

    const storageService = await getStorageService();
    const result = await storageService.uploadFile({
      body: buffer,
      key,
      contentType: file.type,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ url: result.url, key: result.key });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };
