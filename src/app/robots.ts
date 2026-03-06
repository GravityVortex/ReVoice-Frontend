import type { MetadataRoute } from 'next';

import { envConfigs } from '@/config';

const appUrl = (envConfigs.app_url || 'https://www.souldub.ai').replace(
  /\/+$/,
  ''
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/settings/',
          '/*/settings/*',
          '/*/admin/',
          '/*/admin/*',
          '/*/dashboard/',
          '/*/dashboard/*',
          '/*/chat/',
          '/*/chat/*',
          '/*/sign-in',
          '/*/sign-up',
          '/*/login',
          '/*/video_convert/',
          '/*/video_convert/*',
          '/*/activity/',
          '/*/activity/*',
          '/api/',
          '/*?*q=',
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
