// 网页底部链接组件
import NextLink from 'next/link';

import { Link } from '@/core/i18n/navigation';
import type { NavItem } from '@/shared/types/blocks/common';
import type { Footer as FooterType } from '@/shared/types/blocks/landing';
import {
  BrandLogo,
  Copyright,
  LocaleSelector,
  ThemeToggler,
} from '@/shared/blocks/common';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
// import { getTranslations } from 'next-intl/server';

export function Footer({ footer }: { footer: FooterType }) {
  // const t = await getTranslations('common');
  return (
    <footer
      id={footer.id}
      className={`py-8 sm:py-8 ${footer.className || ''} overflow-x-hidden`}
    // overflow-x-hidden防止-footer-撑出水平滚动条
    >
      <div className="container space-y-4 overflow-x-hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-8">
          {/* {footer.show_built_with !== false ? <BuiltWith /> : null} */}
          {/* <div className="min-w-0 flex-1" /> */}
          {/* {footer.show_theme !== false ? <ThemeToggler type="toggle" /> : null}
          {footer.show_locale !== false ? (
            <LocaleSelector type="button" />
          ) : null} */}
        </div>

        {/* 分隔虚线 */}
        <div
          aria-hidden
          className="h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25"
        />
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-8">

          {/* 版权 */}
          <p className="text-muted-foreground text-sm font-medium">
            © {new Date().getFullYear()} {footer.copyright}
          </p>

          <div className="min-w-0 flex-1"></div>

          {/* 隐私政策 */}
          {footer.agreement ? (
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              {footer.agreement?.items.map((item: NavItem, index: number) => {
                const href = item.url || '';
                const target = item.target || undefined;
                const rel = target === '_blank' ? 'noopener noreferrer' : undefined;

                if (!href) return null;

                // Agreement links are not localized. Avoid next-intl Link which would prefix `/{locale}`.
                if (href.startsWith('/')) {
                  return (
                    <NextLink
                      key={index}
                      href={href}
                      target={target}
                      rel={rel}
                      className="text-muted-foreground hover:text-primary block text-xs break-words underline duration-150"
                    >
                      {item.title || ''}
                    </NextLink>
                  );
                }

                return (
                  <a
                    key={index}
                    href={href}
                    target={target}
                    rel={rel}
                    className="text-muted-foreground hover:text-primary block text-xs break-words underline duration-150"
                  >
                    {item.title || ''}
                  </a>
                );
              })}
            </div>
          ) : null}

          {/* 社交 - TODO: 暂时注释，待有内容时开启 */}
          {footer.social ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {footer.social?.items.map((item: NavItem, index) => (
                <Link
                  key={index}
                  href={item.url || ''}
                  target={item.target || ''}
                  className="text-muted-foreground hover:text-primary bg-background block cursor-pointer rounded-full p-2 duration-150"
                >
                  {item.icon && (
                    <SmartIcon name={item.icon as string} size={20} />
                  )}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {footer.show_theme !== false ? <ThemeToggler type="toggle" /> : null}
            {footer.show_locale !== false ? (
              <LocaleSelector />
            ) : null}
          </div>

        </div>
      </div>
    </footer>
  );
}
