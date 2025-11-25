'use client';

import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise: Promise<any> | null = null;

/**
 * Initialize and get fingerprint agent
 */
export async function getFingerprintAgent() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

/**
 * Generate device fingerprint
 * Returns a unique hash based on browser/device characteristics
 */
export async function generateFingerprint(): Promise<string> {
  try {
    const fp = await getFingerprintAgent();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error('Failed to generate fingerprint:', error);
    // Fallback to a random ID if fingerprinting fails
    return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Get browser metadata for storage
 */
export function getBrowserMetadata() {
  if (typeof window === 'undefined') {
    return null;
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}
