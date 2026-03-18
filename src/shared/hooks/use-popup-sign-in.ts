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

export function usePopupSignIn() {
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
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

      // 清理之前的 popup 和监听器
      cleanup();

      // 计算居中位置
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

      // about:blank 时写入深色背景 loading，避免白屏闪烁
      if (url === 'about:blank') {
        try {
          popup.document.write(
            '<html><body style="background:#0a0a0a;display:flex;align-items:center;' +
              'justify-content:center;height:100vh;margin:0">' +
              '<div style="color:#555;font-size:14px">Loading...</div></body></html>',
          );
          popup.document.close();
        } catch {}
      }

      popupRef.current = popup;

      // 监听来自 popup 的消息
      const handleMessage = (event: MessageEvent) => {
        // 验证来源
        if (event.origin !== window.location.origin) {
          return;
        }

        const data = event.data as AuthMessage & { _type?: string };

        // 验证消息类型
        if (data?._type !== POPUP_MESSAGE_TYPE) {
          return;
        }

        if (data.type === 'oauth-success') {
          cleanup();
          onSuccess?.(data.callbackUrl);
        } else if (data.type === 'oauth-error') {
          cleanup();
          onError?.(data.error);
        }
      };

      messageHandlerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);

      // 检测 popup 是否被关闭
      timerRef.current = setInterval(() => {
        if (popup.closed) {
          cleanup();
          onClose?.();
        }
      }, 500);

      return popup;
    },
    [cleanup]
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { openPopup, cleanup };
}

// 用于 popup 回调页面发送消息
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
