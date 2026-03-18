export type ProjectDetailWorkbenchMode = 'delivery' | 'active' | 'recoverable';

export type ProjectDetailWorkbenchPrimaryAction = 'edit' | 'track' | 'retry';

export type ProjectDetailWorkbenchState = {
  mode: ProjectDetailWorkbenchMode;
  primaryAction: ProjectDetailWorkbenchPrimaryAction;
  showRecoveryActions: boolean;
  showProgressReview: boolean;
  showDeliverables: boolean;
};

export function getProjectDetailWorkbenchState(status: string | null | undefined): ProjectDetailWorkbenchState {
  if (status === 'completed') {
    return {
      mode: 'delivery',
      primaryAction: 'edit',
      showRecoveryActions: false,
      showProgressReview: true,
      showDeliverables: true,
    };
  }

  if (status === 'failed' || status === 'cancelled') {
    return {
      mode: 'recoverable',
      primaryAction: 'retry',
      showRecoveryActions: true,
      showProgressReview: true,
      showDeliverables: false,
    };
  }

  return {
    mode: 'active',
    primaryAction: 'track',
    showRecoveryActions: false,
    showProgressReview: true,
    showDeliverables: false,
  };
}
