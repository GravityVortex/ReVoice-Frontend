import { getTranslations } from 'next-intl/server';

import { redirect } from '@/core/i18n/navigation';
import { AITaskStatus } from '@/extensions/ai';
import { Empty } from '@/shared/blocks/common';
import { findAITaskById, updateAITaskById } from '@/shared/models/ai_task';
import { getSignUser } from '@/shared/models/user';
import { getAIService } from '@/shared/services/ai';

export default async function RefreshAITaskPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations('activity.ai-tasks');

  const user = await getSignUser();
  if (!user) {
    redirect({
      href: `/sign-in?callbackUrl=${encodeURIComponent(
        `/activity/ai-tasks/${id}/refresh`
      )}`,
      locale,
    });
    return null;
  }

  const task = await findAITaskById(id);
  if (!task || !task.taskId || !task.provider || !task.status) {
    return <Empty message="Task not found" />;
  }
  if (task.userId !== user.id) {
    // Don't leak whether the task exists to other users.
    return <Empty message="Task not found" />;
  }

  // query task
  if (
    [AITaskStatus.PENDING, AITaskStatus.PROCESSING].includes(
      task.status as AITaskStatus
    )
  ) {
    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(task.provider);
    if (!aiProvider) {
      return <Empty message="Invalid AI provider" />;
    }

    const result = await aiProvider?.query?.({
      taskId: task.taskId,
    });

    if (result && result.taskStatus && result.taskInfo) {
      await updateAITaskById(task.id, {
        status: result.taskStatus,
        taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
        taskResult: result.taskResult
          ? JSON.stringify(result.taskResult)
          : null,
      });
    }
  }

  redirect({ href: `/activity/ai-tasks`, locale });
}
