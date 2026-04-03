import type { ConvertObj } from '@/shared/components/video-editor/types';

import type { HeaderDownloadLabels } from './header-download-actions';
import type { VideoEditorHeaderCapabilities } from './video-editor-header-capabilities';

type TranslateFn = (key: string) => string;

export type VideoEditorHeaderStatusMeta = {
  label: string;
  cls: string;
  icon: 'dot' | 'spin' | 'check' | 'x';
};

export type VideoEditorHeaderSession = {
  locale: string;
  t: TranslateFn;
  view: {
    convertObj: ConvertObj | null;
    videoSourceFileName?: string | null;
    statusMeta: VideoEditorHeaderStatusMeta;
    progressPercent: number;
    totalDuration: number;
    pendingMergeCount: number;
    pendingMergeVoiceCount: number;
    pendingMergeTimingCount: number;
    taskStatus: string;
    taskErrorMessage: string;
    isTaskRunning: boolean;
    isMergeJobActive: boolean;
    taskProgress: number | null;
    mergeStatusRequiresManualRetry: boolean;
    headerCapabilities: VideoEditorHeaderCapabilities;
    headerDownloadLabels: HeaderDownloadLabels;
    headerProgressVisual: number;
    headerProgressFillCls: string;
    hasUnsavedChanges: boolean;
  };
  actions: {
    onBackClick: () => void;
    onRetryMergeStatus: () => void;
    onGenerateVideo: () => void;
    onDownloadVideo: () => void;
    onDownloadAudio: (kind: 'subtitle' | 'background') => void;
    onDownloadSrt: (kind: 'gen_srt' | 'translate_srt' | 'double_srt') => void;
  };
};

export function buildVideoEditorHeaderSession(session: VideoEditorHeaderSession): VideoEditorHeaderSession {
  return session;
}
