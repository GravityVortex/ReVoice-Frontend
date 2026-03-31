import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { getHeaderDownloadState, HeaderDownloadActions } from './header-download-actions';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, className, ...props }: Record<string, any>) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: Record<string, any>) => <div data-slot="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: Record<string, any>) => <div data-slot="dropdown-menu-trigger">{children}</div>,
  DropdownMenuContent: ({ children, className, ...props }: Record<string, any>) => (
    <div data-slot="dropdown-menu-content" className={className} {...props}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({ children, className, ...props }: Record<string, any>) => (
    <div data-slot="dropdown-menu-item" className={className} {...props}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: (props: Record<string, any>) => <div data-slot="dropdown-menu-separator" {...props} />,
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: Record<string, any>) => <div data-slot="tooltip">{children}</div>,
  TooltipTrigger: ({ children }: Record<string, any>) => <div data-slot="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: Record<string, any>) => <div data-slot="tooltip-content">{children}</div>,
}));

function createLabels() {
  return {
    downloadFinalVideo: '下载成片',
    moreDownloads: '更多下载',
    mobileDownload: '下载',
    downloadDubAudio: '配音音频 .wav',
    downloadBackgroundAudio: '背景音频 .wav',
    downloadOriginalSubtitle: '原字幕 .srt',
    downloadTranslatedSubtitle: '翻译字幕 .srt',
    downloadBilingualSubtitle: '双语字幕 .srt',
    downloadUpdatingHint: '正在生成最新成片，当前可下载上一版成功结果',
  };
}

describe('getHeaderDownloadState', () => {
  it('shows downloadable actions for completed tasks', () => {
    expect(
      getHeaderDownloadState({
        taskStatus: 'completed',
        serverLastMergedAtMs: 0,
        isTaskRunning: false,
        isMergeJobActive: false,
      })
    ).toMatchObject({
      isVisible: true,
      isDisabled: false,
      tooltipKey: null,
    });
  });

  it('keeps previous download actions visible but disabled while a merge job is active', () => {
    expect(
      getHeaderDownloadState({
        taskStatus: 'processing',
        serverLastMergedAtMs: 1700000000000,
        isTaskRunning: true,
        isMergeJobActive: true,
      })
    ).toMatchObject({
      isVisible: true,
      isDisabled: true,
      tooltipKey: 'downloadUpdatingHint',
    });
  });

  it('hides download actions when no successful output exists yet', () => {
    expect(
      getHeaderDownloadState({
        taskStatus: 'processing',
        serverLastMergedAtMs: 0,
        isTaskRunning: true,
        isMergeJobActive: false,
      })
    ).toMatchObject({
      isVisible: false,
      isDisabled: true,
      tooltipKey: null,
    });
  });

  it('keeps download actions hidden during the first active merge when no successful output exists yet', () => {
    expect(
      getHeaderDownloadState({
        taskStatus: 'processing',
        serverLastMergedAtMs: 0,
        isTaskRunning: true,
        isMergeJobActive: true,
      })
    ).toMatchObject({
      isVisible: false,
      isDisabled: true,
      tooltipKey: null,
    });
  });
});

describe('HeaderDownloadActions', () => {
  it('renders nothing when downloads are not visible', () => {
    const html = renderToStaticMarkup(
      <HeaderDownloadActions
        labels={createLabels()}
        isVisible={false}
        isDisabled={false}
        tooltipText={null}
        onDownloadVideo={vi.fn()}
        onDownloadDubAudio={vi.fn()}
        onDownloadBackgroundAudio={vi.fn()}
        onDownloadOriginalSubtitle={vi.fn()}
        onDownloadTranslatedSubtitle={vi.fn()}
        onDownloadBilingualSubtitle={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('renders desktop direct-download and secondary menu actions', () => {
    const html = renderToStaticMarkup(
      <HeaderDownloadActions
        labels={createLabels()}
        isVisible
        isDisabled={false}
        tooltipText={null}
        onDownloadVideo={vi.fn()}
        onDownloadDubAudio={vi.fn()}
        onDownloadBackgroundAudio={vi.fn()}
        onDownloadOriginalSubtitle={vi.fn()}
        onDownloadTranslatedSubtitle={vi.fn()}
        onDownloadBilingualSubtitle={vi.fn()}
      />
    );

    expect(html).toContain('data-download-actions="desktop"');
    expect(html).toContain('下载成片');
    expect(html).toContain('更多下载');
    expect(html).toContain('配音音频 .wav');
    expect(html).toContain('双语字幕 .srt');
  });

  it('renders a dedicated mobile download menu that includes final video and update hint', () => {
    const html = renderToStaticMarkup(
      <HeaderDownloadActions
        labels={createLabels()}
        isVisible
        isDisabled={false}
        tooltipText="正在生成最新成片，当前可下载上一版成功结果"
        onDownloadVideo={vi.fn()}
        onDownloadDubAudio={vi.fn()}
        onDownloadBackgroundAudio={vi.fn()}
        onDownloadOriginalSubtitle={vi.fn()}
        onDownloadTranslatedSubtitle={vi.fn()}
        onDownloadBilingualSubtitle={vi.fn()}
      />
    );

    expect(html).toContain('data-download-actions="mobile"');
    expect(html).toContain('>下载<');
    expect(html).toContain('下载成片');
    expect(html).toContain('data-slot="tooltip-content"');
    expect(html).toContain('正在生成最新成片，当前可下载上一版成功结果');
  });
});
