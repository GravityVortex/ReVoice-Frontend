import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';

import { envConfigs } from '@/config';
import { locales, defaultLocale } from '@/config/locale';
import { source } from '@/core/docs/source';

export default async function DocsContentPage(props: {
  params: Promise<{ slug?: string[]; locale?: string }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.locale);

  if (!page) notFound();

  // Load the MDX content - fumadocs-mdx v11 requires calling load()
  // Check if load() method exists, otherwise use data directly
  let mdxData: any;
  let MDXContent: any;
  
  if (typeof (page.data as any).load === 'function') {
    // If load() exists, call it
    mdxData = await (page.data as any).load();
    MDXContent = mdxData.body;
  } else {
    // Otherwise, use page.data directly (it might already be loaded)
    mdxData = page.data;
    MDXContent = (page.data as any).body;
  }

  return (
    <DocsPage
      toc={mdxData.toc}
      full={mdxData.full}
      tableOfContent={{
        style: 'clerk',
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams('slug', 'locale');
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[]; locale?: string }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.locale);
  if (!page) notFound();

  const locale = params.locale || defaultLocale;
  const appUrl = (envConfigs.app_url || '').replace(/\/+$/, '');
  const appName = envConfigs.app_name || 'SoulDub';
  const slugPath = params.slug?.join('/') || '';
  const docsPath = slugPath ? `/docs/${slugPath}` : '/docs';
  const canonicalUrl = `${appUrl}/${locale}${docsPath}`;

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${appUrl}/${loc}${docsPath}`;
  }
  languages['x-default'] = `${appUrl}/${defaultLocale}${docsPath}`;

  const title = page.data.title;
  const description = page.data.description || '';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      type: 'article' as const,
      title,
      description,
      url: canonicalUrl,
      siteName: appName,
      images: [`${appUrl}/og-image.png`],
    },
    twitter: {
      card: 'summary' as const,
      title,
      description,
      images: [`${appUrl}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
