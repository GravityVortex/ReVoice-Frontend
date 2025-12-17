'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { getAuthClient, useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { User } from '@/shared/models/user';

export interface ContextValue {
  user: User | null;
  isCheckSign: boolean;
  isShowSignModal: boolean;
  setIsShowSignModal: (show: boolean) => void;
  isShowPaymentModal: boolean;
  setIsShowPaymentModal: (show: boolean) => void;
  configs: Record<string, string>;
  fetchUserCredits: () => Promise<void>;
  fetchUserInfo: () => Promise<void>;
}

const AppContext = createContext({} as ContextValue);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [configs, setConfigs] = useState<Record<string, string>>({});

  // sign user
  const [user, setUser] = useState<User | null>(null);

  // session
  const { data: session, isPending } = useSession();

  // is check sign (true during SSR and initial render to avoid hydration mismatch when auth is enabled)
  const [isCheckSign, setIsCheckSign] = useState(!!envConfigs.auth_secret);

  // show sign modal
  const [isShowSignModal, setIsShowSignModal] = useState(false);

  // show payment modal
  const [isShowPaymentModal, setIsShowPaymentModal] = useState(false);

  // 记录上次请求时间
  const [lastFetchTime, setLastFetchTime] = useState(0);

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
    const now = Date.now();
    if (now - lastFetchTime < 10000) {
      console.log('get-user-info 请求过于频繁，已过滤');
      return;
    }

    try {
      setLastFetchTime(now);
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
    if (session && session.user) {
      setUser(session.user as User);
      fetchUserInfo();
    } else {
      setUser(null);
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

  useEffect(() => {
    setIsCheckSign(isPending);
  }, [isPending]);

  return (
    <AppContext.Provider
      value={{
        user,
        isCheckSign,
        isShowSignModal,
        setIsShowSignModal,
        isShowPaymentModal,
        setIsShowPaymentModal,
        configs,
        fetchUserCredits,
        fetchUserInfo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
