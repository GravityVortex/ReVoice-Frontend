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

function PaymentMethodPills({
  productId,
  options,
  primaryProvider,
  label,
  disabled,
  onPay,
}: {
  productId: string;
  options: PaymentProviderOption[];
  primaryProvider: PaymentProviderName;
  label?: string;
  disabled: boolean;
  onPay: (provider: PaymentProviderName) => void;
}) {
  const alternatives = options.filter((p) => p.name !== primaryProvider);
  if (alternatives.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {label ? (
        <div className="text-left text-[11px] font-medium text-white/50">
          {label}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {alternatives.map((provider) => (
          <button
            key={`${productId}-${provider.name}`}
            type="button"
            disabled={disabled}
            onClick={() => onPay(provider.name)}
            className={cn(
              'group inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5',
              'text-xs font-semibold text-white/70 transition-colors',
              'hover:border-white/20 hover:bg-black/35 hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15',
              disabled && 'pointer-events-none opacity-60'
            )}
            aria-label={`Pay with ${provider.title}`}
          >
            <span className="relative inline-flex size-5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-white/5 opacity-0 blur-sm transition-opacity group-hover:opacity-100" />
              <Image
                src={provider.iconUrl}
                alt=""
                width={16}
                height={16}
                className="relative z-10 rounded-full opacity-90"
              />
            </span>
            <span className="leading-none">{provider.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

  const getAvailablePaymentProviders = (item: PricingItem) => {
    const allowed = item.payment_providers;
    const isAllowed = (provider: PaymentProviderName) =>
      !allowed || allowed.length === 0 || allowed.includes(provider);

    const result: PaymentProviderOption[] = [];

    if (configs.stripe_enabled === 'true' && isAllowed('stripe')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'stripe')!);
    }
    if (configs.paypal_enabled === 'true' && isAllowed('paypal')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'paypal')!);
    }
    if (configs.creem_enabled === 'true' && isAllowed('creem')) {
      result.push(PAYMENT_PROVIDER_OPTIONS.find((p) => p.name === 'creem')!);
    }

    return result;
  };

  const rememberPreferredProvider = (provider: PaymentProviderName) => {
    setPreferredPaymentProvider(provider);
    try {
      window.localStorage.setItem('preferred_payment_provider', provider);
    } catch {
      // ignore
    }
  };

  const getPrimaryProviderForItem = (
    options: PaymentProviderOption[]
  ): PaymentProviderName | null => {
    if (options.length === 0) return null;

    const normalizedDefault = (configs.default_payment_provider || '').toLowerCase();

    const candidates = [
      configs.select_payment_enabled === 'true' ? preferredPaymentProvider : null,
      normalizedDefault as PaymentProviderName,
    ].filter(Boolean) as PaymentProviderName[];

    for (const candidate of candidates) {
      if (options.some((p) => p.name === candidate)) {
        return candidate;
      }
    }

    return options[0].name;
  };

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

  const visibleItems =
    pricing.items?.filter((item) => !item.group || item.group === group) ?? [];

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
      className={cn('py-24 md:py-36', pricing.className, className)}
    >
      <div className="mx-auto mb-12 px-4 text-center md:px-8">
        {pricing.sr_only_title && (
          <h1 className="sr-only">{pricing.sr_only_title}</h1>
        )}
        <h2 className="mb-6 text-3xl font-bold text-pretty lg:text-4xl">
          {pricing.title}
        </h2>
        <p className="text-muted-foreground mx-auto mb-4 max-w-xl lg:max-w-none lg:text-lg">
          {pricing.description}
        </p>
      </div>

      <div className="container">
        {pricing.groups && pricing.groups.length > 0 && (
          <div className="mx-auto mt-8 mb-8 flex w-full justify-center">
            <div className="inline-flex items-center rounded-xl border border-[rgba(255,255,255,0.1)] bg-black/20 p-1.5 backdrop-blur-md">
              {pricing.groups.map((item, i) => {
                const isActive = group === (item.name || '');
                return (
                  <div key={i} className="flex items-center relative">
                    {i > 0 && <div className="mx-1 h-6 w-px bg-white/10" />}
                    <button
                      onClick={() => setGroup(item.name || '')}
                      className={cn(
                        "relative z-10 flex min-w-[100px] items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors duration-300",
                        isActive
                          ? "text-white"
                          : "text-muted-foreground hover:text-white"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="group-active"
                          className="absolute inset-0 z-[-1] rounded-lg bg-white/10 border border-white/20 backdrop-blur-md shadow-lg shadow-black/5"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-10">{item.title}</span>
                      {item.label && (
                        <span className="relative z-10 ml-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)] backdrop-blur-sm">
                          {item.label}
                        </span>
                      )}
                    </button>
                  </div>
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
	            const availableProviders =
	              getAvailablePaymentProviders(displayedItem);
	            const primaryProvider = getPrimaryProviderForItem(availableProviders);
	            const primaryProviderMeta = primaryProvider
	              ? availableProviders.find((p) => p.name === primaryProvider) || null
	              : null;

	            return (
	              <Card key={item.product_id || idx} className="relative flex flex-col h-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-black/20 backdrop-blur-md">
                {item.label && (
                  <div className="absolute -top-4 left-0 right-0 mx-auto w-fit">
                    <span className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-background px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                      <Zap className="size-3.5 fill-purple-300" />
                      {item.label}
                    </span>
                  </div>
                )}

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

                    <div className="block text-2xl font-semibold leading-none">
                      <span className="text-primary">
                        {displayedItem.price}
                      </span>{' '}
                      {displayedItem.unit ? (
                        <span className="text-muted-foreground text-sm font-normal">
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
                      className="mt-4 h-9 w-full px-4 py-2"
                      disabled
                    >
                      <span className="hidden text-sm md:block">
                        {t('current_plan')}
                      </span>
                    </Button>
	                  ) : (
	                    <Button
	                      onClick={() => {
	                        if (!primaryProvider) return;
	                        handleCheckout(displayedItem, primaryProvider);
	                      }}
	                      disabled={isLoading || !primaryProvider}
	                      className={cn(
	                        'focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
	                        'mt-4 h-9 w-full px-4 py-2',
	                        'bg-primary text-primary-foreground hover:bg-primary/90 border-[0.5px] border-[rgba(255,255,255,0.25)] shadow-md shadow-black/20'
	                      )}
	                    >
	                      {isLoading && item.product_id === productId ? (
	                        <>
	                          <Loader2 className="size-4 animate-spin" />
	                          <span className="block">{t('processing')}</span>
	                        </>
	                      ) : (
	                        <div className="flex w-full items-center gap-2">
	                          {item.button?.icon ? (
	                            <SmartIcon
	                              name={item.button?.icon as string}
	                              className="size-4"
	                            />
	                          ) : null}

	                          <span className="block flex-1 text-left">
	                            {item.button?.title}
	                          </span>

	                          {primaryProviderMeta ? (
	                            <span
	                              className={cn(
	                                'ml-auto inline-flex items-center gap-1 rounded-full',
	                                'border border-white/15 bg-white/10 px-2 py-1',
	                                'text-[11px] font-semibold text-white/85'
	                              )}
	                            >
	                              <Image
	                                src={primaryProviderMeta.iconUrl}
	                                alt=""
	                                width={14}
	                                height={14}
	                                className="rounded-full opacity-90"
	                              />
	                              <span className="leading-none">
	                                {primaryProviderMeta.title}
	                              </span>
	                            </span>
	                          ) : null}
	                        </div>
	                      )}
	                    </Button>
	                  )}

	                  {!isCurrentPlan &&
	                  configs.select_payment_enabled === 'true' &&
	                  primaryProvider ? (
	                    <PaymentMethodPills
	                      productId={item.product_id}
	                      options={availableProviders}
	                      primaryProvider={primaryProvider}
	                      label={t('payment_methods')}
	                      disabled={isLoading}
	                      onPay={(provider) => {
	                        rememberPreferredProvider(provider);
	                        handleCheckout(displayedItem, provider);
	                      }}
	                    />
	                  ) : null}
	                </CardHeader>

                <CardContent className="space-y-4 flex-1">
                  <hr className="border-dashed" />

                  {item.features_title && (
                    <p className="text-sm font-medium">{item.features_title}</p>
                  )}
                  <ul className="list-outside space-y-3 text-sm">
                    {item.features?.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <Check className="size-3" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

	    </section>
	  );
	}
