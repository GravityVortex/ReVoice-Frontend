export interface VtFileFinalType {
  id: string;
  taskId: string;
  userId: string;
  fileType: string;
  fileSizeBytes: number;
  r2Key: string;
  r2Bucket: string;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
  delStatus: number;
}
