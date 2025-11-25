import { createHash } from 'crypto';

/**
 * Hash fingerprint for storage
 */
export function hashFingerprint(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex');
}

/**
 * Generate guest ID from fingerprint
 */
export function generateGuestId(fingerprint: string): string {
  const hash = hashFingerprint(fingerprint);
  // Use first 16 chars of hash for guest ID
  return hash.substring(0, 16);
}

/**
 * Generate temporary email for guest user
 */
export function generateGuestEmail(guestId: string): string {
  return `guest_${guestId}@temp.local`;
}

/**
 * Generate temporary password for guest user
 * This password should be deterministic based on the guest ID so we can sign in again if needed
 * In a real scenario, we might want to store this securely or use a better mechanism,
 * but for a guest account derived from device fingerprint, this allows "logging back in"
 * from the same device without storing credentials on the client.
 */
export function generateGuestPassword(guestId: string): string {
  return createHash('sha256').update(`guest_pwd_${guestId}_secret`).digest('hex').substring(0, 8);
}

/**
 * Check if email is a guest email
 */
export function isGuestEmail(email: string): boolean {
  return email.startsWith('guest_') && email.endsWith('@temp.local');
}

/**
 * Extract guest ID from guest email
 */
export function extractGuestIdFromEmail(email: string): string | null {
  if (!isGuestEmail(email)) {
    return null;
  }
  const match = email.match(/^guest_([a-f0-9]+)@temp\.local$/);
  return match ? match[1] : null;
}
