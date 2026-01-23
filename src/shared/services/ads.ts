import { AdsenseProvider, AdsManager } from '@/extensions/ads';
import { Configs, getAllConfigs } from '@/shared/models/config';

/**
 * get ads manager with configs
 */
export function getAdsManagerWithConfigs(configs: Configs) {
  const ads = new AdsManager();

  // adsense
  if (configs.adsense_code) {
    ads.addProvider(new AdsenseProvider({ adId: configs.adsense_code }));
  }

  return ads;
}

/**
 * get ads service instance
 */
export async function getAdsService(): Promise<AdsManager> {
  const configs = await getAllConfigs();
  return getAdsManagerWithConfigs(configs);
}
