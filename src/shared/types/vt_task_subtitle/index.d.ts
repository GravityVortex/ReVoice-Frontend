export interface VtTaskSubtitle {
  id: string;
  taskId: string;
  userId: string;
  stepName: string;
  subtitleData: any;
  subtitleFormat?: string | null;
  language?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string | null;
  updatedAt: Date;
  delStatus: number;
}
