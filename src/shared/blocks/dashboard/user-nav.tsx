'use client';

import { Fragment, useEffect, useState } from 'react';
import { Loader2, LogOut, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { signOut } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useAppContext } from '@/shared/contexts/app';
import { useSignInRedirect } from '@/shared/hooks/use-sign-in-redirect';
import { NavItem } from '@/shared/types/blocks/common';
import { SidebarUser as SidebarUserType } from '@/shared/types/blocks/dashboard';

export function UserNav({ user }: { user: SidebarUserType }) {
    const t = useTranslations('common.sign');
    const router = useRouter();
    const redirectToSignIn = useSignInRedirect('/dashboard');

    const { user: authedUser, isAuthLoading } = useAppContext();

    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => {
        setHasMounted(true);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        router.push(user.signout_callback || '/sign-in');
    };

    if (!hasMounted) {
        return (
            <div className="flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
        );
    }

    if (isAuthLoading && !authedUser) {
        return (
            <div className="flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            </div>
        );
    }

    if (authedUser) {
        const avatarLetter = (authedUser.name || authedUser.email || 'U')
            .trim()
            .charAt(0)
            .toUpperCase();

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="relative h-10 w-10 rounded-full p-0"
                        aria-label="Account"
                    >
                        {/* Google-like avatar button: subtle ring + hover elevation */}
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/60 bg-background/40 shadow-sm transition-[box-shadow,transform] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                            <Avatar className="h-9 w-9">
                                <AvatarImage
                                    src={authedUser.image || ''}
                                    alt={authedUser.name}
                                    className="object-cover"
                                />
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                    {avatarLetter}
                                </AvatarFallback>
                            </Avatar>
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{authedUser.name}</p>
                            <p className="text-xs leading-none text-muted-foreground">
                                {authedUser.email}
                            </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        {user.nav?.items.map((item: NavItem | undefined) => (
                            <Fragment key={item?.title || item?.url}>
                                <DropdownMenuItem className="cursor-pointer" asChild>
                                    <Link
                                        href={item?.url || ''}
                                        target={item?.target}
                                        className="flex w-full items-center gap-2"
                                    >
                                        {item?.icon && <SmartIcon name={item.icon as string} className="h-4 w-4" />}
                                        {item?.title || ''}
                                    </Link>
                                </DropdownMenuItem>
                            </Fragment>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={handleSignOut}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            {t('sign_out_title')}
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <Button
            variant="outline"
            onClick={() => redirectToSignIn(user.signin_callback || '/dashboard')}
        >
            <User className="mr-2 h-4 w-4" />
            {t('sign_in_title')}
        </Button>
    );
}
