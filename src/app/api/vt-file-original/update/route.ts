import { respData, respErr } from '@/shared/lib/resp';
import { updateVtFileOriginal } from '@/shared/models/vt_file_original';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, updatedBy, ...updateData } = body;

    if (!id || !updatedBy) {
      return respErr('id and updatedBy are required');
    }

    const result = await updateVtFileOriginal(id, {
      ...updateData,
      updatedBy,
      updatedAt: new Date(),
    });

    if (!result) {
      return respErr('File not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
