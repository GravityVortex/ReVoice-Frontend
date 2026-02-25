import { MODAL_KEY, MODAL_SECRET, PYTHON_SECRET } from '@/shared/cache/system-config';

/**
 * 构造调用 Python/TTS 服务的鉴权 Header（兼容多部署形态）。
 *
 * - Modal Web Endpoint：由平台层使用 Modal-Key/Modal-Secret 校验。
 * - 非 Modal（如自建/RunPod）：应用层可使用 X-Internal-API-Key 校验。
 *
 * 说明：
 * - 该函数只在服务端代码里使用（Next.js route / server code）。
 * - 哪些字段生效取决于后端部署方式与配置；这里按“已配置就带上”的策略做兼容。
 */
export function buildPythonAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (MODAL_KEY && MODAL_SECRET) {
    headers['Modal-Key'] = MODAL_KEY;
    headers['Modal-Secret'] = MODAL_SECRET;
  }

  // 兼容非 Modal 部署：后端可能启用 X-Internal-API-Key（TTS_API_SECURITY.internal_api_key）。
  // PYTHON_SECRET 虽标记“已废弃”，但很多环境仍复用它做内部鉴权；这里保留兼容。
  if (PYTHON_SECRET) {
    headers['X-Internal-API-Key'] = PYTHON_SECRET;
  }

  return headers;
}

