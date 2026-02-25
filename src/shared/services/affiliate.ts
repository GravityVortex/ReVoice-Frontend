import {
  AffiliateManager,
  AffonsoAffiliateProvider,
  PromoteKitAffiliateProvider,
} from '@/extensions/affiliate';
import { Configs, getAllConfigs } from '@/shared/models/config';

/**
 * get affiliate manager with configs
 */
export function getAffiliateManagerWithConfigs(configs: Configs) {
  const affiliateManager: AffiliateManager = new AffiliateManager();

  // affonso
  if (configs.affonso_enabled === 'true' && configs.affonso_id) {
    const cookieDurationRaw = Number(configs.affonso_cookie_duration);
    const cookieDuration =
      Number.isFinite(cookieDurationRaw) && cookieDurationRaw > 0
        ? cookieDurationRaw
        : 30;

    affiliateManager.addProvider(
      new AffonsoAffiliateProvider({
        affonsoId: configs.affonso_id,
        cookieDuration,
      })
    );
  }

  // promotekit
  if (configs.promotekit_enabled === 'true' && configs.promotekit_id) {
    affiliateManager.addProvider(
      new PromoteKitAffiliateProvider({ promotekitId: configs.promotekit_id })
    );
  }

  return affiliateManager;
}

/**
 * get affiliate service instance
 */
export async function getAffiliateService(): Promise<AffiliateManager> {
  const configs = await getAllConfigs();
  return getAffiliateManagerWithConfigs(configs);
}
