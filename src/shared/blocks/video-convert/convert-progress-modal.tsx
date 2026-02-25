'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { getLanguageConvertStr } from '@/shared/lib/utils';
import { TaskStatusStepper } from '@/shared/blocks/video-convert/task-status-stepper';

interface TaskItem {
  id: string;
  status: string;
  progress?: number | null;
  currentStep?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  speakerCount: string;
  errorMessage: string | null;
}

interface ConversionProgressModalProps {
  isOpen: boolean;
  activeTabIdx: string;
  onClose: () => void;
  onStatusUpdateEvent?: (taskItem: any) => void;
  taskMainId: string;
}

function isRunningStatus(status: string | undefined) {
  return status === 'pending' || status === 'processing';
}

export function ConversionProgressModal({
  isOpen,
  activeTabIdx: _activeTabIdx,
  onClose,
  taskMainId,
  onStatusUpdateEvent,
}: ConversionProgressModalProps) {
  const params = useParams();
  const locale = (params.locale as string) || 'zh';
  const t = useTranslations('video_convert.projectDetail');

  const [taskMainInfo, setTaskMainInfo] = useState<TaskItem | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = useCallback(() => {
    if (!pollingTimerRef.current) return;
    clearInterval(pollingTimerRef.current);
    pollingTimerRef.current = null;
  }, []);

  const fetchTask = useCallback(async () => {
    if (!taskMainId) return;
    try {
      const response = await fetch(`/api/video-task/getTaskProgress?taskId=${taskMainId}`);
      const result = await response.json();
      const item = result?.data?.taskItem as TaskItem | undefined;
      if (result?.code === 0 && item?.id) {
        setTaskMainInfo(item);
        onStatusUpdateEvent?.(item);
        if (!isRunningStatus(item.status)) clearPolling();
      }
    } catch (e) {
      // Silent by default; this is a polling-only UI.
      console.warn('[ConversionProgressModal] Failed to fetch progress:', e);
    }
  }, [clearPolling, onStatusUpdateEvent, taskMainId]);

  useEffect(() => {
    clearPolling();
    setTaskMainInfo(null);

    if (!isOpen || !taskMainId) return;

    void fetchTask();
    pollingTimerRef.current = setInterval(() => {
      void fetchTask();
    }, 10000);

    return clearPolling;
  }, [clearPolling, fetchTask, isOpen, taskMainId]);

  const stepperCopy = useMemo(
    () => ({
      pending: { label: t('status.pending'), hint: t('ui.statusHint.pending') },
      processing: { label: t('status.processing'), hint: t('ui.statusHint.processing') },
      completed: { label: t('status.completed'), hint: t('ui.statusHint.completed') },
      failed: { label: t('status.failed'), hint: t('ui.statusHint.failed') },
      cancelled: { label: t('status.cancelled'), hint: t('ui.statusHint.failed') },
    }),
    [t]
  );

  const titleSuffix = useMemo(() => {
    if (!taskMainInfo) return '';
    const s = getLanguageConvertStr(taskMainInfo, locale);
    return s ? ` · ${s}` : '';
  }, [locale, taskMainInfo]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t('progressModal.title')}
            {titleSuffix}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('progressModal.title')}</DialogDescription>
        </DialogHeader>

        {!taskMainInfo ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{t('progressModal.loadingData')}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <TaskStatusStepper
              status={taskMainInfo.status}
              progress={taskMainInfo.progress}
              currentStep={taskMainInfo.currentStep}
              copy={stepperCopy}
              showPercent
            />

            {taskMainInfo.status === 'failed' && taskMainInfo.errorMessage ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {taskMainInfo.errorMessage}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
