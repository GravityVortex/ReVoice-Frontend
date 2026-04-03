import { describe, expect, it, vi } from 'vitest';

import { buildVideoEditorHeaderSession } from './video-editor-header-session';

describe('video editor header session', () => {
  it('groups header display data and action bindings into one shell protocol', () => {
    const session = buildVideoEditorHeaderSession({
      locale: 'zh',
      t: (key) => key,
      view: {
        convertObj: null,
        videoSourceFileName: 'demo.mp4',
        statusMeta: {
          label: '处理中',
          cls: 'text-orange',
          icon: 'spin',
        },
        progressPercent: 42,
        totalDuration: 30,
        pendingMergeCount: 1,
        pendingMergeVoiceCount: 1,
        pendingMergeTimingCount: 0,
        taskStatus: 'processing',
        taskErrorMessage: '',
        isTaskRunning: true,
        isMergeJobActive: true,
        taskProgress: 42,
        mergeStatusRequiresManualRetry: false,
        headerCapabilities: {
          mergePrimaryAction: {
            mode: 'generate-video',
            disabled: true,
          },
          showBusySpinner: true,
          download: {
            state: {
              isVisible: true,
              isDisabled: true,
              tooltipKey: 'downloadUpdatingHint',
            },
            tooltipText: '正在生成最新成片，当前可下载上一版成功结果',
          },
        },
        headerDownloadLabels: {
          downloadFinalVideo: '下载成片',
          moreDownloads: '更多下载',
          mobileDownload: '下载',
          downloadDubAudio: '配音音频 .wav',
          downloadBackgroundAudio: '背景音频 .wav',
          downloadOriginalSubtitle: '原字幕 .srt',
          downloadTranslatedSubtitle: '翻译字幕 .srt',
          downloadBilingualSubtitle: '双语字幕 .srt',
          downloadUpdatingHint: '正在生成最新成片，当前可下载上一版成功结果',
        },
        headerProgressVisual: 42,
        headerProgressFillCls: 'bg-primary/80',
        hasUnsavedChanges: true,
      },
      actions: {
        onBackClick: vi.fn(),
        onRetryMergeStatus: vi.fn(),
        onGenerateVideo: vi.fn(),
        onDownloadVideo: vi.fn(),
        onDownloadAudio: vi.fn(),
        onDownloadSrt: vi.fn(),
      },
    });

    expect(session.view.progressPercent).toBe(42);
    expect(session.view.headerCapabilities.download.state.isVisible).toBe(true);
    expect(session.actions.onGenerateVideo).toEqual(expect.any(Function));
  });
});
