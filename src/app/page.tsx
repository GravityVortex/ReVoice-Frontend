import { permanentRedirect } from 'next/navigation';

import { defaultLocale } from '@/config/locale';

export default function RootPage() {
  permanentRedirect(`/${defaultLocale}`);
}

