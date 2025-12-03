// 前端上传file到后端，后端生成presigned url，前端直接上传到R2，绕过4.5M的限制
import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/shared/services/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { doGet, doPost } from '@/app/api/request-proxy/route';


export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    // 服务器之间请求测试
    // if (true) {
    //   const url = 'http://sr.xuww.cn:8080/jeecg-boot/test/getWeather?cityId=101190101';
    //   const params = '';// json格式string
    //   const result = await doGet(url, params);
    //   const jsonData = await result.json();
    //   console.log('服务器之间GET请求响应--->', JSON.stringify(jsonData));
    //   // return NextResponse.json(jsonData);

      
    //   const url2 = 'https://xbhixixxbxdfmrzkbcya.supabase.co/functions/v1/sayHello';
    //   const params2 = '{"name":"李四"}';// json格式string
    //   const headers = {
    //     'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiaGl4aXh4YnhkZm1yemtiY3lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc5OTQyOSwiZXhwIjoyMDc3Mzc1NDI5fQ.ljk3dgxNcHE4wGoLZ9sIvw4bGuq8GPRNyh4ZZSApcmU',
    //   };
    //   const result2 = await doPost(url2, params2, headers);
    //   const jsonData2 = await result2.json();
    //   console.log('服务器之间POST请求响应--->', JSON.stringify(jsonData2));
    //   return NextResponse.json(jsonData2);

    // }


    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const storageService = await getStorageService();
    // const provider = storageService.getDefaultProvider();
    const provider = storageService.getProvider('r2');

    if (!provider || provider.name !== 'r2') {
      return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
    }

    const r2Config = (provider as any).configs;
    const key = `uploads/${Date.now()}-${filename}`;

    const endpoint = r2Config.endpoint || `https://${r2Config.accountId}.r2.cloudflarestorage.com`;

    const s3Client = new S3Client({
      region: r2Config.region || 'auto',
      endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      ContentType: contentType || 'video/mp4',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    const publicUrl = r2Config.publicDomain
      ? `${r2Config.publicDomain}/${key}`
      : `${endpoint}/${r2Config.bucket}/${key}`;

    // {
    //   "presignedUrl": "https://video-store.a611f60c1436512acfe03a1efe79a50a.r2.cloudflarestorage.com/uploads/1764719912423-test2.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=f0502145157ae21bb75b13827acb0e64%2F20251202%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20251202T235832Z&X-Amz-Expires=3600&X-Amz-Signature=9881566d7f2b89da28bcc936a595df1b98e98fec90c1ce5ee84d1656da33255b&X-Amz-SignedHeaders=host&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject",
    //   "key": "uploads/1764719912423-test2.mp4",
    //   "publicUrl": "https://pub-df378f36240d4648afc4ca279c89cd0c.r2.dev/uploads/1764719912423-test2.mp4"
    // }


    return NextResponse.json({ presignedUrl, key, publicUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}
