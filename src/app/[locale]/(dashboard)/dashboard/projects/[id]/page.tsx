'use client';

import { useParams } from 'next/navigation';

import { ProjectDetailView } from '@/shared/blocks/video-convert/project-detail-view';

export default function DashboardProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = (params.locale as string) || 'zh';

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-6 pb-4 md:px-6 md:pt-8">
      <ProjectDetailView
        fileId={id}
        locale={locale}
        backHref="/dashboard/projects"
      />
    </div>
  );
}

