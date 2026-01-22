import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
    return NextResponse.json(
      { error: error.message || 'Request failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, data, method } = body as {
      url?: string;
      data?: unknown;
      method?: 'GET' | 'POST';
    };

    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    if (method === 'GET') {
      return doGet(url, data);
    }

    if (method === 'POST') {
      return doPost(url, data);
    }

    return NextResponse.json({ error: 'Unsupported method' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Request failed' },
      { status: 500 }
    );
  }
}


/**
 * GET请求
 * @param url 
 * @param params json格式string
 * @returns 
 */
async function doGet(url: string, params?: unknown): Promise<NextResponse> {
  let targetUrl = url;
  if (params) {
    let parsedParams: Record<string, string>;
    if (typeof params === 'string') {
      try {
        parsedParams = JSON.parse(params) as Record<string, string>;
      } catch {
        return NextResponse.json(
          { error: 'Invalid params JSON' },
          { status: 400 }
        );
      }
    } else if (typeof params === 'object') {
      parsedParams = params as Record<string, string>;
    } else {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    const queryString = new URLSearchParams(parsedParams).toString();
    targetUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
  }

  const response = await fetch(targetUrl, { method: 'GET' });
  const responseData = await response.json();
  // return responseData;
  return NextResponse.json(responseData, {
    status: response.status,
    headers: corsHeaders,
  });
}

async function doPost(
  url: string,
  data?: unknown,
  headers?: Record<string, string>
): Promise<NextResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data || {}),
  });
  const responseData = await response.json();
  // return responseData;
  return NextResponse.json(responseData, {
    status: response.status,
    headers: corsHeaders,
  });
}


export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
