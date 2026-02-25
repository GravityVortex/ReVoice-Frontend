'use client';

import { useAppContext } from '@/shared/contexts/app';
import { LoadingOverlay } from '@/shared/components/ui/loading-overlay';
import { useEffect, useState } from 'react';

export function AppLoader() {
    const { isCheckSign } = useAppContext();
    const [show, setShow] = useState(false);

    useEffect(() => {
        let timeout: NodeJS.Timeout | undefined;
        if (isCheckSign) {
            setShow(true);
            return;
        }

        // Small delay before hiding to avoid flicker on fast auth checks.
        timeout = setTimeout(() => setShow(false), 200);
        return () => clearTimeout(timeout);
    }, [isCheckSign]);

    if (!show) return null;

    return <LoadingOverlay message="Verifying session..." />;
}
