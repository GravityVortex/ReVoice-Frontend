
/**
 * Check if the user has access to the SoulDub feature.
 * Access is granted if:
 * 1. The global toggle `souldub_enabled` is explicitly "true".
 * 2. OR the user's email is present in the `souldub_whitelist`.
 *
 * @param userEmail - The email address of the user.
 * @param configs - The system configurations object.
 * @returns boolean indicating if access is granted.
 */
export function checkSoulDubAccess(
    userEmail: string | undefined | null,
    configs: Record<string, string>,
    isAdmin: boolean = false
): boolean {
    // 0. Admins always have access
    if (isAdmin) {
        return true;
    }

    // 1. Check global toggle
    if (configs['souldub_enabled'] === 'true') {
        return true;
    }

    // 2. Check whitelist (if user is logged in)
    const normalizedEmail = userEmail?.trim().toLowerCase();
    if (normalizedEmail) {
        const whitelistStr = (configs['souldub_whitelist'] || '').trim();
        // Normalize: split by common separators (commas/newlines/spaces), trim, remove empties
        const whitelist = whitelistStr
            .split(/[,\s]+/)
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.length > 0);

        if (whitelist.includes(normalizedEmail)) {
            return true;
        }
    }

    return false;
}
