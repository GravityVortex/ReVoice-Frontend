import { respData, respErr } from '@/shared/lib/resp';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return respErr('id is required');
    }

    const result = await findVtFileOriginalById(id);

    if (!result) {
      return respErr('File not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
