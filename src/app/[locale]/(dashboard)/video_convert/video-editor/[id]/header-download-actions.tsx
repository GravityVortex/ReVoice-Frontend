'use client';

import React from 'react';
import { ChevronDown, Download } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

export type HeaderDownloadLabels = {
  downloadFinalVideo: string;
  moreDownloads: string;
  mobileDownload: string;
  downloadDubAudio: string;
  downloadBackgroundAudio: string;
  downloadOriginalSubtitle: string;
  downloadTranslatedSubtitle: string;
  downloadBilingualSubtitle: string;
  downloadUpdatingHint: string;
};

export type HeaderDownloadStateInput = {
  taskStatus: string;
  serverLastMergedAtMs: number;
  isTaskRunning: boolean;
  isMergeJobActive: boolean;
};

export type HeaderDownloadState = {
  isVisible: boolean;
  isDisabled: boolean;
  tooltipKey: keyof Pick<HeaderDownloadLabels, 'downloadUpdatingHint'> | null;
};

type HeaderDownloadActionsProps = {
  labels: HeaderDownloadLabels;
  isVisible: boolean;
  isDisabled: boolean;
  tooltipText: string | null;
  onDownloadVideo: () => void;
  onDownloadDubAudio: () => void;
  onDownloadBackgroundAudio: () => void;
  onDownloadOriginalSubtitle: () => void;
  onDownloadTranslatedSubtitle: () => void;
  onDownloadBilingualSubtitle: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

export function getHeaderDownloadState(input: HeaderDownloadStateInput): HeaderDownloadState {
  const hasSuccessfulOutput = input.taskStatus === 'completed' || input.serverLastMergedAtMs > 0;
  const isBusy = input.isTaskRunning || input.isMergeJobActive;

  if (!hasSuccessfulOutput) {
    return {
      isVisible: false,
      isDisabled: true,
      tooltipKey: null,
    };
  }

  return {
    isVisible: true,
    isDisabled: isBusy || !hasSuccessfulOutput,
    tooltipKey: isBusy ? 'downloadUpdatingHint' : null,
  };
}

export function HeaderDownloadActions(props: HeaderDownloadActionsProps) {
  const {
    labels,
    isVisible,
    isDisabled,
    tooltipText,
    onDownloadVideo,
    onDownloadDubAudio,
    onDownloadBackgroundAudio,
    onDownloadOriginalSubtitle,
    onDownloadTranslatedSubtitle,
    onDownloadBilingualSubtitle,
  } = props;

  if (!isVisible) return null;

  const desktopMenuItems: MenuItem[] = [
    { id: 'dub-audio', label: labels.downloadDubAudio, onSelect: onDownloadDubAudio },
    { id: 'background-audio', label: labels.downloadBackgroundAudio, onSelect: onDownloadBackgroundAudio },
    { id: 'original-subtitle', label: labels.downloadOriginalSubtitle, onSelect: onDownloadOriginalSubtitle },
    { id: 'translated-subtitle', label: labels.downloadTranslatedSubtitle, onSelect: onDownloadTranslatedSubtitle },
    { id: 'bilingual-subtitle', label: labels.downloadBilingualSubtitle, onSelect: onDownloadBilingualSubtitle },
  ];

  const mobileMenuItems: MenuItem[] = [
    { id: 'final-video', label: labels.downloadFinalVideo, onSelect: onDownloadVideo },
    ...desktopMenuItems,
  ];

  const actions = (
    <div className="flex shrink-0 items-center gap-2">
      <div data-download-actions="desktop" className="hidden items-center gap-2 sm:flex">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={actionButtonClassName(false)}
          aria-label={labels.downloadFinalVideo}
          disabled={isDisabled}
          onClick={onDownloadVideo}
        >
          <Download className="size-4" />
          <span>{labels.downloadFinalVideo}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={actionButtonClassName(false)}
              aria-label={labels.moreDownloads}
              disabled={isDisabled}
            >
              <span>{labels.moreDownloads}</span>
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover/95 w-56 border-white/10 backdrop-blur-xl">
            {desktopMenuItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <DropdownMenuItem disabled={isDisabled} onClick={item.onSelect} className="cursor-pointer justify-between gap-4">
                  <span>{item.label}</span>
                </DropdownMenuItem>
                {index === 1 ? <DropdownMenuSeparator className="bg-white/10" /> : null}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div data-download-actions="mobile" className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={actionButtonClassName(true)}
              aria-label={labels.mobileDownload}
              disabled={isDisabled}
            >
              <Download className="size-4" />
              <span>{labels.mobileDownload}</span>
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover/95 w-56 border-white/10 backdrop-blur-xl">
            {mobileMenuItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <DropdownMenuItem disabled={isDisabled} onClick={item.onSelect} className="cursor-pointer justify-between gap-4">
                  <span>{item.label}</span>
                </DropdownMenuItem>
                {index === 0 ? <DropdownMenuSeparator className="bg-white/10" /> : null}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  if (!tooltipText) {
    return actions;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{actions}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

function actionButtonClassName(isMobile: boolean) {
  return cn(
    'h-9 rounded-full border-white/10 bg-white/[0.03] text-foreground/90 shadow-none backdrop-blur-sm transition-all hover:bg-white/[0.06]',
    'focus-visible:ring-ring/60 focus-visible:ring-2',
    isMobile ? 'gap-1.5 px-3' : 'gap-2 px-3'
  );
}
