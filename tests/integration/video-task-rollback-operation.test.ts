import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockFindEditOperationByOperationId = vi.fn();
const mockGetEditOperationsByTaskId = vi.fn();
const mockUpdateEditOperationRollbackStatus = vi.fn();
const mockReplaceSubtitleDataPairByTaskIdTx = vi.fn();

vi.mock('@/shared/models/user', () => ({
  getUserInfo: mockGetUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById: mockFindVtTaskMainById,
}));

vi.mock('@/shared/models/vt_edit_operation', () => ({
  findEditOperationByOperationId: mockFindEditOperationByOperationId,
  getEditOperationsByTaskId: mockGetEditOperationsByTaskId,
  updateEditOperationRollbackStatus: mockUpdateEditOperationRollbackStatus,
}));

vi.mock('@/shared/models/vt_task_subtitle', () => ({
  replaceSubtitleDataPairByTaskIdTx: mockReplaceSubtitleDataPairByTaskIdTx,
}));

async function call(body: any) {
  const { POST } = await import('@/app/api/video-task/rollback-operation/route');
  const req = new Request('http://localhost/api/video-task/rollback-operation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { res, json };
}

const SNAPSHOT_TRANSLATE = [{ id: 'a', seq: '1', txt: 'hello' }];
const SNAPSHOT_SOURCE = [{ id: 'a', seq: '1', txt: 'hello' }];

function makeOperation(overrides: Record<string, any> = {}) {
  return {
    id: 'op_row_1',
    taskId: 'task_1',
    userId: 'u1',
    operationType: 'split',
    operationId: 'op_uuid_1',
    snapshotTranslate: SNAPSHOT_TRANSLATE,
    snapshotSource: SNAPSHOT_SOURCE,
    operationDetail: {},
    rollbackStatus: 0,
    ...overrides,
  };
}

describe('/api/video-task/rollback-operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'u1' });
    mockFindEditOperationByOperationId.mockResolvedValue(makeOperation());
    mockGetEditOperationsByTaskId.mockResolvedValue([makeOperation()]);
    mockReplaceSubtitleDataPairByTaskIdTx.mockResolvedValue({});
    mockUpdateEditOperationRollbackStatus.mockResolvedValue(undefined);
  });

  it('rejects when not authenticated', async () => {
    mockGetUserInfo.mockResolvedValue(null);
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no auth');
  });

  it('rejects missing required fields', async () => {
    const { json } = await call({ taskId: 'task_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('missing');
  });

  it('rejects when task not found', async () => {
    mockFindVtTaskMainById.mockResolvedValue(null);
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('task not found');
  });

  it('rejects when user does not own the task', async () => {
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'other_user' });
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no permission');
  });

  it('rejects when operation not found', async () => {
    mockFindEditOperationByOperationId.mockResolvedValue(null);
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('operation not found');
  });

  it('rejects when operation is already rolled back', async () => {
    mockFindEditOperationByOperationId.mockResolvedValue(makeOperation({ rollbackStatus: 1 }));
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('already rolled back');
  });

  it('rejects when trying to rollback a non-latest operation (stack constraint)', async () => {
    // Two operations: op_uuid_1 (older) and op_uuid_2 (newer, non-rolled-back)
    mockGetEditOperationsByTaskId.mockResolvedValue([
      makeOperation({ operationId: 'op_uuid_2', id: 'op_row_2' }), // latest (first in desc order)
      makeOperation({ operationId: 'op_uuid_1', id: 'op_row_1' }), // older
    ]);
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('只能回滚最近一次');
  });

  it('successfully rolls back the latest operation and restores subtitle data', async () => {
    const { json } = await call({ taskId: 'task_1', operationId: 'op_uuid_1' });

    expect(json.code).toBe(0);
    expect(json.data.translate).toEqual(SNAPSHOT_TRANSLATE);
    expect(json.data.source).toEqual(SNAPSHOT_SOURCE);

    expect(mockReplaceSubtitleDataPairByTaskIdTx).toHaveBeenCalledWith('task_1', {
      translate: SNAPSHOT_TRANSLATE,
      source: SNAPSHOT_SOURCE,
    });
    expect(mockUpdateEditOperationRollbackStatus).toHaveBeenCalledWith('op_row_1', 1, 'u1');
  });
});
