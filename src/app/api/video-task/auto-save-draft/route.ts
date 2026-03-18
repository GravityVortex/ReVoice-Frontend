import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { patchSubtitleItemById } from '@/shared/models/vt_task_subtitle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskId = body?.taskId as string | undefined;
    const subtitleId = body?.subtitleId as string | undefined;
    const draftTxt = body?.draftTxt as string | undefined;

    const user = await getUserInfo();
    if (!user) return respErr('no auth, please sign in');

    if (!taskId || !subtitleId || typeof draftTxt !== 'string') {
      return respErr('missing required parameters');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) return respErr('task not found');
    if (task.userId !== user.id) return respErr('no permission');

    await patchSubtitleItemById(taskId, 'translate_srt', subtitleId, {
      vap_draft_txt: draftTxt,
    });

    return respData({ ok: true });
  } catch (e) {
    console.error('[auto-save-draft] failed:', e);
    return respErr('auto save draft failed');
  }
}
