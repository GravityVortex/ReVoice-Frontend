'use client';

import { ArrowLeft, CheckCircle2, Info, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';

import { ErrorBlock } from '@/shared/blocks/common/error-state';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn, getLanguageConvertStr } from '@/shared/lib/utils';

import { HeaderDownloadActions } from './header-download-actions';
import type { VideoEditorHeaderSession } from './video-editor-header-session';

type VideoEditorHeaderProps = {
  headerSession: VideoEditorHeaderSession;
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
              onClick={props.headerSession.actions.onBackClick}
              aria-label={props.headerSession.t('header.backToProject')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{props.headerSession.t('header.backToProject')}</TooltipContent>
        </Tooltip>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-base font-semibold">
              {props.headerSession.view.videoSourceFileName || props.headerSession.t('breadcrumb.videoEditor')}
            </h1>

            {props.headerSession.view.convertObj ? (
              <Badge className="border-primary/20 bg-primary/10 text-primary gap-1 border">
                <Sparkles className="h-3 w-3" />
                {getLanguageConvertStr(props.headerSession.view.convertObj, props.headerSession.locale)}
              </Badge>
            ) : null}

            {props.headerSession.view.convertObj ? (
              <Badge
                variant="outline"
                className={cn(
                  'text-muted-foreground gap-2 border-white/10 bg-white/[0.03]',
                  props.headerSession.view.statusMeta.cls
                )}
                title={`${props.headerSession.view.statusMeta.label} · ${props.headerSession.view.progressPercent}%`}
              >
                {props.headerSession.view.statusMeta.icon === 'spin' ? (
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : props.headerSession.view.statusMeta.icon === 'check' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : props.headerSession.view.statusMeta.icon === 'x' ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-30 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-current opacity-70" />
                  </span>
                )}
                <span className="text-xs">{props.headerSession.view.statusMeta.label}</span>
                <span className="text-foreground/80 font-mono text-xs tabular-nums">{props.headerSession.view.progressPercent}%</span>
              </Badge>
            ) : null}

            <Badge variant="outline" className="text-muted-foreground border-white/10 bg-white/[0.03]">
              {Math.round(props.headerSession.view.totalDuration)}s
            </Badge>
          </div>

          {props.headerSession.view.pendingMergeCount > 0 ? (
            <div className="text-primary/90 mt-1 text-xs">
              {props.headerSession.locale === 'zh'
                ? `待应用：${props.headerSession.view.pendingMergeVoiceCount} 段配音 · ${props.headerSession.view.pendingMergeTimingCount} 段时间`
                : `Pending: ${props.headerSession.view.pendingMergeVoiceCount} voice · ${props.headerSession.view.pendingMergeTimingCount} timing`}
            </div>
          ) : null}

          {props.headerSession.view.taskStatus === 'failed' && props.headerSession.view.taskErrorMessage ? (
            <ErrorBlock message={props.headerSession.view.taskErrorMessage} className="mt-2" />
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
              aria-label={props.headerSession.locale === 'zh' ? '积分说明' : 'Credits info'}
            >
              <Info className="text-muted-foreground h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-3">
              <div className="text-sm font-semibold">{props.headerSession.locale === 'zh' ? '积分消耗说明' : 'Credit usage'}</div>

              <div className="space-y-2 text-sm">
                <div className="bg-muted/10 flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                  <span className="text-muted-foreground">
                    {props.headerSession.locale === 'zh' ? '重翻译字幕' : 'Retranslate subtitle'}
                  </span>
                  <span className="text-primary font-mono">1</span>
                </div>
                <div className="bg-muted/10 flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                  <span className="text-muted-foreground">
                    {props.headerSession.locale === 'zh' ? '更新字幕语音' : 'Regenerate voice'}
                  </span>
                  <span className="text-primary font-mono">2</span>
                </div>
              </div>

              <div className="text-muted-foreground text-xs leading-relaxed">
                {props.headerSession.locale === 'zh'
                  ? '小提示：我们会在积分不足时提醒你；生成失败会自动退回积分。'
                  : 'Tip: We’ll prompt you when credits are insufficient. Credits are refunded automatically if generation fails.'}
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="text-muted-foreground/90 mb-2 text-xs font-medium">
                  {props.headerSession.locale === 'zh' ? '快捷操作' : 'Quick tips'}
                </div>
                <ul className="text-muted-foreground space-y-1.5 text-xs">
                  <li className="flex items-center gap-2">
                    <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">
                      Space
                    </kbd>
                    <span>{props.headerSession.locale === 'zh' ? '播放 / 暂停' : 'Play / Pause'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">
                      ⌘Z
                    </kbd>
                    <span>{props.headerSession.locale === 'zh' ? '撤销操作' : 'Undo'}</span>
                  </li>
                  <li>{props.headerSession.locale === 'zh' ? '双击字幕行可定位到对应时间' : 'Double-click a subtitle row to seek'}</li>
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
                  props.headerSession.view.headerCapabilities.mergePrimaryAction.disabled && 'bg-primary/20 text-primary-foreground pointer-events-none'
                )}
                onClick={props.headerSession.view.headerCapabilities.mergePrimaryAction.mode === 'retry-status' ? props.headerSession.actions.onRetryMergeStatus : props.headerSession.actions.onGenerateVideo}
                disabled={props.headerSession.view.headerCapabilities.mergePrimaryAction.disabled}
              >
                {props.headerSession.view.headerCapabilities.mergePrimaryAction.mode === 'retry-status' ? (
                  <RefreshCw className="h-4 w-4" />
                ) : props.headerSession.view.headerCapabilities.showBusySpinner ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : null}
                {props.headerSession.view.isMergeJobActive ? (
                  <span>
                    {props.headerSession.view.mergeStatusRequiresManualRetry
                      ? props.headerSession.locale === 'zh'
                        ? '状态待重试'
                        : 'Status retry needed'
                      : props.headerSession.locale === 'zh'
                        ? '视频合成中...'
                        : 'Merging video...'}
                  </span>
                ) : props.headerSession.view.isTaskRunning ? (
                  <span>
                    {props.headerSession.view.taskStatus === 'pending'
                      ? props.headerSession.locale === 'zh'
                        ? '排队中...'
                        : 'Queued...'
                      : props.headerSession.locale === 'zh'
                        ? `生成中 ${props.headerSession.view.taskProgress ?? 0}%`
                        : `Generating ${props.headerSession.view.taskProgress ?? 0}%`}
                  </span>
                ) : (
                  props.headerSession.t('audioList.saveTooltip')
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {props.headerSession.view.isMergeJobActive
              ? props.headerSession.view.mergeStatusRequiresManualRetry
                ? props.headerSession.t('header.mergeStatusRetryTooltip')
                : props.headerSession.t('header.mergingVideo')
              : !props.headerSession.view.hasUnsavedChanges
                ? props.headerSession.t('header.noChanges')
                : props.headerSession.t('header.regenerateTooltip')}
          </TooltipContent>
        </Tooltip>

        <HeaderDownloadActions
          labels={props.headerSession.view.headerDownloadLabels}
          isVisible={props.headerSession.view.headerCapabilities.download.state.isVisible}
          isDisabled={props.headerSession.view.headerCapabilities.download.state.isDisabled}
          tooltipText={props.headerSession.view.headerCapabilities.download.tooltipText}
          onDownloadVideo={props.headerSession.actions.onDownloadVideo}
          onDownloadDubAudio={() => props.headerSession.actions.onDownloadAudio('subtitle')}
          onDownloadBackgroundAudio={() => props.headerSession.actions.onDownloadAudio('background')}
          onDownloadOriginalSubtitle={() => props.headerSession.actions.onDownloadSrt('gen_srt')}
          onDownloadTranslatedSubtitle={() => props.headerSession.actions.onDownloadSrt('translate_srt')}
          onDownloadBilingualSubtitle={() => props.headerSession.actions.onDownloadSrt('double_srt')}
        />
      </div>

      {props.headerSession.view.convertObj ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
          <div className="h-full" style={{ width: `${props.headerSession.view.headerProgressVisual}%` }}>
            <div className={cn('relative h-full w-full', props.headerSession.view.headerProgressFillCls)}>
              {props.headerSession.view.isTaskRunning || props.headerSession.view.isMergeJobActive ? (
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
