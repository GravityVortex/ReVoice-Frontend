export interface VtFileTaskType {
  id: string;
  taskId: string;
  userId: string;
  stepName: string;
  fileKey: string;
  fileSizeBytes: number | null;
  r2Key: string;
  r2Bucket: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
  delStatus: number;
}
