import { describe, expect, it } from 'vitest';

import { getProjectDetailTaskRowState } from './project-detail-task-row';

describe('project-detail-task-row', () => {
  it('uses a single explicit status badge and no repeated thumbnail preview', () => {
    expect(getProjectDetailTaskRowState('processing')).toMatchObject({
      showThumbnailPreview: false,
      showStatusBadge: true,
      showProgress: true,
      showErrorSummary: false,
    });
  });

  it('shows an error summary only for failed and cancelled rows', () => {
    expect(getProjectDetailTaskRowState('failed')).toMatchObject({
      showThumbnailPreview: false,
      showStatusBadge: true,
      showProgress: false,
      showErrorSummary: true,
    });

    expect(getProjectDetailTaskRowState('cancelled')).toMatchObject({
      showErrorSummary: true,
    });
  });

  it('keeps completed rows compact while preserving the main status badge', () => {
    expect(getProjectDetailTaskRowState('completed')).toMatchObject({
      showThumbnailPreview: false,
      showStatusBadge: true,
      showProgress: false,
      showErrorSummary: false,
    });
  });
});
