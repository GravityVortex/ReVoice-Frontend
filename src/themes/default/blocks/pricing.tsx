'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Zap } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SmartIcon } from '@/shared/blocks/common';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

import { useAppContext } from '@/shared/contexts/app';
import { useSignInRedirect } from '@/shared/hooks/use-sign-in-redirect';
import { getCookie } from '@/shared/lib/cookie';
import { cn } from '@/shared/lib/utils';
import { Subscription } from '@/shared/models/subscription';
import {
  PricingCurrency,
  PricingItem,
  Pricing as PricingType,
} from '@/shared/types/blocks/pricing';

function currencySymbol(code: string) {
  switch (code.toUpperCase()) {
    case 'USD':
      return '$';
    case 'CNY':
      return '¥';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return '';
  }
}

// Helper function to get all available currencies from a pricing item
function getCurrenciesFromItem(item: PricingItem | null): PricingCurrency[] {
  if (!item) return [];

  // Always include the default currency first
  const defaultCurrency: PricingCurrency = {
    currency: item.currency,
    amount: item.amount,
    price: item.price || '',
    original_price: item.original_price || '',
    payment_product_id: item.payment_product_id,
    payment_providers: item.payment_providers,
  };

  // Add additional currencies if available
  if (item.currencies && item.currencies.length > 0) {
    return [defaultCurrency, ...item.currencies];
  }

  return [defaultCurrency];
}

// Helper function to select initial currency based on locale
function getInitialCurrency(
  currencies: PricingCurrency[],
  locale: string,
  defaultCurrency: string
): string {
  if (currencies.length === 0) return defaultCurrency;

  // If locale is 'zh', prefer CNY
  if (locale === 'zh') {
    const cnyCurrency = currencies.find(
      (c) => c.currency.toLowerCase() === 'cny'
    );
    if (cnyCurrency) {
      return cnyCurrency.currency;
    }
  }

  // Otherwise return default currency
  return defaultCurrency;
}

type PaymentProviderName = 'stripe' | 'creem' | 'paypal';

type PaymentProviderOption = {
  name: PaymentProviderName;
  title: string;
  iconUrl: string;
};

const PAYMENT_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  { name: 'stripe', title: 'Stripe', iconUrl: '/imgs/icons/stripe.png' },
  { name: 'paypal', title: 'PayPal', iconUrl: '/imgs/icons/paypal.svg' },
  { name: 'creem', title: 'Creem', iconUrl: '/imgs/icons/creem.png' },
];

// Dropdown imports removed



function CurrencySwitch({
  productId,
  currencies,
  selectedCurrency,
  onSelect,
}: {
  productId: string;
  currencies: PricingCurrency[];
  selectedCurrency: string;
  onSelect: (currency: string) => void;
}) {
  if (currencies.length <= 1) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Currency"
      className={cn(
        'ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md'
      )}
    >
      {currencies.map((currency) => {
        const code = currency.currency.toUpperCase();
        const isActive =
          selectedCurrency.toUpperCase() === currency.currency.toUpperCase();
        const symbol = currencySymbol(code);

        return (
          <button
            key={currency.currency}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(currency.currency)}
            className={cn(
              'relative isolate inline-flex items-center gap-1 rounded-full px-2.5 py-1',
              'text-[11px] font-semibold tracking-wide transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
              isActive ? 'text-white' : 'text-white/60 hover:text-white'
            )}
          >
            {isActive && (
              <motion.div
                layoutId={`currency-active-${productId}`}
                className={cn(
                  'absolute inset-0 -z-10 rounded-full',
                  'bg-gradient-to-b from-white/20 to-white/8 ring-1 ring-white/15',
                  'shadow-[0_10px_22px_rgba(0,0,0,0.35)]'
                )}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.55 }}
              />
            )}

            {symbol ? (
              <span className="text-[12px] leading-none text-white/80">
                {symbol}
              </span>
            ) : null}
            <span className="leading-none">{code}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Pricing({
  pricing,
  className,
  currentSubscription,
}: {
  pricing: PricingType;
  className?: string;
  currentSubscription?: Subscription;
}) {
  const locale = useLocale();
  const t = useTranslations('pricing.page');
  const {
    user,
    configs,
  } = useAppContext();
  const redirectToSignIn = useSignInRedirect('/pricing');

  const [group, setGroup] = useState(() => {
    // find current pricing item
    const currentItem = pricing.items?.find(
      (i) => i.product_id === currentSubscription?.productId
    );

    // First look for a group with is_featured set to true
    const featuredGroup = pricing.groups?.find((g) => g.is_featured);
    // If no featured group exists, fall back to the first group
    return (
      currentItem?.group || featuredGroup?.name || pricing.groups?.[0]?.name
    );
  });

  const [isLoading, setIsLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [preferredPaymentProvider, setPreferredPaymentProvider] =
    useState<PaymentProviderName | null>(null);
  const [globalProvider, setGlobalProvider] = useState<PaymentProviderName | null>(null);

  // Currency state management for each item
  // Store selected currency and displayed item for each product_id
  const [itemCurrencies, setItemCurrencies] = useState<
    Record<string, { selectedCurrency: string; displayedItem: PricingItem }>
  >({});

  // Initialize currency states for all items
  useEffect(() => {
    if (pricing.items && pricing.items.length > 0) {
      const initialCurrencyStates: Record<
        string,
        { selectedCurrency: string; displayedItem: PricingItem }
      > = {};

      pricing.items.forEach((item) => {
        const currencies = getCurrenciesFromItem(item);
        const selectedCurrency = getInitialCurrency(
          currencies,
          locale,
          item.currency
        );

        // Create displayed item with selected currency
        const currencyData = currencies.find(
          (c) => c.currency.toLowerCase() === selectedCurrency.toLowerCase()
        );

        const displayedItem = currencyData
          ? {
            ...item,
            currency: currencyData.currency,
            amount: currencyData.amount,
            price: currencyData.price,
            original_price: currencyData.original_price,
            // Override with currency-specific payment settings if available
            payment_product_id:
              currencyData.payment_product_id || item.payment_product_id,
            payment_providers:
              currencyData.payment_providers || item.payment_providers,
          }
          : item;

        initialCurrencyStates[item.product_id] = {
          selectedCurrency,
          displayedItem,
        };
      });

      setItemCurrencies(initialCurrencyStates);
    }
  }, [pricing.items, locale]);

  // Handler for currency change
  const handleCurrencyChange = (productId: string, currency: string) => {
    const item = pricing.items?.find((i) => i.product_id === productId);
    if (!item) return;

    const currencies = getCurrenciesFromItem(item);
    const currencyData = currencies.find(
      (c) => c.currency.toLowerCase() === currency.toLowerCase()
    );

    if (currencyData) {
      const displayedItem = {
        ...item,
        currency: currencyData.currency,
        amount: currencyData.amount,
        price: currencyData.price,
        original_price: currencyData.original_price,
        // Override with currency-specific payment settings if available
        payment_product_id:
          currencyData.payment_product_id || item.payment_product_id,
        payment_providers:
          currencyData.payment_providers || item.payment_providers,
      };

      setItemCurrencies((prev) => ({
        ...prev,
        [productId]: {
          selectedCurrency: currency,
          displayedItem,
        },
      }));
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('preferred_payment_provider');
      if (!raw) return;
      const normalized = raw.toLowerCase() as PaymentProviderName;
      if (PAYMENT_PROVIDER_OPTIONS.some((p) => p.name === normalized)) {
        setPreferredPaymentProvider(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  const getAffiliateMetadata = ({
    paymentProvider,
  }: {
    paymentProvider: string;
  }) => {
    const affiliateMetadata: Record<string, string> = {};

    // get Affonso referral
    if (
      configs.affonso_enabled === 'true' &&
      ['stripe', 'creem'].includes(paymentProvider)
    ) {
      const affonsoReferral = getCookie('affonso_referral') || '';
      affiliateMetadata.affonso_referral = affonsoReferral;
    }

    // get PromoteKit referral
    if (
      configs.promotekit_enabled === 'true' &&
      ['stripe'].includes(paymentProvider)
    ) {
      const promotekitReferral =
        typeof window !== 'undefined' && (window as any).promotekit_referral
          ? (window as any).promotekit_referral
          : getCookie('promotekit_referral') || '';
      affiliateMetadata.promotekit_referral = promotekitReferral;
    }

    return affiliateMetadata;
  };

  const getAvailablePaymentProviders = (items: PricingItem[]) => {
    const isAllowedByAll = (provider: PaymentProviderName) =>
      items.every((item) => !item.payment_providers || item.payment_providers.length === 0 || item.payment_providers.includes(provider));

    const result: PaymentProviderOption[] = [];

    if (configs.stripe_enabled === 'true' && isAllowedByAll('stripe')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'stripe')!);
    }
    if (configs.paypal_enabled === 'true' && isAllowedByAll('paypal')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'paypal')!);
    }
    if (configs.creem_enabled === 'true' && isAllowedByAll('creem')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'creem')!);
    }

    return result;
  };

  const rememberPreferredProvider = (provider: PaymentProviderName) => {
    setPreferredPaymentProvider(provider);
    setGlobalProvider(provider);
    try {
      window.localStorage.setItem('preferred_payment_provider', provider);
    } catch {
      // ignore
    }
  };

  const visibleItems =
    pricing.items?.filter((item) => !item.group || item.group === group) ?? [];

  const availableGlobalProviders = getAvailablePaymentProviders(visibleItems);

  useEffect(() => {
    if (availableGlobalProviders.length > 0) {
      const normalizedDefault = (configs.default_payment_provider || '').toLowerCase();
      let initial: PaymentProviderName | null = null;

      const candidates = [
        configs.select_payment_enabled === 'true' ? preferredPaymentProvider : null,
        normalizedDefault as PaymentProviderName,
      ].filter(Boolean) as PaymentProviderName[];

      for (const candidate of candidates) {
        if (availableGlobalProviders.some((p) => p.name === candidate)) {
          initial = candidate;
          break;
        }
      }

      setGlobalProvider(initial || availableGlobalProviders[0].name);
    }
  }, [availableGlobalProviders.length, preferredPaymentProvider, configs.default_payment_provider, configs.select_payment_enabled]);

  const handleCheckout = async (
    item: PricingItem,
    paymentProvider?: string
  ) => {
    try {
      if (!user) {
        redirectToSignIn();
        return;
      }

      const affiliateMetadata = getAffiliateMetadata({
        paymentProvider: paymentProvider || '',
      });

      const params = {
        product_id: item.product_id,
        currency: item.currency,
        locale: locale || 'en',
        payment_provider: paymentProvider || '',
        metadata: affiliateMetadata,
      };

      setIsLoading(true);
      setProductId(item.product_id);

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (response.status === 401) {
        setIsLoading(false);
        setProductId(null);
        redirectToSignIn();
        return;
      }

      if (!response.ok) {
        throw new Error(`request failed with status ${response.status}`);
      }

      const { code, message, data } = await response.json();
      if (code !== 0) {
        throw new Error(message);
      }

      const { checkoutUrl } = data;
      if (!checkoutUrl) {
        throw new Error('checkout url not found');
      }

      window.location.href = checkoutUrl;
    } catch (e: any) {
      console.log('checkout failed: ', e);
      toast.error('checkout failed: ' + e.message);

      setIsLoading(false);
      setProductId(null);
    }
  };

  useEffect(() => {
    if (pricing.items) {
      const featuredItem = pricing.items.find((i) => i.is_featured);
      setProductId(featuredItem?.product_id || pricing.items[0]?.product_id);
      setIsLoading(false);
    }
  }, [pricing.items]);

  const mdGridColsClass =
    visibleItems.length <= 1
      ? 'md:grid-cols-1'
      : visibleItems.length === 2
        ? 'md:grid-cols-2'
        : visibleItems.length === 3
          ? 'md:grid-cols-3'
          : 'md:grid-cols-4';
  return (
    <section
      id={pricing.id}
      className={cn(
        'relative isolate overflow-hidden py-24 md:py-36',
        pricing.className,
        className
      )}
    >
      {/* Background Ambience - Vozo Style Radial Glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[800px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[80px] opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>

      <div className="mx-auto mb-12 px-4 text-center md:px-8">
        {pricing.sr_only_title && (
          <h1 className="sr-only">{pricing.sr_only_title}</h1>
        )}
        <h2 className="mb-5 text-balance font-sans text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl text-white">
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">
            {pricing.title}
          </span>
        </h2>
        <div className="mx-auto mb-8 max-w-2xl flex flex-col items-center gap-4">
          {(pricing.description || '').split('\n').filter(Boolean).map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-xl md:text-2xl text-white/90 font-medium leading-snug"
                  : "text-sm md:text-base text-white/50 max-w-xl leading-relaxed"
              }
            >
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="container">
        {pricing.groups && pricing.groups.length > 0 && (
          <div className="mx-auto mt-8 mb-4 flex w-full justify-center">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
              {pricing.groups.map((item, i) => {
                const isActive = group === (item.name || '');
                return (
                  <button
                    key={i}
                    onClick={() => setGroup(item.name || '')}
                    className={cn(
                      "relative z-10 flex min-w-[100px] items-center justify-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-colors duration-300",
                      isActive
                        ? "text-white"
                        : "text-white/60 hover:text-white"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="group-active"
                        className="absolute inset-0 z-[-1] rounded-full bg-white/10 backdrop-blur-md"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10">{item.title}</span>
                    {item.label && (
                      <span className="relative z-10 ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                        <span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                          {item.label}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Global Payment Provider Selector */}
        {availableGlobalProviders.length > 1 && (
          <div className="mx-auto mb-8 flex w-full justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
              {availableGlobalProviders.map((provider) => {
                const isActive = provider.name === globalProvider;
                return (
                  <button
                    key={provider.name}
                    onClick={() => rememberPreferredProvider(provider.name)}
                    className={cn(
                      "relative flex h-10 w-32 items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-300",
                      isActive
                        ? "bg-primary/20 text-white shadow-[0_0_15px_-3px_rgba(var(--primary-rgb),0.3)]"
                        : "text-white/50 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Image
                      src={provider.iconUrl}
                      alt={provider.title}
                      width={16}
                      height={16}
                      className={cn("rounded-sm transition-all duration-300", !isActive && "opacity-50 grayscale", isActive && "opacity-100 grayscale-0")}
                    />
                    <span>{provider.title}</span>
                    {isActive && (
                      <motion.div
                        layoutId="global-provider-indicator"
                        className="absolute inset-0 z-auto rounded-full border border-primary pointer-events-none"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={cn('mt-0 grid w-full gap-6', mdGridColsClass)}>
          {visibleItems.map((item: PricingItem, idx) => {

            let isCurrentPlan = false;
            if (
              currentSubscription &&
              currentSubscription.productId === item.product_id
            ) {
              isCurrentPlan = true;
            }

            // Get currency state for this item
            const currencyState = itemCurrencies[item.product_id];
            const displayedItem = currencyState?.displayedItem || item;
            const selectedCurrency =
              currencyState?.selectedCurrency || item.currency;
            const currencies = getCurrenciesFromItem(item);

            const isFeatured = Boolean(item.is_featured);
            return (
              <div key={item.product_id || idx} className="relative h-full">
                {item.label && (
                  <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-xl shadow-lg shadow-primary/20">
                      <span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                        {item.label}
                      </span>
                    </span>
                  </div>
                )}

                <Card
                  className={cn(
                    'relative flex h-full flex-col overflow-hidden rounded-3xl border backdrop-blur-xl transition-all duration-300',
                    'hover:border-primary/50 hover:shadow-[0_0_40px_-10px_rgba(var(--primary-rgb),0.3)]',
                    isFeatured
                      ? 'border-primary/50 bg-gradient-to-b from-primary/10 via-white/5 to-transparent shadow-[0_0_40px_-10px_rgba(var(--primary-rgb),0.3)]'
                      : 'border-white/10 bg-white/5'
                  )}
                >

                  <CardHeader className="flex-none">
                    <CardTitle className="font-medium">
                      <h3 className="text-sm font-medium">{item.title}</h3>
                    </CardTitle>

                    <div className="my-3 flex items-center gap-3">
                      {displayedItem.original_price && (
                        <span className="text-muted-foreground text-sm line-through">
                          {displayedItem.original_price}
                        </span>
                      )}

                      <div className="block text-4xl font-bold leading-none tracking-tight text-white">
                        <span>
                          {displayedItem.price}
                        </span>{' '}
                        {displayedItem.unit ? (
                          <span className="text-white/50 text-base font-normal">
                            {displayedItem.unit}
                          </span>
                        ) : (
                          ''
                        )}
                      </div>

                      <CurrencySwitch
                        productId={item.product_id}
                        currencies={currencies}
                        selectedCurrency={selectedCurrency}
                        onSelect={(currency) =>
                          handleCurrencyChange(item.product_id, currency)
                        }
                      />
                    </div>

                    <CardDescription className="text-sm">
                      {item.description}
                    </CardDescription>
                    {item.tip && (
                      <span className="text-muted-foreground text-sm">
                        {item.tip}
                      </span>
                    )}

                    {isCurrentPlan ? (
                      <Button
                        variant="outline"
                        className="mt-6 h-12 w-full rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        disabled
                      >
                        <span className="text-sm font-medium">
                          {t('current_plan')}
                        </span>
                      </Button>
                    ) : globalProvider ? (
                      <Button
                        onClick={() => handleCheckout(displayedItem, globalProvider)}
                        disabled={isLoading}
                        className={cn(
                          'mt-6 w-full h-12 transition-all duration-300 rounded-full font-bold',
                          isFeatured
                            ? 'bg-white text-black hover:bg-white/90 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] border-none'
                            : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20'
                        )}
                      >
                        {isLoading && item.product_id === productId ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            <span>Processing...</span>
                          </div>
                        ) : (
                          <span>{item.button?.title || 'Buy Now'}</span>
                        )}
                      </Button>
                    ) : null}
                  </CardHeader>

                  <CardContent className="space-y-4 flex-1">
                    <hr className="border-dashed" />

                    {item.features_title && (
                      <p className="text-sm font-medium">{item.features_title}</p>
                    )}
                    <ul className="list-outside space-y-3 text-sm">
                      {item.features?.map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-white/70">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Check className="size-3" />
                          </div>
                          <span className="flex-1">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
}
