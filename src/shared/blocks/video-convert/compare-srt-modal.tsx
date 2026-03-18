'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Download, Pause, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useAppContext } from '@/shared/contexts/app';
import { cn } from '@/shared/lib/utils';

interface CompareSrtModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  onDownBtnsClick?: (e: any, stepName: string) => void;
}

interface SubtitleItem {
  id: string;
  start: string;
  end: string;
  gen_txt: string;
  tra_txt: string;
}

function formatTimeLen(value: string) {
  const str = (value || '').trim();
  if (!str) return '';
  // for example: 00:00:08,439
  const main = str.length > 9 ? str.split(',')[0] : str;

  // Compact display: for most short videos, MM:SS is more readable than 00:MM:SS.
  // Keep hours when it's not "00".
  if (/^\d{2}:\d{2}:\d{2}$/.test(main) && main.startsWith('00:')) {
    return main.slice(3);
  }

  return main;
}

function formatTimeRange(item: SubtitleItem) {
  const start = formatTimeLen(item.start);
  const end = formatTimeLen(item.end);
  if (start && end) return `${start} - ${end}`;
  return start || end || '-';
}

export function CompareSrtModal({ isOpen, onClose, taskId, onDownBtnsClick }: CompareSrtModalProps) {
  const t = useTranslations('video_convert.projectDetail');
  const { user } = useAppContext();

  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<{
    id: string;
    type: 'gen' | 'tra';
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onDownBtnsClickRef = useRef(onDownBtnsClick);

  const [preUrl, setPreUrl] = useState<string>();
  const [env, setEnv] = useState<string>();

  useEffect(() => {
    onDownBtnsClickRef.current = onDownBtnsClick;
  }, [onDownBtnsClick]);

  useEffect(() => {
    if (!isOpen || !taskId) return;
    void fetchSubtitles();
  }, [isOpen, taskId]);

  useEffect(() => {
    if (isOpen) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingAudio(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const fetchSubtitles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/video-task/getCompareSrtList?taskId=${taskId}`);
      const result = await response.json();
      if (result?.code === 0) {
        setSubtitles(result?.data?.list || []);
        setPreUrl(result?.data?.preUrl);
        setEnv(result?.data?.env);
      } else {
        setSubtitles([]);
        toast.error(result?.message || t('ui.progressLoadFailed'));
      }
    } catch (error) {
      console.error('[CompareSrtModal] Failed to fetch subtitles:', error);
      setSubtitles([]);
      toast.error(t('ui.progressLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = (id: string, type: 'gen' | 'tra') => {
    const userId = user?.id || '';
    if (!userId || !preUrl || !env || !taskId) {
      toast.error(t('ui.compareModal.toast.audioUnavailable'));
      return;
    }

    const folder = type === 'gen' ? 'split_audio/audio' : 'adj_audio_time';
    const audioUrl = `${preUrl}/${env}/${userId}/${taskId}/${folder}/${id}.wav`;

    if (playingAudio?.id === id && playingAudio?.type === type) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }

    audioRef.current?.pause();

    const audio = new Audio(audioUrl);
    audio.onended = () => setPlayingAudio(null);
    audio
      .play()
      .then(() => {
        audioRef.current = audio;
        setPlayingAudio({ id, type });
      })
      .catch((e) => {
        console.warn('[CompareSrtModal] Audio play failed:', e);
        setPlayingAudio(null);
        toast.error(t('ui.compareModal.toast.audioUnavailable'));
      });
  };

  const handleCopy = async (value: string) => {
    const text = (value || '').trim();
    if (!text) {
      toast.error(t('ui.compareModal.toast.empty'));
      return;
    }

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('clipboard not available');
      }
      await navigator.clipboard.writeText(text);
      toast.success(t('ui.compareModal.toast.copied'));
    } catch (e) {
      console.warn('[CompareSrtModal] Copy failed:', e);
      toast.error(t('ui.compareModal.toast.copyFailed'));
    }
  };

  const canDownload = !loading && subtitles.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'bg-background flex h-[100dvh] h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none',
          'top-0 left-0',
          'sm:bg-background/95 overflow-hidden sm:top-[50%] sm:left-[50%] sm:h-[92dvh] sm:h-[92vh] sm:max-h-[92dvh] sm:max-h-[92vh] sm:w-[calc(100vw-1.5rem)] sm:max-w-6xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border sm:shadow-2xl sm:backdrop-blur-xl'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Top bar: fixed actions + close (best practice for long, scrollable dialogs). */}
          <div className="bg-background/70 shrink-0 border-b px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <DialogHeader className="min-w-0 flex-1 gap-1 text-left">
                <DialogTitle className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {t('ui.compareModal.title')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  {t('ui.compareModal.description', {
                    count: subtitles.length || 0,
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!canDownload} className="gap-1.5" aria-label={t('buttons.download')}>
                      <Download className="size-4" />
                      <span className="hidden sm:inline">{t('buttons.download')}</span>
                      <ChevronDown className="size-4 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        onDownBtnsClickRef.current?.(e, 'gen_srt');
                      }}
                    >
                      <Download className="size-4" />
                      {t('subtitle.download_yuan')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        onDownBtnsClickRef.current?.(e, 'translate_srt');
                      }}
                    >
                      <Download className="size-4" />
                      {t('subtitle.download_tran')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        onDownBtnsClickRef.current?.(e, 'double_srt');
                      }}
                    >
                      <Download className="size-4" />
                      {t('subtitle.download_double')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose} aria-label={t('buttons.cancel')}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              {loading ? (
                <div className="space-y-3 p-4 sm:p-6">
                  <div className="bg-card/40 rounded-xl border p-3">
                    <div className="hidden md:grid md:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-4 w-28 rounded-full" />
                      <Skeleton className="h-4 w-28 rounded-full" />
                    </div>
                    <div className="divide-y">
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <div key={idx} className="py-3">
                          <div className="md:grid md:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-10 rounded-full" />
                              <Skeleton className="h-4 w-16 rounded-full" />
                            </div>

                            <div className="mt-3 space-y-2 md:mt-0">
                              <Skeleton className="h-3 w-20 rounded-full md:hidden" />
                              <Skeleton className="h-4 w-full rounded-md" />
                              <Skeleton className="h-4 w-4/5 rounded-md" />
                            </div>

                            <div className="mt-3 space-y-2 md:mt-0">
                              <Skeleton className="h-3 w-20 rounded-full md:hidden" />
                              <Skeleton className="h-4 w-full rounded-md" />
                              <Skeleton className="h-4 w-3/4 rounded-md" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : subtitles.length === 0 ? (
                <div className="p-4 sm:p-6">
                  <div className="bg-card/40 rounded-xl border p-10 text-center">
                    <div className="text-foreground text-sm font-semibold">{t('ui.compareModal.empty.title')}</div>
                    <div className="text-muted-foreground mt-2 text-xs">{t('ui.compareModal.empty.description')}</div>
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-6">
                  <div className="bg-card/40 rounded-xl border">
                    {/* Sticky header (desktop). */}
                    <div className="bg-background/70 sticky top-0 z-10 hidden border-b backdrop-blur md:block">
                      <div className="text-muted-foreground grid grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-3 py-2 text-[11px] font-semibold tracking-widest uppercase">
                        <div />
                        <div className="flex items-center gap-2">
                          <span aria-hidden className="bg-muted-foreground/30 h-2 w-2 rounded-full" />
                          {t('ui.compareModal.columns.original')}
                        </div>
                        <div className="flex items-center gap-2">
                          <span aria-hidden className="bg-primary/40 h-2 w-2 rounded-full" />
                          {t('ui.compareModal.columns.translated')}
                        </div>
                      </div>
                    </div>

                    <div className="divide-y">
                      {subtitles.map((item, index) => {
                        const original = item?.gen_txt || '';
                        const translated = item?.tra_txt || '';
                        const isPlayingGen = playingAudio?.id === item.id && playingAudio?.type === 'gen';
                        const isPlayingTra = playingAudio?.id === item.id && playingAudio?.type === 'tra';
                        const timeRange = formatTimeRange(item);

                        return (
                          <div
                            key={item.id || String(index)}
                            className={cn(
                              'group hover:bg-muted/20 focus-within:bg-muted/20 px-3 py-3 transition-colors md:py-4',
                              (isPlayingGen || isPlayingTra) && 'bg-muted/10'
                            )}
                          >
                            <div className="md:grid md:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                              {/* Meta + mobile actions */}
                              <div className="flex items-start justify-between gap-3 md:block">
                                <div className="flex min-w-0 items-center gap-2 pt-0.5">
                                  <span className="text-muted-foreground font-mono text-[11px]">#{index + 1}</span>
                                  <span className="bg-muted/40 text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[11px]">
                                    {timeRange}
                                  </span>
                                </div>
                              </div>

                              {/* Original */}
                              <div className="mt-3 md:mt-0">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase md:hidden">
                                    <span aria-hidden className="bg-muted-foreground/30 h-2 w-2 rounded-full" />
                                    {t('ui.compareModal.columns.original')}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className={cn(
                                        'rounded-full opacity-80 transition-opacity hover:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
                                        isPlayingGen && 'opacity-100'
                                      )}
                                      onClick={() => handlePlayAudio(item.id, 'gen')}
                                      aria-label={t('ui.compareModal.actions.playOriginal')}
                                    >
                                      {isPlayingGen ? <Pause className="size-4" /> : <Play className="size-4" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="rounded-full opacity-80 transition-opacity hover:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                                      onClick={() => void handleCopy(original)}
                                      aria-label={t('ui.compareModal.actions.copyOriginal')}
                                    >
                                      <Copy className="size-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{original || '-'}</div>
                              </div>

                              {/* Translated */}
                              <div className="mt-3 md:mt-0">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase md:hidden">
                                    <span aria-hidden className="bg-primary/40 h-2 w-2 rounded-full" />
                                    {t('ui.compareModal.columns.translated')}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className={cn(
                                        'rounded-full opacity-80 transition-opacity hover:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
                                        isPlayingTra && 'opacity-100'
                                      )}
                                      onClick={() => handlePlayAudio(item.id, 'tra')}
                                      aria-label={t('ui.compareModal.actions.playTranslated')}
                                    >
                                      {isPlayingTra ? <Pause className="size-4" /> : <Play className="size-4" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="rounded-full opacity-80 transition-opacity hover:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                                      onClick={() => void handleCopy(translated)}
                                      aria-label={t('ui.compareModal.actions.copyTranslated')}
                                    >
                                      <Copy className="size-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{translated || '-'}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
