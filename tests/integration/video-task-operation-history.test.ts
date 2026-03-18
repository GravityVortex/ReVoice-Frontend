import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserInfo = vi.fn();
const mockFindVtTaskMainById = vi.fn();
const mockGetEditOperationsByTaskId = vi.fn();

vi.mock('@/shared/models/user', () => ({
  getUserInfo: mockGetUserInfo,
}));

vi.mock('@/shared/models/vt_task_main', () => ({
  findVtTaskMainById: mockFindVtTaskMainById,
}));

vi.mock('@/shared/models/vt_edit_operation', () => ({
  getEditOperationsByTaskId: mockGetEditOperationsByTaskId,
}));

async function call(taskId?: string) {
  const { GET } = await import('@/app/api/video-task/operation-history/route');
  const url = taskId
    ? `http://localhost/api/video-task/operation-history?taskId=${taskId}`
    : 'http://localhost/api/video-task/operation-history';
  const req = new Request(url, { method: 'GET' });
  const res = await GET(req);
  const json = await res.json();
  return { res, json };
}

function makeOperation(overrides: Record<string, any> = {}) {
  return {
    id: 'op_row_1',
    taskId: 'task_1',
    userId: 'u1',
    operationType: 'split',
    operationId: 'op_uuid_1',
    operationDetail: { clipId: 'c1', splitAtMs: 2000 },
    rollbackStatus: 0,
    createdAt: new Date('2026-03-15T10:00:00Z'),
    rolledBackAt: null,
    snapshotTranslate: [],
    snapshotSource: [],
    ...overrides,
  };
}

describe('/api/video-task/operation-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'u1' });
    mockGetEditOperationsByTaskId.mockResolvedValue([makeOperation()]);
  });

  it('rejects when not authenticated', async () => {
    mockGetUserInfo.mockResolvedValue(null);
    const { json } = await call('task_1');
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no auth');
  });

  it('rejects missing taskId', async () => {
    const { json } = await call();
    expect(json.code).toBe(-1);
    expect(json.message).toContain('missing');
  });

  it('rejects when task not found', async () => {
    mockFindVtTaskMainById.mockResolvedValue(null);
    const { json } = await call('task_1');
    expect(json.code).toBe(-1);
    expect(json.message).toContain('task not found');
  });

  it('rejects when user does not own the task', async () => {
    mockFindVtTaskMainById.mockResolvedValue({ id: 'task_1', userId: 'other_user' });
    const { json } = await call('task_1');
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no permission');
  });

  it('returns empty list when no operations exist', async () => {
    mockGetEditOperationsByTaskId.mockResolvedValue([]);
    const { json } = await call('task_1');
    expect(json.code).toBe(0);
    expect(json.data).toEqual([]);
  });

  it('returns operation list with only safe metadata fields (no snapshots)', async () => {
    const op = makeOperation();
    mockGetEditOperationsByTaskId.mockResolvedValue([op]);

    const { json } = await call('task_1');

    expect(json.code).toBe(0);
    expect(json.data).toHaveLength(1);

    const item = json.data[0];
    expect(item.id).toBe('op_row_1');
    expect(item.operationType).toBe('split');
    expect(item.operationId).toBe('op_uuid_1');
    expect(item.rollbackStatus).toBe(0);
    expect(item.operationDetail).toEqual({ clipId: 'c1', splitAtMs: 2000 });

    // Sensitive snapshot fields must NOT be exposed
    expect(item.snapshotTranslate).toBeUndefined();
    expect(item.snapshotSource).toBeUndefined();
  });

  it('returns multiple operations ordered by creation time (latest first)', async () => {
    mockGetEditOperationsByTaskId.mockResolvedValue([
      makeOperation({ id: 'op_row_2', operationId: 'op_uuid_2', createdAt: new Date('2026-03-15T11:00:00Z') }),
      makeOperation({ id: 'op_row_1', operationId: 'op_uuid_1', createdAt: new Date('2026-03-15T10:00:00Z') }),
    ]);

    const { json } = await call('task_1');

    expect(json.code).toBe(0);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].operationId).toBe('op_uuid_2');
    expect(json.data[1].operationId).toBe('op_uuid_1');
  });
});
