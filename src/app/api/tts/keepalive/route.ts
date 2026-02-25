import { NextRequest } from 'next/server';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';
import { buildPythonAuthHeaders } from '@/shared/services/pythonAuth';

export const runtime = 'nodejs';

type KeepaliveResult = {
  ok: boolean;
  status?: number;
  ready: boolean;
  payload?: any;
  error?: string;
};

// Best-effort global dedupe (per Node.js runtime instance):
// - 多个用户/多标签页会同时打 keepalive，但真正打到 GPU /health 的频率应尽量低。
// - 这里用“单飞 + TTL 缓存”把 keepalive 收敛到近似全局唯一。
// - 注意：在多实例/Serverless 场景下，这是“每实例”去重；如需真正全局去重需引入共享存储锁。
const KEEPALIVE_DEDUP_WINDOW_MS = (() => {
  const raw = String(process.env.TTS_KEEPALIVE_DEDUP_WINDOW_MS || '').trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1_000 && n <= 5 * 60_000) return n;
  return 50_000; // default: ~1min
})();

let _keepaliveLastAtMs = 0;
let _keepaliveLastBaseUrl = '';
let _keepaliveLastResult: KeepaliveResult | null = null;
let _keepaliveInflight: Promise<KeepaliveResult> | null = null;

function resolveTtsBaseUrl(): string {
  const ttsBaseUrl = String(process.env.TTS_SERVER_BASE_URL || '').trim();
  const baseUrl = ttsBaseUrl || String(PYTHON_SERVER_BASE_URL || '').trim();
  return baseUrl;
}

async function getJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...buildPythonAuthHeaders(),
      },
      signal: controller.signal,
    });
    const raw = await resp.text().catch(() => '');
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    return { resp, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function doKeepalive(baseUrl: string, timeoutMs: number): Promise<KeepaliveResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/health`;
  const { resp, payload } = await getJsonWithTimeout(url, timeoutMs);
  const ready = Boolean((payload as any)?.ready);
  return {
    ok: resp.ok,
    status: resp.status,
    ready,
    payload,
  };
}

/**
 * keepalive: 在用户停留 video-editor 页面时周期性触发，
 * 防止 GPU 容器在 scaledown_window 内缩到 0 导致二次冷启动。
 *
 * 注意：该接口同样是“尽力而为”，失败不会影响业务（最多下次生成再冷启动）。
 */
export async function POST(_request: NextRequest) {
  const user = await getUserInfo();
  if (!user) return respErr('no auth, please sign in');

  const baseUrl = resolveTtsBaseUrl();
  if (!baseUrl) return respErr('missing TTS_SERVER_BASE_URL');

  // keepalive 要非常轻量，避免在高并发下把平台打爆。
  const timeoutMs = 4_000;
  try {
    const now = Date.now();

    // If baseUrl changes between deploys/envs, drop cache to avoid mixing results.
    if (_keepaliveLastBaseUrl && _keepaliveLastBaseUrl !== baseUrl) {
      _keepaliveLastAtMs = 0;
      _keepaliveLastResult = null;
      _keepaliveInflight = null;
    }
    _keepaliveLastBaseUrl = baseUrl;

    if (_keepaliveLastResult && now - _keepaliveLastAtMs < KEEPALIVE_DEDUP_WINDOW_MS) {
      return respData({
        ..._keepaliveLastResult,
        cached: true,
        cached_age_ms: now - _keepaliveLastAtMs,
        ts: now,
      });
    }

    if (!_keepaliveInflight) {
      _keepaliveInflight = doKeepalive(baseUrl, timeoutMs)
        .then((result) => {
          _keepaliveLastAtMs = Date.now();
          _keepaliveLastResult = result;
          return result;
        })
        .finally(() => {
          _keepaliveInflight = null;
        });
    }

    const result = await _keepaliveInflight;
    return respData({
      ...result,
      shared: true,
      ts: Date.now(),
    });
  } catch (e: any) {
    const message = String(e?.message || e || 'unknown error');
    return respData({
      ok: false,
      ready: false,
      error: message,
      ts: Date.now(),
    });
  }
}
