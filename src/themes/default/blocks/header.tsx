'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

import { Link, usePathname, useRouter } from '@/core/i18n/navigation';
import {
  BrandLogo,
  LocaleSelector,
  SignUser,
  SmartIcon,
  ThemeToggler,
} from '@/shared/blocks/common';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/components/ui/accordion';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger as RawNavigationMenuTrigger,
} from '@/shared/components/ui/navigation-menu';
import { useMedia } from '@/shared/hooks/use-media';
import { cn } from '@/shared/lib/utils';
import { NavItem } from '@/shared/types/blocks/common';
import { Header as HeaderType } from '@/shared/types/blocks/landing';

// For Next.js hydration mismatch warning, conditionally render NavigationMenuTrigger only after mount to avoid inconsistency between server/client render
function NavigationMenuTrigger(
  props: React.ComponentProps<typeof RawNavigationMenuTrigger>
) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Only render after client has mounted, to avoid SSR/client render id mismatch
  if (!mounted) return null;
  return <RawNavigationMenuTrigger {...props} />;
}

export function Header({ header }: { header: HeaderType }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isLarge = useMedia('(min-width: 64rem)');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Listen to scroll event to enable header styles on scroll
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navigation menu for large screens
  const NavMenu = () => {
    const menuRef = useRef<React.ElementRef<typeof NavigationMenu>>(null);

    // Calculate dynamic viewport height for animated menu
    const handleViewportHeight = () => {
      requestAnimationFrame(() => {
        const menuNode = menuRef.current;
        if (!menuNode) return;

        const openContent = document.querySelector<HTMLElement>(
          '[data-slot="navigation-menu-viewport"][data-state="open"]'
        );

        if (openContent) {
          const height = openContent.scrollHeight;
          document.documentElement.style.setProperty(
            '--navigation-menu-viewport-height',
            `${height}px`
          );
        } else {
          document.documentElement.style.removeProperty(
            '--navigation-menu-viewport-height'
          );
        }
      });
    };

    return (
      <NavigationMenu
        ref={menuRef}
        onValueChange={handleViewportHeight}
        className="[--color-muted:color-mix(in_oklch,var(--color-foreground)_5%,transparent)] [--viewport-outer-px:2rem] **:data-[slot=navigation-menu-viewport]:rounded-none **:data-[slot=navigation-menu-viewport]:border-0 **:data-[slot=navigation-menu-viewport]:bg-transparent **:data-[slot=navigation-menu-viewport]:shadow-none **:data-[slot=navigation-menu-viewport]:ring-0 max-lg:hidden"
      >
        <NavigationMenuList className="gap-3">
          {header.nav?.items?.map((item, idx) => (
            <NavigationMenuItem key={idx} value={item.title || ''}>
              {item.children && item.children.length > 0 ? (
                <>
                  <NavigationMenuTrigger className="flex flex-row items-center gap-2 text-sm">
                    {item.icon && (
                      <SmartIcon
                        name={item.icon as string}
                        className="h-4 w-4"
                      />
                    )}
                    {item.title}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="mt-4.5 origin-top pt-5 pb-14 shadow-none ring-0">
                    <div className="divide-foreground/10 grid w-full min-w-6xl grid-cols-4 gap-4 divide-x pr-22">
                      <div className="col-span-2 row-span-2 grid grid-rows-subgrid gap-1 border-r-0">
                        <span className="text-muted-foreground ml-2 text-xs">
                          {item.title}
                        </span>
                        <ul className="mt-1 grid grid-cols-2 gap-2">
                          {item.children?.map((subItem: NavItem, iidx) => (
                            <ListItem
                              key={iidx}
                              href={subItem.url || ''}
                              title={subItem.title || ''}
                              description={subItem.description || ''}
                            >
                              {subItem.icon && (
                                <SmartIcon name={subItem.icon as string} />
                              )}
                            </ListItem>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </>
              ) : (
                <NavigationMenuLink asChild>
                  <Link
                    href={item.url || ''}
                    target={item.target || '_self'}
                    className={`flex flex-row items-center gap-2 text-sm ${item.is_active || pathname.endsWith(item.url as string)
                      ? 'bg-muted text-muted-foreground'
                      : ''
                      }`}
                  >
                    {item.icon && <SmartIcon name={item.icon as string} />}
                    {item.title}
                  </Link>
                </NavigationMenuLink>
              )}
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    );
  };

  // Mobile menu using Accordion, shown on small screens
  const MobileMenu = ({ closeMenu }: { closeMenu: () => void }) => {
    return (
      <nav
        role="navigation"
        className="w-full [--color-border:--alpha(var(--color-foreground)/5%)] [--color-muted:--alpha(var(--color-foreground)/5%)]"
      >
        <Accordion
          type="single"
          collapsible
          className="-mx-4 mt-0.5 space-y-0.5 **:hover:no-underline"
        >
          {header.nav?.items?.map((item, idx) => {
            return (
              <AccordionItem
                key={idx}
                value={item.title || ''}
                className="group relative border-b-0 before:pointer-events-none before:absolute before:inset-x-4 before:bottom-0 before:border-b"
              >
                {item.children && item.children.length > 0 ? (
                  <>
                    <AccordionTrigger className="data-[state=open]:bg-muted flex items-center justify-between px-4 py-3 text-lg **:!font-normal">
                      {item.title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-5">
                      <ul>
                        {item.children?.map((subItem: NavItem, iidx) => (
                          <li key={iidx}>
                            <Link
                              href={subItem.url || ''}
                              onClick={closeMenu}
                              className="grid grid-cols-[auto_1fr] items-center gap-2.5 px-4 py-2"
                            >
                              <div
                                aria-hidden
                                className="flex items-center justify-center *:size-4"
                              >
                                {subItem.icon && (
                                  <SmartIcon name={subItem.icon as string} />
                                )}
                              </div>
                              <div className="text-base">{subItem.title}</div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </>
                ) : (
                  <Link
                    href={item.url || ''}
                    onClick={closeMenu}
                    className="data-[state=open]:bg-muted flex items-center justify-between px-4 py-3 text-lg **:!font-normal"
                  >
                    {item.title}
                  </Link>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
      </nav>
    );
  };

  // List item for submenus in NavigationMenu
  function ListItem({
    title,
    description,
    children,
    href,
    ...props
  }: React.ComponentPropsWithoutRef<'li'> & {
    href: string;
    title: string;
    description?: string;
  }) {
    return (
      <li {...props}>
        <NavigationMenuLink asChild>
          <Link href={href} className="grid grid-cols-[auto_1fr] gap-3.5">
            <div className="bg-background ring-foreground/10 relative flex size-9 items-center justify-center rounded border border-transparent shadow shadow-sm ring-1">
              {children}
            </div>
            <div className="space-y-0.5">
              <div className="text-foreground text-sm font-medium">{title}</div>
              <p className="text-muted-foreground line-clamp-1 text-xs">
                {description}
              </p>
            </div>
          </Link>
        </NavigationMenuLink>
      </li>
    );
  }

  return (
    <>
      <header
        data-state={isMobileMenuOpen ? 'active' : 'inactive'}
        {...(isScrolled && { 'data-scrolled': true })}
        className="fixed inset-x-0 top-0 z-50 h-[4.5rem] transition-all duration-300"
      >
        <div
          className={cn(
            'absolute inset-0 transition-all duration-500',
            // Default state: Transparent or subtle glass
            'bg-background/0 backdrop-blur-sm border-b border-transparent',
            // Scrolled state: Dark Glass with border
            'in-data-scrolled:bg-background/60 in-data-scrolled:backdrop-blur-xl in-data-scrolled:border-white/10 in-data-scrolled:shadow-lg',
            // Mobile menu open state
            'has-data-[state=open]:bg-background/95 has-data-[state=open]:backdrop-blur-xl'
          )}
        />

        <div className="container relative z-10 h-full">
          <div className="flex h-full items-center justify-between">

            <div className="flex items-center gap-8 h-full">
              {/* Brand Logo */}
              {header.brand && (
                <div className="flex-shrink-0">
                  <BrandLogo brand={header.brand} />
                </div>
              )}

              {/* Desktop Nav - Clean and simple */}
              {isLarge && (
                <div className="hidden lg:block">
                  <NavMenu />
                </div>
              )}
            </div>

            {/* Mobile Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close Menu' : 'Open Menu'}
              className="lg:hidden relative z-50 p-2 -mr-2 text-foreground"
            >
              {isMobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>

            {/* Mobile Menu Content */}
            {!isLarge && isMobileMenuOpen && (
              <div className="absolute top-[4.5rem] left-0 right-0 h-[calc(100vh-4.5rem)] bg-background/95 backdrop-blur-xl p-4 overflow-y-auto border-t border-white/10 lg:hidden">
                <MobileMenu closeMenu={() => setIsMobileMenuOpen(false)} />
              </div>
            )}

            {/* Right Side Actions */}
            <div className="hidden lg:flex items-center gap-6">
              {/* header.show_theme ? <ThemeToggler /> : null */}
              {header.show_locale ? <LocaleSelector /> : null}

              {header.show_sign ? (
                <SignUser userNav={header.user_nav} />
              ) : null}

              <div className="flex items-center gap-3">
                {header.buttons &&
                  header.buttons.map((button, idx) => (
                    <Link
                      key={idx}
                      href={button.url || ''}
                      target={button.target || '_self'}
                      className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-300',
                        'h-10 px-6',
                        button.variant === 'outline'
                          ? 'bg-transparent text-foreground hover:bg-white/10'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-5px_var(--primary)] hover:shadow-[0_0_20px_-2px_var(--primary)] hover:scale-105'
                      )}
                    >
                      {button.icon && (
                        <SmartIcon name={button.icon as string} className="w-4 h-4" />
                      )}
                      <span>{button.title}</span>
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
