// 前端请求过来做综合业务处理
import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/shared/services/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { doGet, doPost } from '@/app/api/request-proxy/route';

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    // 接收前端请求各种业务处理，如：
    // 表操作
    // 服务间请求

    // 服务器之间请求测试
      const url = 'http://sr.xuww.cn:8080/jeecg-boot/test/getWeather?cityId=101190101';
      const params = '';// json格式string
      const result = await doGet(url, params);
      const getResponseData = await result.json();
      console.log('服务器之间GET请求响应--->', JSON.stringify(getResponseData));
      // return NextResponse.json(getResponseData);

      
      const url2 = 'https://xbhixixxbxdfmrzkbcya.supabase.co/functions/v1/sayHello';
      const params2 = '{"name":"李四"}';// json格式string
      const headers = {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiaGl4aXh4YnhkZm1yemtiY3lhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc5OTQyOSwiZXhwIjoyMDc3Mzc1NDI5fQ.ljk3dgxNcHE4wGoLZ9sIvw4bGuq8GPRNyh4ZZSApcmU',
      };
      const result2 = await doPost(url2, params2, headers);
      const postResponseData = await result2.json();
      console.log('服务器之间POST请求响应--->', JSON.stringify(postResponseData));
      // return NextResponse.json(postResponseData);


    return NextResponse.json({ getResponseData, postResponseData });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}
