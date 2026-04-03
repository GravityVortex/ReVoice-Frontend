import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/blocks/common/error-state', () => ({
  ErrorBlock: ({ message }: { message: string }) => <div data-slot="error-block">{message}</div>,
}));

vi.mock('@/shared/components/ui/badge', () => ({
  Badge: ({ children, className }: Record<string, any>) => <span className={className}>{children}</span>,
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, className, ...props }: Record<string, any>) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/popover', () => ({
  Popover: ({ children }: Record<string, any>) => <div data-slot="popover">{children}</div>,
  PopoverTrigger: ({ children }: Record<string, any>) => <div data-slot="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: Record<string, any>) => <div data-slot="popover-content">{children}</div>,
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: Record<string, any>) => <div data-slot="tooltip">{children}</div>,
  TooltipTrigger: ({ children }: Record<string, any>) => <div data-slot="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: Record<string, any>) => <div data-slot="tooltip-content">{children}</div>,
}));

vi.mock('./header-download-actions', () => ({
  HeaderDownloadActions: ({ isVisible, isDisabled, tooltipText }: Record<string, any>) => (
    <div
      data-slot="header-download-actions"
      data-visible={String(isVisible)}
      data-disabled={String(isDisabled)}
      data-tooltip={tooltipText || ''}
    />
  ),
}));

import { VideoEditorHeader } from './video-editor-header';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    headerSession: {
      locale: 'zh',
      t: (key: string) => key,
      view: {
        convertObj: null,
        videoSourceFileName: 'demo.mp4',
        statusMeta: {
          label: '处理中',
          cls: 'text-orange',
          icon: 'spin' as const,
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
        headerCapabilities: {
          mergePrimaryAction: {
            mode: 'generate-video' as const,
            disabled: true,
          },
          showBusySpinner: true,
          download: {
            state: {
              isVisible: true,
              isDisabled: true,
              tooltipKey: 'downloadUpdatingHint' as const,
            },
            tooltipText: '正在生成最新成片，当前可下载上一版成功结果',
          },
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
    },
    ...overrides,
  };
}

describe('VideoEditorHeader render', () => {
  it('consumes header capabilities as a single shell protocol instead of scattered gating props', () => {
    const source = readFileSync(new URL('./video-editor-header.tsx', import.meta.url), 'utf8');

    expect(source).toContain('headerSession: VideoEditorHeaderSession;');
    expect(source).toContain('props.headerSession.view.headerCapabilities.mergePrimaryAction.disabled');
    expect(source).toContain('props.headerSession.view.headerCapabilities.showBusySpinner');
    expect(source).toContain('props.headerSession.view.headerCapabilities.download.state.isVisible');
    expect(source).toContain('props.headerSession.view.headerCapabilities.download.tooltipText');
    expect(source).not.toContain('props.headerCapabilities.mergePrimaryAction.disabled');
    expect(source).not.toContain('props.headerDownloadLabels');
  });

  it('renders retry-status copy and preserves disabled download actions while merge status waits for manual retry', () => {
    const html = renderToStaticMarkup(
      <VideoEditorHeader
        {...makeProps({
          headerSession: {
            ...makeProps().headerSession,
            view: {
              ...makeProps().headerSession.view,
              mergeStatusRequiresManualRetry: true,
              headerCapabilities: {
                mergePrimaryAction: {
                  mode: 'retry-status',
                  disabled: false,
                },
                showBusySpinner: false,
                download: {
                  state: {
                    isVisible: true,
                    isDisabled: true,
                    tooltipKey: 'downloadUpdatingHint' as const,
                  },
                  tooltipText: '正在生成最新成片，当前可下载上一版成功结果',
                },
              },
            },
          },
        })}
      />
    );

    expect(html).toContain('状态待重试');
    expect(html).toContain('header.mergeStatusRetryTooltip');
    expect(html).toContain('data-slot="header-download-actions"');
    expect(html).toContain('data-visible="true"');
    expect(html).toContain('data-disabled="true"');
  });

  it('renders generate action copy when there are unsaved changes but no active merge', () => {
    const html = renderToStaticMarkup(
      <VideoEditorHeader
        {...makeProps({
          headerSession: {
            ...makeProps().headerSession,
            view: {
              ...makeProps().headerSession.view,
              isTaskRunning: false,
              isMergeJobActive: false,
              taskStatus: 'completed',
              taskProgress: 100,
              pendingMergeCount: 0,
              pendingMergeVoiceCount: 0,
              pendingMergeTimingCount: 0,
              headerCapabilities: {
                mergePrimaryAction: {
                  mode: 'generate-video',
                  disabled: false,
                },
                showBusySpinner: false,
                download: {
                  state: {
                    isVisible: true,
                    isDisabled: false,
                    tooltipKey: null,
                  },
                  tooltipText: null,
                },
              },
            },
          },
        })}
      />
    );

    expect(html).toContain('audioList.saveTooltip');
    expect(html).toContain('data-visible="true"');
    expect(html).toContain('data-disabled="false"');
  });
});
