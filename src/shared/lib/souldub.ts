
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
    configs: Record<string, string>
): boolean {
    // 1. Check global toggle
    if (configs['souldub_enabled'] === 'true') {
        return true;
    }

    // 2. Check whitelist (if user is logged in)
    if (userEmail) {
        const whitelistStr = configs['souldub_whitelist'] || '';
        // Normalize: split by comma, trim whitespace, remove empty entries
        const whitelist = whitelistStr
            .split(',')
            .map((email) => email.trim())
            .filter((email) => email.length > 0);

        if (whitelist.includes(userEmail.trim())) {
            return true;
        }
    }

    return false;
}
