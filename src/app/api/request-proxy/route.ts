import { NextRequest, NextResponse } from 'next/server';

/**
 * 后台请求工具，服务器之间请求
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const params = searchParams.get('params') || null;

    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }
    return doGet(url, params);

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Request failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, data, method } = body;

    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    if (method === 'GET') {
      return doGet(url, data);
    }

    else if (method === 'POST') {
      return doPost(url, data);
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Request failed' }, { status: 500 });
  }
}


/**
 * GET请求
 * @param url 
 * @param params json格式string
 * @returns 
 */
export async function doGet(url: string, params?: string | null): Promise<any> {
  let targetUrl = url;
  if (params) {
    const parsedParams = JSON.parse(params);
    const queryString = new URLSearchParams(parsedParams).toString();
    targetUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
  }

  const response = await fetch(targetUrl, { method: 'GET' });
  const responseData = await response.json();
  // return responseData;
  return NextResponse.json(responseData, {
    status: response.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function doPost(url: string, data?: string, headers?: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data || {}),
  });
  const responseData = await response.json();
  // return responseData;
  return NextResponse.json(responseData, {
    status: response.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}


export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
