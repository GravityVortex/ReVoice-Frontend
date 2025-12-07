export interface VtSystemConfig {
  id: string;
  configKey: string;
  configValue: string;
  configType: string;
  description?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string | null;
  updatedAt: Date;
  delStatus: number;
}
