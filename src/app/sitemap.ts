import type { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { locales } from '@/config/locale';

const appUrl = (envConfigs.app_url || 'https://www.souldub.ai').replace(
  /\/+$/,
  ''
);

const publicPaths = ['/', '/pricing', '/showcases', '/docs'];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const now = new Date().toISOString();

  for (const path of publicPaths) {
    for (const locale of locales) {
      const loc =
        path === '/'
          ? `${appUrl}/${locale}`
          : `${appUrl}/${locale}${path}`;

      entries.push({
        url: loc,
        lastModified: now,
        changeFrequency: path === '/' ? 'weekly' : 'monthly',
        priority: path === '/' ? 1.0 : 0.8,
      });
    }
  }

  // Legal pages (no locale prefix)
  for (const legalPath of ['/privacy', '/terms']) {
    entries.push({
      url: `${appUrl}${legalPath}`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    });
  }

  return entries;
}
