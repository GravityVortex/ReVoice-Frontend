'use client';

import { ComponentType, lazy, Suspense } from 'react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

const iconCache: { [key: string]: ComponentType<any> } = {};

// Keep this intentionally tiny: only fix known mismatches we actually see in logs.
const lucideAliases: Record<string, string> = {
  UserVoice: 'User',
};

function toLucideKey(name: string) {
  if (!name) return '';
  // Already kebab-case (or alias keys like "alarm-check" that lucide provides).
  if (name.includes('-')) return name.toLowerCase();

  // PascalCase/CamelCase -> kebab-case (e.g. LayoutDashboard -> layout-dashboard, Minimize2 -> minimize-2).
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .replace(/(\d)([a-zA-Z])/g, '$1-$2')
    .toLowerCase();
}

// Function to automatically detect icon library
function detectIconLibrary(name: string): 'ri' | 'lucide' {
  if (name && name.startsWith('Ri')) {
    return 'ri';
  }

  return 'lucide';
}

export function SmartIcon({
  name,
  size = 24,
  className,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
  [key: string]: any;
}) {
  const library = detectIconLibrary(name);
  const resolvedName =
    library === 'lucide' ? lucideAliases[name] ?? name : name;
  const lucideKey = library === 'lucide' ? toLucideKey(resolvedName) : '';
  const cacheKey = library === 'lucide' ? `${library}-${lucideKey}` : `${library}-${resolvedName}`;

  if (!iconCache[cacheKey]) {
    if (library === 'ri') {
      // React Icons (Remix Icons)
      iconCache[cacheKey] = lazy(async () => {
        try {
          const mod = await import('react-icons/ri');
          const IconComponent = mod[resolvedName as keyof typeof mod];
          if (IconComponent) {
            return { default: IconComponent as ComponentType<any> };
          } else {
            console.warn(
              `Icon "${resolvedName}" not found in react-icons/ri, using fallback`
            );
            return { default: mod.RiQuestionLine as ComponentType<any> };
          }
        } catch (error) {
          console.error(`Failed to load react-icons/ri:`, error);
          const fallbackModule = await import('react-icons/ri');
          return {
            default: fallbackModule.RiQuestionLine as ComponentType<any>,
          };
        }
      });
    } else {
      // Lucide React (default): use dynamicIconImports to avoid importing the entire icon index.
      iconCache[cacheKey] = lazy(async () => {
        const fallbackKey = 'help-circle';
        try {
          const importer =
            (dynamicIconImports as Record<string, () => Promise<any>>)[lucideKey] ??
            (dynamicIconImports as Record<string, () => Promise<any>>)[fallbackKey];
          if (!importer) {
            throw new Error(`Lucide fallback "${fallbackKey}" is missing`);
          }

          const mod = await importer();
          return { default: mod.default as ComponentType<any> };
        } catch (error) {
          console.error(`Failed to load lucide icon "${resolvedName}" (${lucideKey}):`, error);
          const importer = (dynamicIconImports as Record<string, () => Promise<any>>)[fallbackKey];
          const mod = importer ? await importer() : { default: () => null };
          return { default: mod.default as ComponentType<any> };
        }
      });
    }
  }

  const IconComponent = iconCache[cacheKey];

  return (
    <Suspense fallback={<div style={{ width: size, height: size }} />}>
      <IconComponent size={size} className={className} {...props} />
    </Suspense>
  );
}
