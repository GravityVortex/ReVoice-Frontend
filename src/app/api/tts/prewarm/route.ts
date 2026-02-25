import { NextRequest } from 'next/server';

import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { PYTHON_SERVER_BASE_URL } from '@/shared/cache/system-config';
import { buildPythonAuthHeaders } from '@/shared/services/pythonAuth';

export const runtime = 'nodejs';

function resolveTtsBaseUrl(): string {
  const ttsBaseUrl = String(process.env.TTS_SERVER_BASE_URL || '').trim();
  const baseUrl = ttsBaseUrl || String(PYTHON_SERVER_BASE_URL || '').trim();
  return baseUrl;
}

async function postJsonWithTimeout(url: string, payload: any, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildPythonAuthHeaders(),
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 预热 TTS GPU 容器（用于 video-editor 页面进入时提前 warmup）。
 *
 * 设计目标：
 * - 成本：不常驻 GPU（min_containers=0），仅在用户进入编辑页时触发。
 * - 体验：让冷启动/快照创建/restore 尽量发生在用户真正点击“生成语音”之前。
 *
 * 注意：
 * - 该接口是“尽力而为”：即使触发请求超时，也不影响后续业务请求（业务请求仍会等待/重试）。
 */
export async function POST(request: NextRequest) {
  const user = await getUserInfo();
  if (!user) return respErr('no auth, please sign in');

  const baseUrl = resolveTtsBaseUrl();
  if (!baseUrl) return respErr('missing TTS_SERVER_BASE_URL');

  // Best-effort: cold start of GPU web endpoint may exceed serverless timeout.
  // We intentionally keep a short timeout here to avoid blocking the editor UI.
  const timeoutMs = 8_000;

  try {
    const body = await request.json().catch(() => ({}));
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';

    const url = `${baseUrl.replace(/\/+$/, '')}/api/internal/modal/warmup?target=service`;
    const resp = await postJsonWithTimeout(url, null, timeoutMs);
    const raw = await resp.text().catch(() => '');
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }

    // Even if the warmup endpoint returns non-2xx, we still treat this as "attempted",
    // because the GPU container may have already started booting.
    return respData({
      attempted: true,
      ok: resp.ok,
      status: resp.status,
      taskId,
      baseUrl,
      payload,
    });
  } catch (e: any) {
    // Treat timeout/abort as "attempted": the request may have reached Modal and triggered cold start.
    const message = String(e?.message || e || 'unknown error');
    return respData({
      attempted: true,
      ok: false,
      error: message,
      baseUrl,
    });
  }
}
