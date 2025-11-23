import { createElement } from 'react';
import { docs } from '@/.source';
import type { I18nConfig } from 'fumadocs-core/i18n';
import { createFromSource } from 'fumadocs-core/search/server';
import { loader } from 'fumadocs-core/source';
import { icons } from 'lucide-react';

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

// Create a modified i18n config that maps 'zh' to 'en' for Orama
const searchI18n: I18nConfig = {
  defaultLanguage: 'en',
  languages: ['en'], // Only use 'en' for search to avoid Orama language errors
};

// Create a separate source instance for search with only English language
const searchSource = loader({
  baseUrl: '/docs',
  // source: docs.toFumadocsSource(),
  source: ensureSource(docs),
  i18n: searchI18n,
  icon(icon) {
    if (!icon) {
      return;
    }
    if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
});

export const { GET } = createFromSource(searchSource, {
  language: 'english',
});
