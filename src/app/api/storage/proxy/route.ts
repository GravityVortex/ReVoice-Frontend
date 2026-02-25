import { headers } from 'next/headers';
import { NextRequest } from 'next/server';

import { getAuth } from '@/core/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowedUpstreamHost(hostname: string) {
  // Avoid becoming an open proxy. Keep this strict.
  // We only expect signed R2 endpoints here (private bucket) and optionally public R2 domains.
  return (
    hostname.endsWith('.r2.cloudflarestorage.com') ||
    hostname.endsWith('.r2.dev')
  );
}

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const src = request.nextUrl.searchParams.get('src')?.trim() || '';
  if (!src) return new Response('Missing src', { status: 400 });
  if (src.length > 16_384) return new Response('src too long', { status: 414 });

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(src);
  } catch {
    return new Response('Invalid src', { status: 400 });
  }

  if (upstreamUrl.protocol !== 'https:') {
    return new Response('Invalid src protocol', { status: 400 });
  }
  if (!isAllowedUpstreamHost(upstreamUrl.hostname)) {
    return new Response('Forbidden', { status: 403 });
  }

  const range = request.headers.get('range') || undefined;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      headers: range ? { range } : undefined,
      redirect: 'follow',
    });
  } catch (e) {
    return new Response('Bad gateway', { status: 502 });
  }

  // Forward only a small set of headers that matter for media streaming.
  const outHeaders = new Headers();
  for (const key of [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'etag',
    'last-modified',
  ]) {
    const v = upstream.headers.get(key);
    if (v) outHeaders.set(key, v);
  }

  // The upstream URL is signed and short-lived; keep caching conservative.
  outHeaders.set('cache-control', 'private, max-age=300');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

