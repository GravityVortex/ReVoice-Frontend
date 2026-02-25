import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetUserInfo = vi.fn();
const mockFindVtFileOriginalById = vi.fn();
const mockGetSystemConfigByKey = vi.fn();
const mockGetVtTaskMainListByFileIds = vi.fn();
const mockInsertVtTaskMain = vi.fn();
const mockConsumeCredits = vi.fn();
const mockRefundCredits = vi.fn();
const mockGetCurrentSubscription = vi.fn();
const mockHasActivePromoEntitlement = vi.fn();
const mockGetUuid = vi.fn();

vi.mock('@/shared/models/user', () => ({ getUserInfo: mockGetUserInfo }));
vi.mock('@/shared/models/vt_file_original', () => ({ findVtFileOriginalById: mockFindVtFileOriginalById }));
vi.mock('@/shared/cache/system-config', () => ({ getSystemConfigByKey: mockGetSystemConfigByKey }));
vi.mock('@/shared/models/vt_task_main', () => ({
  getVtTaskMainListByFileIds: mockGetVtTaskMainListByFileIds,
  insertVtTaskMain: mockInsertVtTaskMain,
}));
vi.mock('@/shared/models/credit', () => ({
  consumeCredits: mockConsumeCredits,
  refundCredits: mockRefundCredits,
  hasActivePromoEntitlement: mockHasActivePromoEntitlement,
}));
vi.mock('@/shared/models/subscription', () => ({ getCurrentSubscription: mockGetCurrentSubscription }));
vi.mock('@/shared/lib/hash', () => ({ getUuid: mockGetUuid }));

async function call(body: any) {
  const { POST } = await import('@/app/api/video-task/add-run/route');
  const req = new Request('http://localhost/api/video-task/add-run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  const json = await res.json();
  return { res, json };
}

describe('/api/video-task/add-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUuid.mockReturnValue('task_new');
    mockGetUserInfo.mockResolvedValue({ id: 'u1' });
    mockFindVtFileOriginalById.mockResolvedValue({
      id: 'f1',
      userId: 'u1',
      videoDurationSeconds: 120,
    });
    mockGetSystemConfigByKey.mockResolvedValue('3');
    mockGetVtTaskMainListByFileIds.mockResolvedValue([]);
    mockConsumeCredits.mockResolvedValue({ id: 'credit_1' });
    mockRefundCredits.mockResolvedValue({});
    mockGetCurrentSubscription.mockResolvedValue(undefined);
    mockHasActivePromoEntitlement.mockResolvedValue(false);
    mockInsertVtTaskMain.mockResolvedValue({ id: 'task_new' });
  });

  it('rejects when not authenticated', async () => {
    mockGetUserInfo.mockResolvedValue(null);
    const { json } = await call({
      originalFileId: 'f1',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      speakerCount: '1',
    });
    expect(json.code).toBe(-1);
    expect(json.message).toContain('no auth');
  });

  it('rejects missing required fields', async () => {
    const { json } = await call({ originalFileId: 'f1' });
    expect(json.code).toBe(-1);
    expect(json.message).toBe('Missing required fields');
  });

  it('blocks duplicate source+target when existing run is not failed/cancelled', async () => {
    mockGetVtTaskMainListByFileIds.mockResolvedValue([
      { id: 'task_exist', sourceLanguage: 'zh', targetLanguage: 'en', status: 'completed' },
    ]);

    const { json } = await call({
      originalFileId: 'f1',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      speakerCount: '1',
    });

    expect(json.code).toBe(-1);
    expect(json.message).toContain('Duplicate');
    expect(json.data?.existingTaskId).toBe('task_exist');
    expect(mockConsumeCredits).not.toHaveBeenCalled();
    expect(mockInsertVtTaskMain).not.toHaveBeenCalled();
  });

  it('allows re-create when previous run is failed', async () => {
    mockGetVtTaskMainListByFileIds.mockResolvedValue([
      { id: 'task_failed', sourceLanguage: 'zh', targetLanguage: 'en', status: 'failed' },
    ]);

    const { json } = await call({
      originalFileId: 'f1',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      speakerCount: '2',
    });

    expect(json.code).toBe(0);
    expect(mockConsumeCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', credits: 6 })
    );
    expect(mockInsertVtTaskMain).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task_new',
        userId: 'u1',
        originalFileId: 'f1',
        sourceLanguage: 'zh',
        targetLanguage: 'en',
        speakerCount: '2',
        priority: 4,
        creditsConsumed: 6,
        creditId: 'credit_1',
      })
    );
  });

  it('uses higher priority when subscription or promo is active', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ id: 'sub_1' });
    const { json } = await call({
      originalFileId: 'f1',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      speakerCount: '1',
    });
    expect(json.code).toBe(0);
    expect(mockInsertVtTaskMain).toHaveBeenCalledWith(expect.objectContaining({ priority: 2 }));
  });

  it('refunds credits if insert fails', async () => {
    mockInsertVtTaskMain.mockRejectedValue(new Error('db down'));
    const { json } = await call({
      originalFileId: 'f1',
      sourceLanguage: 'zh',
      targetLanguage: 'en',
      speakerCount: '1',
    });
    expect(json.code).toBe(-1);
    expect(json.message).toBe('failed');
    expect(mockRefundCredits).toHaveBeenCalledWith({ creditId: 'credit_1' });
  });
});

