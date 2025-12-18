import { redirect } from '@/core/i18n/navigation';

export default async function TestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  redirect({ href: '/test/request', locale });
}
