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
  isShowSignModal: boolean;
  setIsShowSignModal: (show: boolean) => void;
  isShowPaymentModal: boolean;
  setIsShowPaymentModal: (show: boolean) => void;
  configs: Record<string, string>;
  refreshSession: () => Promise<void>;
  fetchUserCredits: () => Promise<void>;
  fetchUserInfo: () => Promise<void>;
}

const AppContext = createContext({} as ContextValue);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const [configs, setConfigs] = useState<Record<string, string>>({});

  // sign user
  const [user, setUser] = useState<User | null>(null);

  // session
  const { data: session, isPending, refetch: refreshSession } = useSession();

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
  }

  // Session is unknown while `useSession()` is pending. Treat this as a distinct state
  // (don't show "Sign in" UI yet) to avoid flashing the wrong auth UI.
  const isCheckSign = isPending;

  // show sign modal
  const [isShowSignModal, setIsShowSignModal] = useState(false);

  // show payment modal
  const [isShowPaymentModal, setIsShowPaymentModal] = useState(false);

  // Avoid redundant user-info fetches caused by session refreshes.
  const lastSessionUserIdRef = useRef<string | null>(null);

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
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (session?.user) {
      const sessionUser = session.user as User;
      // Preserve already-fetched credits if the session payload doesn't include them.
      setUser((prev) =>
        sessionUser.credits
          ? sessionUser
          : { ...sessionUser, credits: prev?.credits }
      );
      if (sessionUser.id && sessionUser.id !== lastSessionUserIdRef.current) {
        lastSessionUserIdRef.current = sessionUser.id;
        fetchUserInfo();
      }
    } else {
      setUser(null);
      lastSessionUserIdRef.current = null;
    }
  }, [session]);

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
        isShowSignModal,
        setIsShowSignModal,
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
