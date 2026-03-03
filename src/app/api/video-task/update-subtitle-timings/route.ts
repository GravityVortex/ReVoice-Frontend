import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { findVtTaskSubtitleByTaskIdAndStepName, updateVtTaskSubtitle } from '@/shared/models/vt_task_subtitle';
import { javaR2CoverWriteFile } from '@/shared/services/javaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type TimingUpdate = {
  id: string;
  startMs: number;
  endMs: number;
};

const LEGACY_ID_RE = /^(\d+)_([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3})_([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3})$/;

function msToSrtTime(msInput: number) {
  const msSafe = Number.isFinite(msInput) ? Math.max(0, Math.round(msInput)) : 0;
  const ms = msSafe % 1000;
  const totalSec = (msSafe - ms) / 1000;
  const sec = totalSec % 60;
  const totalMin = (totalSec - sec) / 60;
  const min = totalMin % 60;
  const h = (totalMin - min) / 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function msToLegacyIdTime(msInput: number) {
  const msSafe = Number.isFinite(msInput) ? Math.max(0, Math.round(msInput)) : 0;
  const ms = msSafe % 1000;
  const totalSec = (msSafe - ms) / 1000;
  const sec = totalSec % 60;
  const totalMin = (totalSec - sec) / 60;
  const min = totalMin % 60;
  const h = (totalMin - min) / 60;
  return `${String(h).padStart(2, '0')}-${String(min).padStart(2, '0')}-${String(sec).padStart(2, '0')}-${String(ms).padStart(3, '0')}`;
}

function isSafeId(id: string) {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    !id.includes('..') &&
    !id.includes('/') &&
    !id.includes('\\')
  );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskId = body?.taskId as string | undefined;
    const stepName = (body?.stepName as string | undefined) ?? 'translate_srt';
    const items = body?.items as TimingUpdate[] | undefined;

    const user = await getUserInfo();
    if (!user) return respErr('no auth, please sign in');

    if (!taskId || !Array.isArray(items) || items.length === 0) {
      return respErr('missing required parameters');
    }
    if (stepName !== 'translate_srt') {
      return respErr('unsupported stepName');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) return respErr('task not found');
    if (task.userId !== user.id) return respErr('no permission');

    const updates = new Map<string, { startMs: number; endMs: number }>();
    for (const it of items) {
      const id = (it as any)?.id;
      const startMs = (it as any)?.startMs;
      const endMs = (it as any)?.endMs;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      const s = Math.max(0, Math.round(startMs));
      const e = Math.max(0, Math.round(endMs));
      if (e <= s) continue;
      updates.set(id, { startMs: s, endMs: e });
    }

    if (updates.size === 0) {
      return respErr('no valid items');
    }

    const subtitleRow = await findVtTaskSubtitleByTaskIdAndStepName(taskId, stepName);
    if (!subtitleRow) return respErr('subtitle not found');

    const raw = (subtitleRow as any).subtitleData as unknown;
    const subtitleData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(subtitleData)) return respErr('invalid subtitleData');

    const existingIds = new Set<string>();
    for (const row of subtitleData) {
      const id = (row as any)?.id;
      if (typeof id === 'string' && id.length > 0) existingIds.add(id);
    }
    const missingIds = [...updates.keys()].filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      return respErr(`subtitle item(s) not found: ${missingIds.slice(0, 3).join(', ')}${missingIds.length > 3 ? '…' : ''}`);
    }

    let updated = 0;
    const nowMs = Date.now();
    const idMap = new Map<string, string>();
    const nextSubtitleData = subtitleData.map((row: any) => {
      const id = row?.id;
      if (typeof id !== 'string') return row;
      const up = updates.get(id);
      if (!up) return row;
      if (!isSafeId(id)) {
        throw new Error(`unsafe id: ${id}`);
      }

      const start = msToSrtTime(up.startMs);
      const end = msToSrtTime(up.endMs);

      let nextId = id;
      const m = id.match(LEGACY_ID_RE);
      if (m) {
        const seq = m[1];
        nextId = `${seq}_${msToLegacyIdTime(up.startMs)}_${msToLegacyIdTime(up.endMs)}`;
        if (!isSafeId(nextId)) {
          throw new Error(`unsafe next id: ${nextId}`);
        }
        if (nextId !== id) idMap.set(id, nextId);
      }

      if (row.id === nextId && row.start === start && row.end === end) return row;
      updated += 1;

      // timing_rev_ms：只在时间轴真正发生变化并落库时更新，用于刷新后判断是否需要重新合成视频。
      const out = { ...row, id: nextId, start, end, timing_rev_ms: nowMs };
      if (typeof out.audio_url === 'string' && m) {
        // Best-effort: keep derived paths consistent with the new id (if present).
        out.audio_url = out.audio_url.replaceAll(id, nextId);
      }
      return out;
    });

    // Validate final ids are unique (avoid subtle corruption).
    const finalIds = new Set<string>();
    for (const row of nextSubtitleData) {
      const id = (row as any)?.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (finalIds.has(id)) {
        return respErr(`duplicate subtitle id after update: ${id}`);
      }
      finalIds.add(id);
    }

    if (updated === 0) {
      return respData({ updated: 0, renamed: 0, idMap: {} });
    }

    // If ids are time-coded, we must copy the existing audio file to the new id
    // so that the merge step (external) can keep working without protocol changes.
    const renameOps = [...idMap.entries()];
    if (renameOps.length > 0) {
      const bucketName = (await getSystemConfigByKey('r2.bucket.public')) || 'zhesheng-public';

      await mapLimit(renameOps, 4, async ([oldId, newId]) => {
        const sourcePath = `${task.userId}/${taskId}/adj_audio_time/${oldId}.wav`;
        const targetPath = `${task.userId}/${taskId}/adj_audio_time/${newId}.wav`;
        const backJO = await javaR2CoverWriteFile(sourcePath, targetPath, bucketName);
        if (!backJO || (backJO as any).code !== 200) {
          const msg = typeof (backJO as any)?.message === 'string' ? (backJO as any).message : '';
          throw new Error(`r2 overwrite-file failed: ${oldId} -> ${newId}${msg ? ` (${msg})` : ''}`);
        }
      });
    }

    await updateVtTaskSubtitle(subtitleRow.id, {
      subtitleData: nextSubtitleData,
      updatedAt: new Date(),
    });

    return respData({ updated, renamed: renameOps.length, idMap: Object.fromEntries(idMap) });
  } catch (e) {
    console.log('update subtitle timings failed:', e);
    return respErr('update subtitle timings failed');
  }
}
