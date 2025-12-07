export interface VtFileOriginal {
  id: string;
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;
  r2Key: string;
  r2Bucket: string;
  videoDurationSeconds?: number | null;
  checksumSha256?: string | null;
  uploadStatus: string;
  coverR2Key?: string | null;
  coverSizeBytes?: number | null;
  coverUpdatedAt?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string | null;
  updatedAt: Date;
  delStatus: number;
}
