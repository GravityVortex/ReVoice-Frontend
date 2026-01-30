'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useSession } from '@/core/auth/client';
import { User } from '@/shared/models/user';

export interface ContextValue {
  user: User | null;
  isCheckSign: boolean;
  isShowPaymentModal: boolean;
  setIsShowPaymentModal: (show: boolean) => void;
  configs: Record<string, string>;
  refreshSession: () => Promise<void>;
  fetchUserCredits: () => Promise<void>;
  fetchUserInfo: () => Promise<void>;
}

const AppContext = createContext({} as ContextValue);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider = ({
  children,
  initialUser = null,
  initialConfigs,
}: {
  children: ReactNode;
  initialUser?: User | null;
  initialConfigs?: Record<string, string>;
}) => {
  const [configs, setConfigs] = useState<Record<string, string>>(
    initialConfigs ?? {}
  );

  // sign user
  const [user, setUser] = useState<User | null>(initialUser);

  const [sessionGraceExpired, setSessionGraceExpired] = useState(false);

  // session
  const {
    data: session,
    isPending,
    isRefetching,
    error: sessionError,
    refetch: refreshSession,
  } = useSession();

  // Avoid a one-render "signed out" flash when the session finishes loading.
  // `user` is stored in state and updated in an effect, so it lags behind `session`.
  const sessionUser = session?.user ? (session.user as User) : null;
  let authedUser: User | null = null;
  if (sessionUser) {
    if (user && user.id === sessionUser.id) {
      authedUser = user;
    } else if (sessionUser.credits) {
      authedUser = sessionUser;
    } else {
      // Preserve previously fetched credits if the session payload doesn't include them.
      authedUser = { ...sessionUser, credits: user?.credits };
    }
  } else if (user) {
    // SSR can provide an initial user. Keep it until the session hook finishes.
    authedUser = user;
  }

  // Session is unknown while `useSession()` is pending. Treat this as a distinct state
  // (don't show "Sign in" UI yet) to avoid flashing the wrong auth UI.
  //
  // However, when the auth backend is slow/unreachable, the pending state can persist
  // long enough that the UI feels "dead". After a short grace period, we fall back to
  // a signed-out UI (the session can still resolve later and rehydrate the user).
  const isCheckSign = isPending && !authedUser && !sessionGraceExpired;

  // show payment modal
  const [isShowPaymentModal, setIsShowPaymentModal] = useState(false);

  // Avoid redundant user-info fetches caused by session refreshes.
  const lastSessionUserIdRef = useRef<string | null>(null);
  const didRevalidateSessionRef = useRef(false);
  const clearUserTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConfigs = async function () {
    try {
      const resp = await fetch('/api/config/get-configs', {
        method: 'POST',
      });
      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setConfigs(data);
    } catch (e) {
      console.log('fetch configs failed:', e);
    }
  };

  const fetchUserCredits = async function () {
    try {
      if (!user) {
        return;
      }

      const resp = await fetch('/api/user/get-user-credits', {
        method: 'POST',
      });
      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setUser({ ...user, credits: data });
    } catch (e) {
      console.log('fetch user credits failed:', e);
    }
  };

  const fetchUserInfo = async function () {
    try {
      const resp = await fetch('/api/user/get-user-info', {
        method: 'POST',
      });
      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setUser(data);
    } catch (e) {
      console.log('fetch user info failed:', e);
    }
  };

  const showOneTap = async function (configs: Record<string, string>) {
    // Google One Tap is configured on the server side in auth config
    // No client-side initialization needed
    // The One Tap prompt will automatically appear if enabled in server config
  };

  useEffect(() => {
    if (!isPending) {
      setSessionGraceExpired(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setSessionGraceExpired(true);
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [isPending]);

  useEffect(() => {
    // Avoid an immediate redundant round-trip when configs were already provided by SSR.
    if (!initialConfigs || Object.keys(initialConfigs).length === 0) {
      fetchConfigs();
    }
  }, [initialConfigs]);

  useEffect(() => {
    // Don't clobber SSR-provided user while the session is still loading.
    if (isPending) {
      if (clearUserTimeoutRef.current) {
        clearTimeout(clearUserTimeoutRef.current);
        clearUserTimeoutRef.current = null;
      }
      return;
    }

    if (session?.user) {
      if (clearUserTimeoutRef.current) {
        clearTimeout(clearUserTimeoutRef.current);
        clearUserTimeoutRef.current = null;
      }

      // Session is healthy again, allow a future revalidation if needed.
      didRevalidateSessionRef.current = false;

      const sessionUser = session.user as User;
      // Preserve already-fetched credits if the session payload doesn't include them.
      setUser((prev) => {
        if (!prev) return sessionUser;
        if (prev.id && sessionUser.id && prev.id !== sessionUser.id) {
          return sessionUser;
        }

        // `useSession()` often returns a minimal user shape (no credits/isAdmin/souldubAccess).
        // Merge to avoid UI flicker/regressions from dropping SSR-provided fields.
        const next = {
          ...prev,
          ...sessionUser,
          name: sessionUser.name ?? prev.name,
          email: sessionUser.email ?? prev.email,
          image: sessionUser.image ?? prev.image,
          credits: sessionUser.credits ?? prev.credits,
          isAdmin: sessionUser.isAdmin ?? prev.isAdmin,
          souldubAccess: sessionUser.souldubAccess ?? prev.souldubAccess,
          roles: sessionUser.roles ?? prev.roles,
          permissions: sessionUser.permissions ?? prev.permissions,
          data: (sessionUser as any).data ?? (prev as any).data,
        };

        // Prevent infinite loops when `useSession()` returns a new object on every render.
        // Only update state when fields that affect rendering actually changed.
        const prevCredits = prev.credits?.remainingCredits ?? null;
        const nextCredits = next.credits?.remainingCredits ?? null;
        const prevExpires = prev.credits?.expiresAt?.valueOf?.() ?? null;
        const nextExpires = next.credits?.expiresAt?.valueOf?.() ?? null;

        if (
          prev.id === next.id &&
          prev.name === next.name &&
          prev.email === next.email &&
          prev.image === next.image &&
          prev.isAdmin === next.isAdmin &&
          prev.souldubAccess === next.souldubAccess &&
          prevCredits === nextCredits &&
          prevExpires === nextExpires
        ) {
          return prev;
        }

        return next;
      });
      if (sessionUser.id && sessionUser.id !== lastSessionUserIdRef.current) {
        lastSessionUserIdRef.current = sessionUser.id;
        fetchUserInfo();
      }
    } else {
      // If SSR gave us a user but the client session briefly resolves to null,
      // do a single revalidation pass to avoid auth UI flicker.
      if (user && !didRevalidateSessionRef.current && !isRefetching) {
        didRevalidateSessionRef.current = true;
        void refreshSession();
        return;
      }

      // While we're revalidating, keep the last known user to prevent flicker.
      if (user && isRefetching) {
        return;
      }

      // If we can't load session due to a transient client error, keep the last
      // known user instead of flashing "signed out".
      if (user && sessionError) {
        return;
      }

      // Avoid clearing an SSR user immediately; this can cause a visible flicker if the
      // session endpoint briefly returns null before stabilizing.
      if (user) {
        if (!clearUserTimeoutRef.current) {
          clearUserTimeoutRef.current = setTimeout(() => {
            setUser(null);
            lastSessionUserIdRef.current = null;
            clearUserTimeoutRef.current = null;
          }, 1500);
        }
        return;
      }

      setUser(null);
      lastSessionUserIdRef.current = null;
    }
  }, [session, isPending, isRefetching, refreshSession, sessionError]);

  useEffect(() => {
    if (
      configs &&
      configs.google_client_id &&
      configs.google_one_tap_enabled === 'true' &&
      !session &&
      !isPending
    ) {
      showOneTap(configs);
    }
  }, [configs, session, isPending]);

  useEffect(() => {
    if (user && !user.credits) {
      // fetchUserCredits();
    }
  }, [user]);

  return (
    <AppContext.Provider
      value={{
        user: authedUser,
        isCheckSign,
        isShowPaymentModal,
        setIsShowPaymentModal,
        configs,
        refreshSession,
        fetchUserCredits,
        fetchUserInfo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
