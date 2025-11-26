import { redirect } from '@/core/i18n/navigation';

export default async function VideoConvertPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  console.log('VideoConvertPage-->', locale);
  // redirect({ href: '/video_convert', locale });
}
