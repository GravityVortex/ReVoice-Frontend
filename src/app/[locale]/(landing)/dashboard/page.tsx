import { redirect } from '@/core/i18n/navigation';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Keep `/dashboard` as a stable entry point; the real workspace lives under
  // `/video_convert/*` today.
  redirect({ href: '/video_convert/myVideoList', locale });
}

