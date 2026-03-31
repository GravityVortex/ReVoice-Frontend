'use client';

import { useCallback, useEffect, useRef } from 'react';

export type AuthMessage =
  | { type: 'oauth-success'; callbackUrl: string }
  | { type: 'oauth-error'; error: string };

export interface PopupSignInOptions {
  width?: number;
  height?: number;
  onSuccess?: (callbackUrl: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

const POPUP_MESSAGE_TYPE = 'oauth-popup-message';
const BROADCAST_CHANNEL_NAME = 'oauth-popup-channel';

export function usePopupSignIn() {
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch {
        // 忽略通道已关闭等清理期异常
      }
      channelRef.current = null;
    }
    popupRef.current = null;
  }, []);

  const openPopup = useCallback(
    (url: string, options: PopupSignInOptions = {}) => {
      const {
        width = 500,
        height = 600,
        onSuccess,
        onError,
        onClose,
      } = options;

      cleanup();

      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

      const features = [
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        'popup=yes',
        'toolbar=no',
        'menubar=no',
        'scrollbars=yes',
        'resizable=yes',
        'status=no',
      ].join(',');

      const popup = window.open(url, '_blank', features);

      if (!popup) {
        onError?.('Popup was blocked by the browser');
        return null;
      }

      if (url === 'about:blank') {
        try {
          popup.document.write(
            '<html><body style="background:#0a0a0a;display:flex;align-items:center;' +
              'justify-content:center;height:100vh;margin:0">' +
              '<div style="color:#555;font-size:14px">Loading...</div></body></html>',
          );
          popup.document.close();
        } catch {
          // about:blank 预写入失败不影响后续 OAuth 跳转
        }
      }

      popupRef.current = popup;

      // Prevent double-firing when both postMessage and BroadcastChannel deliver
      let resolved = false;

      const handleAuthResult = (data: AuthMessage) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        if (data.type === 'oauth-success') {
          onSuccess?.(data.callbackUrl);
        } else if (data.type === 'oauth-error') {
          onError?.(data.error);
        }
      };

      // Channel 1: postMessage (primary — works when window.opener is available)
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as AuthMessage & { _type?: string };
        if (data?._type !== POPUP_MESSAGE_TYPE) return;
        handleAuthResult(data);
      };

      messageHandlerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);

      // Channel 2: BroadcastChannel (fallback — works when COOP nulls window.opener)
      try {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.onmessage = (event) => {
          const data = event.data as AuthMessage & { _type?: string };
          if (data?._type !== POPUP_MESSAGE_TYPE) return;
          handleAuthResult(data);
        };
        channelRef.current = channel;
      } catch {
        // BroadcastChannel not supported — postMessage is the only channel
      }

      // Detect popup closure; grace period allows in-flight messages to arrive
      timerRef.current = setInterval(() => {
        if (popup.closed) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setTimeout(() => {
            if (!resolved) {
              cleanup();
              onClose?.();
            }
          }, 300);
        }
      }, 500);

      return popup;
    },
    [cleanup]
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { openPopup, cleanup };
}

// Used by popup-callback page: send via postMessage (primary channel)
export function sendPopupMessage(message: AuthMessage, targetOrigin?: string) {
  if (typeof window === 'undefined') return;

  const origin = targetOrigin || window.location.origin;

  window.opener?.postMessage(
    {
      ...message,
      _type: POPUP_MESSAGE_TYPE,
    },
    origin
  );
}

// Used by popup-callback page: send via BroadcastChannel (fallback channel)
export function broadcastPopupResult(message: AuthMessage) {
  if (typeof window === 'undefined') return;
  try {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage({
      ...message,
      _type: POPUP_MESSAGE_TYPE,
    });
    setTimeout(() => channel.close(), 500);
  } catch {
    // BroadcastChannel not supported
  }
}
