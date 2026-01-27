import { ReactNode } from 'react';
import Script from 'next/script';

import { AdsConfigs, AdsProvider } from '@/extensions/ads';

/**
 * Google adsense configs
 */
export interface AdsenseConfigs extends AdsConfigs {
  adId: string;
}

/**
 * Google adsense provider
 * @website https://adsense.google.com/
 */
export class AdsenseProvider implements AdsProvider {
  readonly name = 'adsense';

  configs: AdsenseConfigs;

  constructor(configs: AdsenseConfigs) {
    this.configs = configs;
  }

  getHeadScripts(): ReactNode {
    return (
      // Avoid third-party scripts mutating the DOM before React hydration.
      <Script
        id={`${this.name}-script`}
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.configs.adId}`}
        strategy="afterInteractive"
        async
        crossOrigin="anonymous"
      />
    );
  }

  getBodyScripts(): ReactNode {
    return null;
  }

  getMetaTags(): ReactNode {
    return (
      <meta
        key={this.name}
        name="google-adsense-account"
        content={this.configs.adId}
      />
    );
  }
}
