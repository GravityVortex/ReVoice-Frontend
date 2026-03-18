'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  sendPopupMessage,
  broadcastPopupResult,
  type AuthMessage,
} from '@/shared/hooks/use-popup-sign-in';
import { Button } from '@/shared/components/ui/button';

export default function PopupCallbackPage() {
  const t = useTranslations('common.sign');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showManualClose, setShowManualClose] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const cbUrl = params.get('callbackUrl') || '/';
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage(error);
      const message: AuthMessage = { type: 'oauth-error', error };
      sendPopupMessage(message);
      broadcastPopupResult(message);
      setTimeout(() => window.close(), 1500);
      return;
    }

    // Dual-channel notify: postMessage (primary) + BroadcastChannel (fallback)
    setStatus('success');
    const message: AuthMessage = { type: 'oauth-success', callbackUrl: cbUrl };
    sendPopupMessage(message);
    broadcastPopupResult(message);

    const closeTimer = setTimeout(() => {
      window.close();
    }, 500);

    // If window.close() didn't work (e.g. browser restrictions), show manual close UI
    const safetyTimer = setTimeout(() => setShowManualClose(true), 2000);

    return () => {
      clearTimeout(closeTimer);
      clearTimeout(safetyTimer);
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
            <p className="text-sm text-muted-foreground">
              {showManualClose
                ? t('login_success_no_opener')
                : t('login_success')}
            </p>
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
