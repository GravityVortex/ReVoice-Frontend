'use client';

import { Fragment } from 'react/jsx-runtime';
import { Coins, LayoutDashboard, LogOut, User, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { signOut } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useAppContext } from '@/shared/contexts/app';
import { useSignInRedirect } from '@/shared/hooks/use-sign-in-redirect';
import { cn } from '@/shared/lib/utils';
import { NavItem, UserNav } from '@/shared/types/blocks/common';
import { checkSoulDubAccess } from '@/shared/lib/souldub';

import { SmartIcon } from '../common/smart-icon';

export function SignUser({
  isScrolled,
  signButtonSize = 'sm',
  userNav,
}: {
  isScrolled?: boolean;
  signButtonSize?: 'default' | 'sm' | 'lg' | 'icon';
  userNav?: UserNav;
}) {
  const t = useTranslations('common.sign');
  const { isCheckSign, user, configs } = useAppContext();
  const router = useRouter();
  const redirectToSignIn = useSignInRedirect();

  const hasAccess =
    !!user?.isAdmin ||
    (user?.souldubAccess ??
      checkSoulDubAccess(user?.email, configs, false));

  if (!user && isCheckSign) {
    // Session is still loading; avoid flashing the signed-out UI.
    return (
      <>
        <Skeleton
          aria-hidden
          className="h-10 w-10 rounded-full"
        />
      </>
    );
  }

  return (
    <>
      {user ? (
        <div className="flex items-center gap-4">
          {hasAccess && (
            <Link href="/dashboard" className="hidden lg:flex">
              <Button
                size="sm"
                className="relative group h-9 gap-2 text-xs font-bold text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 border-0 shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-[0_0_25px_rgba(59,130,246,0.7)] transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] overflow-hidden"
              >
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:-100%_0] group-hover:bg-[position:200%_0] transition-[background-position] duration-[1500ms]" />
                <LayoutDashboard className="w-3.5 h-3.5 fill-white/90 animate-pulse" />
                <span className="relative">{t('start_creating')}</span>
                <Sparkles className="w-3 h-3 text-cyan-100" />
              </Button>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 rounded-full p-0"
              >
                {/* 登录后的头像 */}
                <Avatar>
                  <AvatarImage src={user.image || ''} alt={user.name || ''} />
                  <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl p-2" align="end">
              {/* User Info Header */}
              <div className="flex items-center gap-3 p-3 mb-1 rounded-lg bg-muted/50">
                <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                  <AvatarImage src={user.image || ''} alt={user.name || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {user.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-semibold text-sm truncate">{user.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                </div>
              </div>

              <DropdownMenuSeparator />

              {hasAccess && userNav?.show_credits && (
                <DropdownMenuItem asChild className="py-2 px-3 rounded-lg focus:bg-muted">
                  <Link
                    className="w-full cursor-pointer flex items-center gap-3"
                    href="/settings/credits"
                  >
                    <Coins className="h-4 w-4 text-primary" />
                    <span className="flex-1">{t('credits_title', {
                      credits: user.credits?.remainingCredits || 0,
                    })}</span>
                  </Link>
                </DropdownMenuItem>
              )}

              {hasAccess && userNav?.items?.map((item: NavItem, idx: number) => (
                <DropdownMenuItem key={idx} asChild className="py-2 px-3 rounded-lg focus:bg-muted">
                  <Link
                    className="w-full cursor-pointer flex items-center gap-3"
                    href={item.url || ''}
                    target={item.target || '_self'}
                  >
                    {item.icon && (
                      <SmartIcon
                        name={item.icon as string}
                        className="h-4 w-4 text-muted-foreground"
                      />
                    )}
                    <span className="flex-1">{item.title}</span>
                  </Link>
                </DropdownMenuItem>
              ))}

              {user.isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="py-2 px-3 rounded-lg focus:bg-muted">
                    <Link className="w-full cursor-pointer flex items-center gap-3" href="/admin">
                      <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{t('admin_title')}</span>
                    </Link>
                  </DropdownMenuItem>
                </>
              )}

              {userNav?.show_sign_out && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="py-2 px-3 rounded-lg focus:bg-destructive/10 text-destructive cursor-pointer flex items-center gap-3"
                    onClick={() =>
                      signOut({
                        fetchOptions: {
                          onSuccess: () => {
                            router.push('/');
                          },
                        },
                      })
                    }
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="flex-1">{t('sign_out_title')}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
          <Button
            size={signButtonSize}
            className={cn(
              'border-foreground/10 cursor-pointer ring-0',
              isScrolled && 'lg:hidden'
            )}
            onClick={() => redirectToSignIn()}
          >
            <span>{t('sign_in_title')}</span>
          </Button>
        </div>
      )}
    </>
  );
}
