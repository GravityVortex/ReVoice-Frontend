// .source folder will be generated when you run `next dev`
import { createElement } from 'react';
import { docs, pages, posts } from '@/.source';
import type { I18nConfig } from 'fumadocs-core/i18n';
import { loader } from 'fumadocs-core/source';
import { icons } from 'lucide-react';
import type { Source } from 'fumadocs-core/source';

// Helper function to ensure toFumadocsSource returns correct structure
function ensureSource(collection: any): any {
  const result = collection.toFumadocsSource();
  
  // In fumadocs-mdx v11, files is a function that returns the array
  // We need to convert it to an actual array for fumadocs-core v15
  if (typeof result.files === 'function') {
    return {
      ...result,
      files: result.files(),
    };
  }
  
  return result;
}

export const i18n: I18nConfig = {
  defaultLanguage: 'en',
  languages: ['en', 'zh'],
};

const iconHelper = (icon: string | undefined) => {
  if (!icon) {
    // You may set a default icon
    return;
  }
  if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
};

// Docs source
export const docsSource = loader({
  baseUrl: '/docs',
  source: ensureSource(docs),
  i18n,
  icon: iconHelper,
});

// Pages source (using root path)
export const pagesSource = loader({
  baseUrl: '/',
  source: ensureSource(pages),
  i18n,
  icon: iconHelper,
});

// Posts source
export const postsSource = loader({
  baseUrl: '/blog',
  source: ensureSource(posts),
  i18n,
  icon: iconHelper,
});

// Keep backward compatibility
export const source = docsSource;
