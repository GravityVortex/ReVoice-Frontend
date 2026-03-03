// NOTE:
// - GET: 同源稳定拉流（给 <video> 使用），避免直接暴露/依赖短时效 presigned URL。
// - POST: 旧的“后端中转上传”接口（有体积限制），保留兼容测试页。

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/core/auth';
import { getStorageService } from '@/shared/services/storage';
import { getUserInfo } from '@/shared/models/user';
import { getPreSignedUrl, type SignUrlItem } from '@/shared/services/javaService';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowedUpstreamHost(hostname: string) {
  // 避免成为开放代理，只允许 R2 域名。
  return hostname.endsWith('.r2.cloudflarestorage.com') || hostname.endsWith('.r2.dev');
}

async function signDownloadUrl(key: string, opts?: { forceRefresh?: boolean }) {
  const params: SignUrlItem[] = [{ path: key, operation: 'download', expirationMinutes: 360 }]; // TTL=6h
  const resUrlArr = await getPreSignedUrl(params, opts);
  const url = resUrlArr?.[0]?.url;
  if (!url || typeof url !== 'string') {
    throw new Error('Failed to get presigned url');
  }
  return url;
}

async function fetchUpstream(url: string, range?: string) {
  return await fetch(url, {
    headers: range ? { range } : undefined,
    redirect: 'follow',
  });
}

export async function GET(request: Request) {
  // Stable streaming endpoint:
  //   GET /api/storage/stream?key={userId}/{fileId}/{relativeKey}
  //
  // It authenticates by session cookie, validates key ownership, then proxies
  // the R2 response (with Range support). If the upstream presigned URL has
  // expired (401/403), it forces a re-sign once and retries.
  try {
    const { searchParams } = new URL(request.url);
    const key = (searchParams.get('key') || '').trim();
    if (!key) return new Response('Missing key', { status: 400 });
    if (key.length > 16_384) return new Response('key too long', { status: 414 });
    if (key.startsWith('/') || key.includes('..')) return new Response('Invalid key', { status: 400 });

    const ownerUserId = key.split('/')[0] || '';
    if (!ownerUserId) return new Response('Invalid key', { status: 400 });

    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Allow admins to inspect/sign another user's private media.
    if (ownerUserId !== session.user.id) {
      const isAdmin = await hasPermission(session.user.id, 'admin.access');
      if (!isAdmin) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const range = request.headers.get('range') || undefined;

    const direct = await signDownloadUrl(key);
    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(direct);
    } catch {
      return new Response('Bad gateway', { status: 502 });
    }
    if (upstreamUrl.protocol !== 'https:' || !isAllowedUpstreamHost(upstreamUrl.hostname)) {
      return new Response('Bad gateway', { status: 502 });
    }

    let upstream: Response;
    try {
      upstream = await fetchUpstream(upstreamUrl.toString(), range);
    } catch {
      return new Response('Bad gateway', { status: 502 });
    }

    // If the upstream URL is expired, force a refresh and retry once.
    if (upstream.status === 401 || upstream.status === 403) {
      try {
        const refreshed = await signDownloadUrl(key, { forceRefresh: true });
        const refreshedUrl = new URL(refreshed);
        if (refreshedUrl.protocol === 'https:' && isAllowedUpstreamHost(refreshedUrl.hostname)) {
          upstream = await fetchUpstream(refreshedUrl.toString(), range);
        }
      } catch {
        // Keep the original upstream response.
      }
    }

    // Forward only a small set of headers that matter for media streaming.
    const outHeaders = new Headers();
    for (const h of [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'etag',
      'last-modified',
    ]) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }

    // The upstream URL is signed and short-lived; keep caching conservative.
    outHeaders.set('cache-control', 'private, max-age=300');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (e) {
    return new Response('Bad gateway', { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `${user.id}/uploads/${Date.now()}-${file.name}`;

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
