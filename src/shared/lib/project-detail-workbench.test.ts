import { describe, expect, it } from 'vitest';

import { getProjectDetailWorkbenchState, type ProjectDetailWorkbenchMode } from './project-detail-workbench';

function expectMode(status: string, mode: ProjectDetailWorkbenchMode) {
  expect(getProjectDetailWorkbenchState(status).mode).toBe(mode);
}

describe('project-detail-workbench', () => {
  it('treats completed tasks as a delivery-focused workspace', () => {
    const state = getProjectDetailWorkbenchState('completed');

    expectMode('completed', 'delivery');
    expect(state.showRecoveryActions).toBe(false);
    expect(state.showProgressReview).toBe(true);
    expect(state.showDeliverables).toBe(true);
    expect(state.primaryAction).toBe('edit');
  });

  it('treats processing and pending tasks as an active workspace', () => {
    expectMode('processing', 'active');
    expectMode('pending', 'active');

    expect(getProjectDetailWorkbenchState('processing')).toMatchObject({
      showRecoveryActions: false,
      showProgressReview: true,
      showDeliverables: false,
      primaryAction: 'track',
    });
  });

  it('treats failed and cancelled tasks as a recoverable workspace', () => {
    expectMode('failed', 'recoverable');
    expectMode('cancelled', 'recoverable');

    expect(getProjectDetailWorkbenchState('failed')).toMatchObject({
      showRecoveryActions: true,
      showProgressReview: true,
      showDeliverables: false,
      primaryAction: 'retry',
    });
  });

  it('falls back unknown statuses to the active workspace to keep guidance visible', () => {
    expect(getProjectDetailWorkbenchState('queued')).toMatchObject({
      mode: 'active',
      showRecoveryActions: false,
      showProgressReview: true,
      showDeliverables: false,
      primaryAction: 'track',
    });
  });
});
