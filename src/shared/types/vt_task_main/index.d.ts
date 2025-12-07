export interface VtTaskMain {
  id: string;
  userId: string;
  originalFileId: string;
  status: string;
  priority: number;
  progress: number;
  currentStep?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  speakerCount: string;
  processDurationSeconds?: number | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string | null;
  updatedAt: Date;
  delStatus: number;
}
