'use client';

import { ArrowLeft, CheckCircle2, Info, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';

import { ErrorBlock } from '@/shared/blocks/common/error-state';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import type { ConvertObj } from '@/shared/components/video-editor/types';
import { cn, getLanguageConvertStr } from '@/shared/lib/utils';

import { HeaderDownloadActions, type HeaderDownloadLabels, type HeaderDownloadState } from './header-download-actions';
import type { VideoMergePrimaryActionMode } from './video-merge-state';

type TranslateFn = (key: string) => string;

type VideoEditorHeaderProps = {
  locale: string;
  t: TranslateFn;
  convertObj: ConvertObj | null;
  videoSourceFileName?: string | null;
  statusMeta: {
    label: string;
    cls: string;
    icon: 'dot' | 'spin' | 'check' | 'x';
  };
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
  mergePrimaryAction: {
    mode: VideoMergePrimaryActionMode;
    disabled: boolean;
  };
  showHeaderBusySpinner: boolean;
  headerDownloadLabels: HeaderDownloadLabels;
  headerDownloadState: HeaderDownloadState;
  headerDownloadTooltipText: string | null;
  headerProgressVisual: number;
  headerProgressFillCls: string;
  hasUnsavedChanges: boolean;
  onBackClick: () => void;
  onRetryMergeStatus: () => void;
  onGenerateVideo: () => void;
  onDownloadVideo: () => void;
  onDownloadAudio: (kind: 'subtitle' | 'background') => void;
  onDownloadSrt: (kind: 'gen_srt' | 'translate_srt' | 'double_srt') => void;
};

export function VideoEditorHeader(props: VideoEditorHeaderProps) {
  return (
    <div className="bg-card/40 relative flex items-start justify-between gap-4 border-b border-white/10 px-4 py-2.5 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 rounded-full"
              onClick={props.onBackClick}
              aria-label={props.t('header.backToProject')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{props.t('header.backToProject')}</TooltipContent>
        </Tooltip>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-base font-semibold">
              {props.videoSourceFileName || props.t('breadcrumb.videoEditor')}
            </h1>

            {props.convertObj ? (
              <Badge className="border-primary/20 bg-primary/10 text-primary gap-1 border">
                <Sparkles className="h-3 w-3" />
                {getLanguageConvertStr(props.convertObj, props.locale)}
              </Badge>
            ) : null}

            {props.convertObj ? (
              <Badge
                variant="outline"
                className={cn('text-muted-foreground gap-2 border-white/10 bg-white/[0.03]', props.statusMeta.cls)}
                title={`${props.statusMeta.label} · ${props.progressPercent}%`}
              >
                {props.statusMeta.icon === 'spin' ? (
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : props.statusMeta.icon === 'check' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : props.statusMeta.icon === 'x' ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-30 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-current opacity-70" />
                  </span>
                )}
                <span className="text-xs">{props.statusMeta.label}</span>
                <span className="text-foreground/80 font-mono text-xs tabular-nums">{props.progressPercent}%</span>
              </Badge>
            ) : null}

            <Badge variant="outline" className="text-muted-foreground border-white/10 bg-white/[0.03]">
              {Math.round(props.totalDuration)}s
            </Badge>
          </div>

          {props.pendingMergeCount > 0 ? (
            <div className="text-primary/90 mt-1 text-xs">
              {props.locale === 'zh'
                ? `待应用：${props.pendingMergeVoiceCount} 段配音 · ${props.pendingMergeTimingCount} 段时间`
                : `Pending: ${props.pendingMergeVoiceCount} voice · ${props.pendingMergeTimingCount} timing`}
            </div>
          ) : null}

          {props.taskStatus === 'failed' && props.taskErrorMessage ? (
            <ErrorBlock message={props.taskErrorMessage} className="mt-2" />
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label={props.locale === 'zh' ? '积分说明' : 'Credits info'}
            >
              <Info className="text-muted-foreground h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-3">
              <div className="text-sm font-semibold">{props.locale === 'zh' ? '积分消耗说明' : 'Credit usage'}</div>

              <div className="space-y-2 text-sm">
                <div className="bg-muted/10 flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                  <span className="text-muted-foreground">{props.locale === 'zh' ? '重翻译字幕' : 'Retranslate subtitle'}</span>
                  <span className="text-primary font-mono">1</span>
                </div>
                <div className="bg-muted/10 flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                  <span className="text-muted-foreground">{props.locale === 'zh' ? '更新字幕语音' : 'Regenerate voice'}</span>
                  <span className="text-primary font-mono">2</span>
                </div>
              </div>

              <div className="text-muted-foreground text-xs leading-relaxed">
                {props.locale === 'zh'
                  ? '小提示：我们会在积分不足时提醒你；生成失败会自动退回积分。'
                  : 'Tip: We’ll prompt you when credits are insufficient. Credits are refunded automatically if generation fails.'}
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="text-muted-foreground/90 mb-2 text-xs font-medium">{props.locale === 'zh' ? '快捷操作' : 'Quick tips'}</div>
                <ul className="text-muted-foreground space-y-1.5 text-xs">
                  <li className="flex items-center gap-2">
                    <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">
                      Space
                    </kbd>
                    <span>{props.locale === 'zh' ? '播放 / 暂停' : 'Play / Pause'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">
                      ⌘Z
                    </kbd>
                    <span>{props.locale === 'zh' ? '撤销操作' : 'Undo'}</span>
                  </li>
                  <li>{props.locale === 'zh' ? '双击字幕行可定位到对应时间' : 'Double-click a subtitle row to seek'}</li>
                </ul>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="sm"
                className={cn(
                  'gap-2 transition-all',
                  props.mergePrimaryAction.disabled && 'bg-primary/20 text-primary-foreground pointer-events-none'
                )}
                onClick={props.mergePrimaryAction.mode === 'retry-status' ? props.onRetryMergeStatus : props.onGenerateVideo}
                disabled={props.mergePrimaryAction.disabled}
              >
                {props.mergePrimaryAction.mode === 'retry-status' ? (
                  <RefreshCw className="h-4 w-4" />
                ) : props.showHeaderBusySpinner ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : null}
                {props.isMergeJobActive ? (
                  <span>
                    {props.mergeStatusRequiresManualRetry
                      ? props.locale === 'zh'
                        ? '状态待重试'
                        : 'Status retry needed'
                      : props.locale === 'zh'
                        ? '视频合成中...'
                        : 'Merging video...'}
                  </span>
                ) : props.isTaskRunning ? (
                  <span>
                    {props.taskStatus === 'pending'
                      ? props.locale === 'zh'
                        ? '排队中...'
                        : 'Queued...'
                      : props.locale === 'zh'
                        ? `生成中 ${props.taskProgress ?? 0}%`
                        : `Generating ${props.taskProgress ?? 0}%`}
                  </span>
                ) : (
                  props.t('audioList.saveTooltip')
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {props.isMergeJobActive
              ? props.mergeStatusRequiresManualRetry
                ? props.t('header.mergeStatusRetryTooltip')
                : props.t('header.mergingVideo')
              : !props.hasUnsavedChanges
                ? props.t('header.noChanges')
                : props.t('header.regenerateTooltip')}
          </TooltipContent>
        </Tooltip>

        <HeaderDownloadActions
          labels={props.headerDownloadLabels}
          isVisible={props.headerDownloadState.isVisible}
          isDisabled={props.headerDownloadState.isDisabled}
          tooltipText={props.headerDownloadTooltipText}
          onDownloadVideo={props.onDownloadVideo}
          onDownloadDubAudio={() => props.onDownloadAudio('subtitle')}
          onDownloadBackgroundAudio={() => props.onDownloadAudio('background')}
          onDownloadOriginalSubtitle={() => props.onDownloadSrt('gen_srt')}
          onDownloadTranslatedSubtitle={() => props.onDownloadSrt('translate_srt')}
          onDownloadBilingualSubtitle={() => props.onDownloadSrt('double_srt')}
        />
      </div>

      {props.convertObj ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
          <div className="h-full" style={{ width: `${props.headerProgressVisual}%` }}>
            <div className={cn('relative h-full w-full', props.headerProgressFillCls)}>
              {props.isTaskRunning || props.isMergeJobActive ? (
                <div
                  aria-hidden
                  className={cn(
                    'absolute inset-0 opacity-45',
                    '[background:linear-gradient(90deg,transparent,oklch(1_0_0_/_0.55),transparent)]',
                    '[background-size:220%_100%]',
                    'animate-shimmer motion-reduce:animate-none'
                  )}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
