'use client';

import { useParams } from 'next/navigation';

import { ProjectDetailView } from '@/shared/blocks/video-convert/project-detail-view';

export default function DashboardProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = (params.locale as string) || 'zh';

  return (
    <ProjectDetailView
      fileId={id}
      locale={locale}
      backHref="/dashboard/projects"
      createHref="/dashboard/create"
    />
  );
}

