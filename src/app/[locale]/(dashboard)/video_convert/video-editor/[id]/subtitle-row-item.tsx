'use client';

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pause, Play, Scissors } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { getSubtitleRowInlineUiModel, type SubtitleRowInlineAction } from '@/shared/lib/subtitle-row-inline-ui';
import { getCompactSubtitleRowStatusModel, getSubtitleRowStatusLabelKey } from '@/shared/lib/subtitle-row-status';
import { shouldBlockTranslatedPreview, type SubtitleVoiceUiState } from '@/shared/lib/subtitle-voice-state';
import { cn } from '@/shared/lib/utils';

export interface SubtitleRowData {
  order: number;
  id: string;
  sourceId: string;

  startTime_source: string;
  endTime_source: string;
  text_source: string;
  audioUrl_source: string;
  audioUrl_source_custom?: string;

  startTime_convert: string;
  endTime_convert: string;
  text_convert: string;
  persistedText_convert?: string;
  audioUrl_convert: string;
  audioUrl_convert_custom?: string;
  voiceStatus?: string;
  needsTts?: boolean;
  splitParentId?: string;
  splitOperationId?: string;
  draftAudioPath?: string;
  newTime: string;
}

interface SubtitleRowItemProps {
  item: SubtitleRowData;
  isSelected: boolean;
  isPlayingSource: boolean;
  isDoubleClick?: boolean;
  isPlayingConvert: boolean;
  isPlayingFromVideo?: boolean;
  convertingType?: string | null;
  isSaving?: boolean;
  uiVoiceState: SubtitleVoiceUiState;
  showPreviewBlockHint?: boolean;
  autoFocusConvertedEditor?: boolean;
  onSelect: () => void;
  onUpdate: (item: SubtitleRowData) => void;
  onPlayPauseSource: () => void;
  onPlayPauseConvert: () => void;
  onBlockedPreviewAttempt?: () => void;
  onPointerToPlaceClick?: () => void;
  onConvert: (item: SubtitleRowData, type: string) => void;
  onSave: (type: string) => void;
  onStartManualEdit?: () => void;
}

function TimePill({ time, tone = 'muted' }: { time: string; tone?: 'muted' | 'active' | 'teal-active' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5',
        'font-mono text-[11px] tabular-nums',
        tone === 'active'
          ? 'border-primary/25 bg-primary/10 text-primary/90'
          : tone === 'teal-active'
            ? 'border-teal-400/25 bg-teal-400/10 text-teal-300/90'
            : 'text-muted-foreground/80 border-white/10 bg-white/[0.03]'
      )}
    >
      {time}
    </span>
  );
}

function EqualizerBars({ size = 'sm', isSplit = false }: { size?: 'sm' | 'xs'; isSplit?: boolean }) {
  const barW = size === 'xs' ? 'w-[2px]' : 'w-[2.5px]';
  const containerH = size === 'xs' ? 10 : 14;
  const barColor = isSplit ? 'bg-teal-400' : 'bg-primary';
  const barColorFaded = isSplit ? 'bg-teal-400/70' : 'bg-primary/70';

  return (
    <div className="flex items-end gap-[2px]" style={{ height: containerH }}>
      <span className={cn(barW, barColor, 'animate-[eq-bar1_0.85s_ease-in-out_infinite] rounded-[1px]')} />
      <span
        className={cn(barW, barColor, 'animate-[eq-bar2_0.85s_ease-in-out_infinite] rounded-[1px]')}
        style={{ animationDelay: '0.2s' }}
      />
      <span
        className={cn(barW, barColor, 'animate-[eq-bar3_0.85s_ease-in-out_infinite] rounded-[1px]')}
        style={{ animationDelay: '0.1s' }}
      />
      <span
        className={cn(barW, barColorFaded, 'animate-[eq-bar4_0.85s_ease-in-out_infinite] rounded-[1px]')}
        style={{ animationDelay: '0.35s' }}
      />
    </div>
  );
}

/**
 * 紧凑态右端状态图标：用单个小图标传达当前行状态
 * 配色规则：split 行统一 teal，普通行保持原有色
 */
function CompactStateIcon({ state, isSplit }: { state: SubtitleVoiceUiState; isSplit: boolean }) {
  if (state === 'processing') {
    return <Loader2 className="text-muted-foreground/60 size-3 shrink-0 animate-spin" />;
  }
  if (isSplit && (state === 'stale' || state === 'text_ready')) {
    return <Scissors className="size-3 shrink-0 text-teal-400/75" />;
  }
  if (state === 'stale') {
    return <span className="size-1.5 shrink-0 rounded-full bg-amber-400/70" />;
  }
  if (state === 'text_ready') {
    return <span className="bg-primary/70 size-1.5 shrink-0 rounded-full" />;
  }
  if (state === 'audio_ready') {
    return <Check className="size-3 shrink-0 text-emerald-400/80" />;
  }
  return null;
}

export const SubtitleRowItem = forwardRef<HTMLDivElement, SubtitleRowItemProps>(function SubtitleRowItem(
  {
    item,
    isSelected,
    isDoubleClick = false,
    isPlayingSource,
    isPlayingConvert,
    isPlayingFromVideo = false,
    convertingType = null,
    isSaving = false,
    uiVoiceState,
    showPreviewBlockHint = false,
    autoFocusConvertedEditor = false,
    onSelect,
    onUpdate,
    onPlayPauseSource,
    onPlayPauseConvert,
    onBlockedPreviewAttempt,
    onConvert,
    onSave,
    onPointerToPlaceClick,
    onStartManualEdit,
  },
  ref
) {
  const t = useTranslations('video_convert.videoEditor.subtitleRow');
  const [localItem, setLocalItem] = useState(item);
  const convertedTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isRowBusy = Boolean(convertingType) || isSaving;
  const isAudioPlaying = isPlayingSource || isPlayingConvert;
  const isTranslatedPreviewBlocked = shouldBlockTranslatedPreview(uiVoiceState);
  const isSplit = Boolean(item.splitParentId || item.splitOperationId);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  useEffect(() => {
    if (!isSelected || !autoFocusConvertedEditor) return;
    const node = convertedTextareaRef.current;
    if (!node) return;

    const frameId = requestAnimationFrame(() => {
      node.focus();
      const cursor = node.value.length;
      node.setSelectionRange(cursor, cursor);
    });

    return () => cancelAnimationFrame(frameId);
  }, [autoFocusConvertedEditor, isSelected]);

  const timeSource = useMemo(
    () => `${localItem.startTime_source} → ${localItem.endTime_source}`,
    [localItem.endTime_source, localItem.startTime_source]
  );
  const timeConvert = useMemo(
    () => `${localItem.startTime_convert} → ${localItem.endTime_convert}`,
    [localItem.endTime_convert, localItem.startTime_convert]
  );

  const stateLabel = useMemo(() => {
    const labelKey = getSubtitleRowStatusLabelKey({ isSplit, state: uiVoiceState }, { hasLabel: (key) => t.has(key) });
    return labelKey ? t(labelKey) : null;
  }, [isSplit, t, uiVoiceState]);

  const compactStatus = useMemo(
    () => getCompactSubtitleRowStatusModel({ isSplit, state: uiVoiceState }, { hasLabel: (key) => t.has(key) }),
    [isSplit, t, uiVoiceState]
  );

  const stateHint = useMemo(() => {
    switch (uiVoiceState) {
      case 'stale':
        return t('hints.stale');
      case 'text_ready':
        return t('hints.textReady');
      case 'audio_ready':
        return t('hints.audioReady');
      case 'processing':
        return t('hints.processing');
      default:
        return null;
    }
  }, [t, uiVoiceState]);

  const processingCaption = useMemo(() => {
    if (isSaving) return t('processing.applyingVoice');
    if (convertingType === 'gen_srt') return t('processing.retranslating');
    if (convertingType === 'translate_srt') return t('processing.generatingVoice');
    return t('status.processing');
  }, [convertingType, isSaving, t]);

  const workflowStepIndex = useMemo(() => {
    switch (uiVoiceState) {
      case 'stale':
        return 0;
      case 'text_ready':
        return 1;
      case 'audio_ready':
        return 2;
      case 'ready':
        return 3;
      default:
        return -1;
    }
  }, [uiVoiceState]);

  const inlineUi = useMemo(
    () =>
      getSubtitleRowInlineUiModel({
        state: uiVoiceState,
        isSelected,
        showPreviewBlockHint,
      }),
    [isSelected, showPreviewBlockHint, uiVoiceState]
  );

  // split 行统一使用 teal 色系，普通行保持原有色系
  const badgeClassName = useMemo(() => {
    if (isSplit && (uiVoiceState === 'stale' || uiVoiceState === 'text_ready')) {
      return 'border-teal-400/20 bg-teal-400/10 text-teal-300/90';
    }
    switch (inlineUi.tone) {
      case 'warm':
        return 'border-white/10 bg-background/50 text-foreground/85';
      case 'accent':
        return 'border-primary/15 bg-primary/10 text-primary/90';
      case 'success':
        return 'border-white/10 bg-background/50 text-foreground/85';
      default:
        return 'border-white/10 bg-background/50 text-muted-foreground';
    }
  }, [inlineUi.tone, isSplit, uiVoiceState]);

  const badgeDotClassName = useMemo(() => {
    if (isSplit && (uiVoiceState === 'stale' || uiVoiceState === 'text_ready')) return 'text-teal-400/80';
    switch (inlineUi.tone) {
      case 'warm':
        return 'bg-amber-300/80';
      case 'accent':
        return 'bg-primary';
      case 'success':
        return 'bg-emerald-400/75';
      default:
        return 'bg-primary/70';
    }
  }, [inlineUi.tone, isSplit, uiVoiceState]);

  const compactBadgeClassName = useMemo(() => {
    if (isSplit) {
      if (uiVoiceState === 'audio_ready') return 'border-teal-400/20 bg-teal-400/10 text-teal-300/90';
      if (uiVoiceState === 'processing') return 'border-teal-400/15 bg-teal-400/[0.08] text-teal-200/85';
      if (uiVoiceState === 'stale' || uiVoiceState === 'text_ready') {
        return 'border-teal-400/20 bg-teal-400/10 text-teal-300/90';
      }
    }
    return badgeClassName;
  }, [badgeClassName, isSplit, uiVoiceState]);

  const hintClassName = useMemo(
    () => cn('text-xs leading-5 text-muted-foreground/80', inlineUi.emphasizeHint ? 'text-foreground/90' : null),
    [inlineUi.emphasizeHint]
  );

  const handleFieldChange = (field: keyof SubtitleRowData, value: string) => {
    const updatedItem = { ...localItem, [field]: value };
    setLocalItem(updatedItem);
    onUpdate(updatedItem);
  };

  const handleManualEdit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isRowBusy) return;
    event.stopPropagation();
    onStartManualEdit?.();
  };

  const handleRetranslate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isRowBusy) return;
    event.stopPropagation();
    onConvert(localItem, 'gen_srt');
  };

  const handleGenerateVoice = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isRowBusy) return;
    event.stopPropagation();
    onConvert(localItem, 'translate_srt');
  };

  const handleSaveVoice = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isRowBusy) return;
    event.stopPropagation();
    onSave('translate_srt');
  };

  const getActionMeta = (action: SubtitleRowInlineAction) => {
    if (action.meta === 'credit_1') return t('meta.credit', { credits: 1 });
    if (action.meta === 'credit_2') return t('meta.credit', { credits: 2 });
    if (action.meta === 'free') return t('meta.free');
    return undefined;
  };

  const getActionLabel = (action: SubtitleRowInlineAction) => {
    switch (action.kind) {
      case 'retranslate':
        return isSplit ? t('actions.retranslateSplit') : t('actions.retranslate');
      case 'manual_edit':
        return isSplit ? t('actions.manualEditSplit') : t('actions.manualEdit');
      case 'generate_voice':
        return t('actions.regenVoice');
      case 'continue_editing':
        return t('actions.continueEditing');
      case 'apply_voice':
        return t('actions.applyVoice');
      default:
        return '';
    }
  };

  const getActionHandler = (action: SubtitleRowInlineAction) => {
    switch (action.kind) {
      case 'retranslate':
        return handleRetranslate;
      case 'manual_edit':
      case 'continue_editing':
        return handleManualEdit;
      case 'generate_voice':
        return handleGenerateVoice;
      case 'apply_voice':
        return handleSaveVoice;
      default:
        return handleManualEdit;
    }
  };

  // 行容器的背景/边框样式
  const rowClassName = cn(
    'group relative w-full overflow-hidden rounded-lg border transition-colors',
    // split 行有独立的 teal 边框色调
    isSplit ? 'border-teal-400/15 bg-teal-400/[0.02] hover:bg-teal-400/[0.04]' : 'border-white/10 bg-white/[0.03] hover:bg-white/5',
    isDoubleClick || isPlayingFromVideo
      ? isSplit
        ? 'border-teal-400/35 bg-teal-400/[0.06]'
        : 'border-primary/40 bg-primary/6'
      : isAudioPlaying || isSelected
        ? isSplit
          ? 'border-teal-400/20 bg-teal-400/[0.04]'
          : 'border-primary/25 bg-primary/[0.04]'
        : null,
    isSelected ? 'px-3 py-2' : 'px-2 py-1.5'
  );

  return (
    <div
      ref={ref}
      aria-busy={isRowBusy}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onPointerToPlaceClick?.();
      }}
      className={rowClassName}
    >
      {/* 左侧色条：split 行始终显示 teal，普通行仅播放时显示 primary */}
      {isSplit ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
          style={{ background: 'linear-gradient(180deg, rgb(45 212 191 / 0.7) 0%, rgb(45 212 191 / 0.2) 100%)' }}
        />
      ) : isPlayingFromVideo || isAudioPlaying ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-lg transition-opacity duration-300"
          style={{
            background: 'linear-gradient(180deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 20%, transparent) 100%)',
            opacity: isPlayingFromVideo ? 1 : 0.6,
          }}
        />
      ) : null}

      {/* ── 紧凑态（未选中）── */}
      {!isSelected && (
        <div
          className="grid w-full min-w-0 items-start gap-x-2"
          style={{ gridTemplateColumns: compactStatus.showLabel ? '20px 1fr 1fr auto' : '20px 1fr 1fr 16px' }}
        >
          {/* 序号 / 播放指示 */}
          <div aria-hidden className="flex items-start justify-center overflow-hidden pt-0.5">
            {isPlayingFromVideo ? (
              <EqualizerBars size="sm" isSplit={isSplit} />
            ) : (
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  isAudioPlaying ? (isSplit ? 'text-teal-400/80' : 'text-primary/80') : 'text-muted-foreground/40'
                )}
              >
                {(localItem.order + 1).toString().padStart(3, '0')}
              </span>
            )}
          </div>

          {/* 原文（最多 2 行） */}
          <div className="min-w-0 overflow-hidden">
            <span className="text-foreground/75 line-clamp-3 text-[13px] leading-relaxed break-words">
              {localItem.text_source || <span className="text-muted-foreground/40">{t('placeholder.original')}</span>}
            </span>
          </div>

          {/* 译文（最多 2 行，右对齐） */}
          <div className="min-w-0 overflow-hidden text-right">
            <span className="text-foreground/60 line-clamp-3 text-[13px] leading-relaxed break-words">
              {localItem.text_convert || <span className="text-muted-foreground/30">{t('placeholder.converted')}</span>}
            </span>
          </div>

          {/* 右端状态图标 */}
          <div className="flex min-w-0 items-start justify-end pt-0.5">
            {compactStatus.showLabel && compactStatus.labelKey ? (
              <span
                className={cn(
                  'inline-flex max-w-[96px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  compactBadgeClassName
                )}
              >
                <CompactStateIcon state={uiVoiceState} isSplit={isSplit} />
                <span className="truncate">{t(compactStatus.labelKey)}</span>
              </span>
            ) : (
              <CompactStateIcon state={uiVoiceState} isSplit={isSplit} />
            )}
          </div>
        </div>
      )}

      {/* ── 展开态（选中）── */}
      {isSelected && (
        <>
          {/* 序号 / 播放指示 */}
          <div aria-hidden className="pointer-events-none absolute top-3 left-2 flex items-center justify-center" style={{ width: 20 }}>
            {isPlayingFromVideo ? (
              <EqualizerBars size="sm" isSplit={isSplit} />
            ) : (
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  isAudioPlaying ? (isSplit ? 'text-teal-400/80' : 'text-primary/80') : 'text-muted-foreground/50'
                )}
              >
                {(localItem.order + 1).toString().padStart(3, '0')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4 pl-10">
            {/* 左列：原声 */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onPlayPauseSource();
                      }}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-md border',
                        'text-muted-foreground border-white/10 bg-white/[0.03]',
                        'hover:text-foreground transition-colors hover:bg-white/[0.06]',
                        isPlayingSource
                          ? isSplit
                            ? 'border-teal-400/30 bg-teal-400/10 text-teal-400'
                            : 'border-primary/30 bg-primary/10 text-primary'
                          : null
                      )}
                      aria-label={t('tooltips.playOriginal')}
                    >
                      {isPlayingSource ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('tooltips.playOriginal')}</TooltipContent>
                </Tooltip>

                <TimePill time={timeSource} tone={isPlayingFromVideo || isPlayingSource ? (isSplit ? 'teal-active' : 'active') : 'muted'} />
                {isPlayingSource && !isPlayingFromVideo ? <EqualizerBars size="xs" isSplit={isSplit} /> : null}
              </div>

              <div className="text-foreground/90 mt-1 min-w-0 text-[13px] leading-snug">
                <Textarea
                  value={localItem.text_source}
                  placeholder={t('placeholder.original')}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('text_source', event.target.value)}
                  rows={2}
                  className={cn(
                    'resize-none border-white/10 bg-black/10',
                    isSplit ? 'focus-visible:ring-teal-400/30' : 'focus-visible:ring-primary/30'
                  )}
                  onClick={(event: React.MouseEvent<HTMLTextAreaElement>) => event.stopPropagation()}
                />
              </div>
            </div>

            {/* 右列：译声 */}
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {stateLabel ? (
                    <span
                      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', badgeClassName)}
                    >
                      {uiVoiceState === 'processing' ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : isSplit && (uiVoiceState === 'stale' || uiVoiceState === 'text_ready') ? (
                        <Scissors className={cn('size-3', badgeDotClassName)} aria-hidden />
                      ) : (
                        <span className={cn('size-1.5 rounded-full', badgeDotClassName)} aria-hidden />
                      )}
                      {stateLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {isPlayingConvert && !isPlayingFromVideo ? <EqualizerBars size="xs" isSplit={isSplit} /> : null}
                  <TimePill
                    time={timeConvert}
                    tone={isPlayingFromVideo || isPlayingConvert ? (isSplit ? 'teal-active' : 'active') : 'muted'}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          if (isTranslatedPreviewBlocked) {
                            onSelect();
                            onBlockedPreviewAttempt?.();
                            return;
                          }
                          onPlayPauseConvert();
                        }}
                        className={cn(
                          'inline-flex size-7 items-center justify-center rounded-md border transition-colors',
                          isTranslatedPreviewBlocked
                            ? 'bg-background/50 text-muted-foreground hover:text-foreground border-white/10 hover:bg-white/[0.06]'
                            : 'text-muted-foreground hover:text-foreground border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                          isPlayingConvert
                            ? isSplit
                              ? 'border-teal-400/30 bg-teal-400/10 text-teal-400'
                              : 'border-primary/30 bg-primary/10 text-primary'
                            : null
                        )}
                        aria-label={isTranslatedPreviewBlocked ? t('tooltips.playConvertedBlocked') : t('tooltips.playConverted')}
                      >
                        {isPlayingConvert ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isTranslatedPreviewBlocked ? t('tooltips.playConvertedBlocked') : t('tooltips.playConverted')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="text-foreground/90 mt-1 min-w-0 text-[13px] leading-snug">
                <Textarea
                  ref={convertedTextareaRef}
                  value={localItem.text_convert}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('text_convert', event.target.value)}
                  placeholder={t('placeholder.converted')}
                  rows={2}
                  className={cn(
                    'resize-none border-white/10 bg-black/10 text-right',
                    isSplit ? 'focus-visible:ring-teal-400/30' : 'focus-visible:ring-primary/30'
                  )}
                  onClick={(event: React.MouseEvent<HTMLTextAreaElement>) => event.stopPropagation()}
                />
              </div>

              {(inlineUi.showHint || inlineUi.actions.length > 0) && (
                <div className="mt-2 space-y-2">
                  {workflowStepIndex >= 0 && workflowStepIndex < 3 ? (
                    <div className="flex items-center gap-1">
                      {[t('workflow.step1'), t('workflow.step2'), t('workflow.step3')].map((label, i) => (
                        <React.Fragment key={label}>
                          {i > 0 && <div className="h-px w-3 bg-white/10" />}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                              i < workflowStepIndex
                                ? 'text-muted-foreground/60'
                                : i === workflowStepIndex
                                  ? isSplit
                                    ? 'bg-teal-400/10 text-teal-300'
                                    : 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground/40'
                            )}
                          >
                            {i < workflowStepIndex ? (
                              <Check className="size-2.5" />
                            ) : (
                              <span className="text-[9px] tabular-nums">{i + 1}</span>
                            )}
                            {label}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : null}

                  {inlineUi.showHint && stateHint ? (
                    <div className={hintClassName}>
                      {uiVoiceState === 'processing' ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-3 animate-spin" />
                          {processingCaption}
                        </span>
                      ) : (
                        stateHint
                      )}
                    </div>
                  ) : null}

                  {inlineUi.actions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {inlineUi.actions.map((action) => (
                        <Button
                          key={action.kind}
                          type="button"
                          variant={action.emphasis === 'primary' ? 'outline' : 'ghost'}
                          size="sm"
                          disabled={isRowBusy}
                          onClick={getActionHandler(action)}
                          className={cn(
                            'h-7 rounded-md px-2.5 text-xs shadow-none',
                            action.emphasis === 'primary'
                              ? isSplit
                                ? 'border-teal-400/20 bg-teal-400/8 text-teal-300 hover:border-teal-400/30 hover:bg-teal-400/12'
                                : 'border-primary/20 bg-primary/8 text-primary hover:border-primary/25 hover:bg-primary/12'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <span>{getActionLabel(action)}</span>
                          {getActionMeta(action) ? <span className="text-[11px] text-current/65">{getActionMeta(action)}</span> : null}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

SubtitleRowItem.displayName = 'SubtitleRowItem';
