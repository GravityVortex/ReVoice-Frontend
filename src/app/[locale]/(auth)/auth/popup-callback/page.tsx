'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  sendPopupMessage,
  type AuthMessage,
} from '@/shared/hooks/use-popup-sign-in';
import { Button } from '@/shared/components/ui/button';

export default function PopupCallbackPage() {
  const t = useTranslations('common.sign');
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-opener'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('/');
  const [showManualClose, setShowManualClose] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const cbUrl = params.get('callbackUrl') || '/';
    const error = params.get('error');

    setCallbackUrl(cbUrl);

    // opener 缺失：以新标签页打开而非弹窗，显示降级 UI
    if (!window.opener) {
      if (error) {
        setStatus('error');
        setErrorMessage(error);
      } else {
        setStatus('no-opener');
      }
      return;
    }

    if (error) {
      setStatus('error');
      setErrorMessage(error);
      const message: AuthMessage = { type: 'oauth-error', error };
      sendPopupMessage(message);
      setTimeout(() => window.close(), 1500);
      return;
    }

    setStatus('success');
    const message: AuthMessage = { type: 'oauth-success', callbackUrl: cbUrl };
    sendPopupMessage(message);

    // 超时 3 秒后显示手动关闭按钮，兜底父窗口未收到消息的情况
    const safetyTimer = setTimeout(() => setShowManualClose(true), 3000);

    const closeTimer = setTimeout(() => {
      window.close();
    }, 500);

    return () => {
      clearTimeout(safetyTimer);
      clearTimeout(closeTimer);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 p-8 max-w-sm text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('processing')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm text-muted-foreground">{t('login_success')}</p>
            {showManualClose && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.close()}
              >
                {t('click_to_close')}
              </Button>
            )}
          </>
        )}

        {status === 'no-opener' && (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm text-muted-foreground">
              {t('login_success_no_opener')}
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                window.location.href = callbackUrl;
              }}
            >
              {t('goto_target_page')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-destructive">
              {errorMessage || t('login_failed')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
