'use client';

import { useEffect, useState } from 'react';
import { generateVisitorId, getVisitorInfo } from '@/shared/lib/fingerprint';

/**
 * 使用访客 ID 的 React Hook
 * 
 * 特性：
 * - 自动生成稳定的访客 ID
 * - 跨浏览器共享（通过服务端 Cookie）
 * - 自动同步到服务端
 * 
 * @param syncToServer 是否同步到服务端（默认 true）
 * @returns 访客 ID 和加载状态
 */
export function useVisitorId(syncToServer = true) {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initVisitorId() {
      try {
        setIsLoading(true);

        // 生成客户端访客 ID
        const clientId = await generateVisitorId();

        if (!mounted) return;

        if (syncToServer) {
          // 同步到服务端
          const visitorInfo = await getVisitorInfo();
          const response = await fetch('/api/visitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visitorInfo),
          });

          if (response.ok) {
            const data = await response.json();
            if (mounted && data.success) {
              setVisitorId(data.visitorId);
            }
          } else {
            // 服务端同步失败，使用客户端 ID
            if (mounted) {
              setVisitorId(clientId);
            }
          }
        } else {
          // 不同步到服务端，直接使用客户端 ID
          if (mounted) {
            setVisitorId(clientId);
          }
        }
      } catch (err) {
        console.error('Failed to initialize visitor ID:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initVisitorId();

    return () => {
      mounted = false;
    };
  }, [syncToServer]);

  return { visitorId, isLoading, error };
}
