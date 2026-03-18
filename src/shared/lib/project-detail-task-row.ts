export type ProjectDetailTaskRowState = {
  showThumbnailPreview: boolean;
  showStatusBadge: boolean;
  showProgress: boolean;
  showErrorSummary: boolean;
};

export function getProjectDetailTaskRowState(
  status: string | null | undefined
): ProjectDetailTaskRowState {
  const safeStatus = status || "pending";

  return {
    showThumbnailPreview: false,
    showStatusBadge: true,
    showProgress: safeStatus === "pending" || safeStatus === "processing",
    showErrorSummary: safeStatus === "failed" || safeStatus === "cancelled",
  };
}
