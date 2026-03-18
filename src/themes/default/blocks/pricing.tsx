'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { useAppContext } from '@/shared/contexts/app';
import { useSignInRedirect } from '@/shared/hooks/use-sign-in-redirect';
import { getCookie } from '@/shared/lib/cookie';
import { cn } from '@/shared/lib/utils';
import { Subscription } from '@/shared/models/subscription';
import { PricingCurrency, PricingItem, Pricing as PricingType } from '@/shared/types/blocks/pricing';

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

function getCurrenciesFromItem(item: PricingItem | null): PricingCurrency[] {
  if (!item) return [];

  const defaultCurrency: PricingCurrency = {
    currency: item.currency,
    amount: item.amount,
    price: item.price || '',
    original_price: item.original_price || '',
    payment_product_id: item.payment_product_id,
    payment_providers: item.payment_providers,
  };

  if (item.currencies && item.currencies.length > 0) {
    return [defaultCurrency, ...item.currencies];
  }

  return [defaultCurrency];
}

function getInitialCurrency(currencies: PricingCurrency[], locale: string, defaultCurrency: string): string {
  if (currencies.length === 0) return defaultCurrency;

  if (locale === 'zh') {
    const cnyCurrency = currencies.find((currency) => currency.currency.toLowerCase() === 'cny');
    if (cnyCurrency) {
      return cnyCurrency.currency;
    }
  }

  return defaultCurrency;
}

type PaymentProviderName = 'stripe' | 'creem' | 'paypal';

type PaymentProviderOption = {
  name: PaymentProviderName;
  title: string;
  iconUrl: string;
};

const PAYMENT_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  {
    name: 'stripe',
    title: 'Stripe',
    iconUrl: '/imgs/icons/stripe.png',
  },
  {
    name: 'paypal',
    title: 'PayPal',
    iconUrl: '/imgs/icons/paypal.svg',
  },
  {
    name: 'creem',
    title: 'Creem',
    iconUrl: '/imgs/icons/creem.png',
  },
];

function normalizePaymentProvider(value?: string | null): PaymentProviderName | null {
  const normalized = value?.toLowerCase();

  if (normalized && PAYMENT_PROVIDER_OPTIONS.some((provider) => provider.name === normalized)) {
    return normalized as PaymentProviderName;
  }

  return null;
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
        const isActive = selectedCurrency.toUpperCase() === currency.currency.toUpperCase();
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
              'focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none',
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

            {symbol ? <span className="text-[12px] leading-none text-white/80">{symbol}</span> : null}
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
  activeSubscriptions = [],
}: {
  pricing: PricingType;
  className?: string;
  activeSubscriptions?: Subscription[];
}) {
  const locale = useLocale();
  const t = useTranslations('pricing.page');
  const { user, configs } = useAppContext();
  const redirectToSignIn = useSignInRedirect('/pricing');

  const activeSubProductIds = new Set(activeSubscriptions.map((subscription) => subscription.productId));
  const totalActiveCredits = activeSubscriptions.reduce((sum, subscription) => sum + (subscription.creditsAmount || 0), 0);
  const pricingItemMap = new Map((pricing.items || []).map((item) => [item.product_id, item]));
  const defaultPaymentProvider = normalizePaymentProvider(configs.default_payment_provider);
  const paymentSelectionEnabled = configs.select_payment_enabled === 'true';

  const getLocalizedName = (subscription: Subscription) => {
    const item = subscription.productId ? pricingItemMap.get(subscription.productId) : undefined;
    return item?.product_name || item?.title || subscription.productName || subscription.planName || '';
  };

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCheckoutItem, setPendingCheckoutItem] = useState<PricingItem | null>(null);
  const [pendingCheckoutProvider, setPendingCheckoutProvider] = useState<PaymentProviderName | null>(null);

  const [group, setGroup] = useState(() => {
    const currentItem = pricing.items?.find((item) => activeSubProductIds.has(item.product_id));
    const featuredGroup = pricing.groups?.find((item) => item.is_featured);
    return currentItem?.group || featuredGroup?.name || pricing.groups?.[0]?.name;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [preferredPaymentProvider, setPreferredPaymentProvider] = useState<PaymentProviderName | null>(null);
  const [itemCurrencies, setItemCurrencies] = useState<Record<string, { selectedCurrency: string; displayedItem: PricingItem }>>({});

  useEffect(() => {
    if (!pricing.items || pricing.items.length === 0) {
      return;
    }

    const initialCurrencyStates: Record<string, { selectedCurrency: string; displayedItem: PricingItem }> = {};

    pricing.items.forEach((item) => {
      const currencies = getCurrenciesFromItem(item);
      const selectedCurrency = getInitialCurrency(currencies, locale, item.currency);
      const currencyData = currencies.find((currency) => currency.currency.toLowerCase() === selectedCurrency.toLowerCase());

      const displayedItem = currencyData
        ? {
          ...item,
          currency: currencyData.currency,
          amount: currencyData.amount,
          price: currencyData.price,
          original_price: currencyData.original_price,
          payment_product_id: currencyData.payment_product_id || item.payment_product_id,
          payment_providers: currencyData.payment_providers || item.payment_providers,
        }
        : item;

      initialCurrencyStates[item.product_id] = {
        selectedCurrency,
        displayedItem,
      };
    });

    setItemCurrencies(initialCurrencyStates);
  }, [pricing.items, locale]);

  const handleCurrencyChange = (productId: string, currency: string) => {
    const item = pricing.items?.find((entry) => entry.product_id === productId);
    if (!item) return;

    const currencies = getCurrenciesFromItem(item);
    const currencyData = currencies.find((entry) => entry.currency.toLowerCase() === currency.toLowerCase());

    if (!currencyData) {
      return;
    }

    const displayedItem = {
      ...item,
      currency: currencyData.currency,
      amount: currencyData.amount,
      price: currencyData.price,
      original_price: currencyData.original_price,
      payment_product_id: currencyData.payment_product_id || item.payment_product_id,
      payment_providers: currencyData.payment_providers || item.payment_providers,
    };

    setItemCurrencies((prev) => ({
      ...prev,
      [productId]: {
        selectedCurrency: currency,
        displayedItem,
      },
    }));
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('preferred_payment_provider');
      const normalized = normalizePaymentProvider(raw);
      if (normalized) {
        setPreferredPaymentProvider(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  const getAffiliateMetadata = ({ paymentProvider }: { paymentProvider: string }) => {
    const affiliateMetadata: Record<string, string> = {};

    if (configs.affonso_enabled === 'true' && ['stripe', 'creem'].includes(paymentProvider)) {
      const affonsoReferral = getCookie('affonso_referral') || '';
      affiliateMetadata.affonso_referral = affonsoReferral;
    }

    if (configs.promotekit_enabled === 'true' && paymentProvider === 'stripe') {
      const promotekitReferral =
        typeof window !== 'undefined' && (window as any).promotekit_referral
          ? (window as any).promotekit_referral
          : getCookie('promotekit_referral') || '';
      affiliateMetadata.promotekit_referral = promotekitReferral;
    }

    return affiliateMetadata;
  };

  const isProviderEnabled = (provider: PaymentProviderName) => {
    switch (provider) {
      case 'stripe':
        return configs.stripe_enabled === 'true';
      case 'paypal':
        return configs.paypal_enabled === 'true';
      case 'creem':
        return configs.creem_enabled === 'true';
      default:
        return false;
    }
  };

  const getAvailablePaymentProvidersForItem = (item: PricingItem | null | undefined) => {
    if (!item) return [];

    const allowedProviders = (item.payment_providers || [])
      .map((provider) => normalizePaymentProvider(provider))
      .filter((provider): provider is PaymentProviderName => Boolean(provider));

    return PAYMENT_PROVIDER_OPTIONS.filter((provider) => {
      if (!isProviderEnabled(provider.name)) {
        return false;
      }

      if (allowedProviders.length === 0) {
        return true;
      }

      return allowedProviders.includes(provider.name);
    });
  };

  const pickProvider = (providers: PaymentProviderOption[]) => {
    const candidates = [preferredPaymentProvider, defaultPaymentProvider].filter(Boolean) as PaymentProviderName[];

    for (const candidate of candidates) {
      const matchedProvider = providers.find((provider) => provider.name === candidate);
      if (matchedProvider) {
        return matchedProvider;
      }
    }

    return providers[0] || null;
  };

  const rememberPreferredProvider = (provider: PaymentProviderName) => {
    setPreferredPaymentProvider(provider);
    try {
      window.localStorage.setItem('preferred_payment_provider', provider);
    } catch {
      // ignore
    }
  };

  const visibleItems = pricing.items?.filter((item) => !item.group || item.group === group) ?? [];

  const doCheckout = async (item: PricingItem, paymentProvider?: PaymentProviderName | null) => {
    try {
      if (!user) {
        redirectToSignIn();
        return;
      }

      const resolvedProvider = paymentProvider || pickProvider(getAvailablePaymentProvidersForItem(item))?.name;

      if (!resolvedProvider) {
        toast.error(t('payment_unavailable'));
        return;
      }

      const affiliateMetadata = getAffiliateMetadata({
        paymentProvider: resolvedProvider,
      });

      setIsLoading(true);
      setProductId(item.product_id);

      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: item.product_id,
          currency: item.currency,
          locale: locale || 'en',
          payment_provider: resolvedProvider,
          metadata: affiliateMetadata,
        }),
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
    } catch (error: any) {
      console.log('checkout failed: ', error);
      toast.error('checkout failed: ' + error.message);
      setIsLoading(false);
      setProductId(null);
    }
  };

  const launchCheckout = (item: PricingItem, paymentProvider?: PaymentProviderName | null) => {
    const resolvedProvider = paymentProvider || pickProvider(getAvailablePaymentProvidersForItem(item))?.name || null;

    if (!resolvedProvider) {
      toast.error(t('payment_unavailable'));
      return;
    }

    rememberPreferredProvider(resolvedProvider);

    const isOneTime = item.interval === 'one-time';
    if (!isOneTime && activeSubscriptions.length > 0 && !activeSubProductIds.has(item.product_id)) {
      setPendingCheckoutItem(item);
      setPendingCheckoutProvider(resolvedProvider);
      setShowConfirmDialog(true);
      return;
    }

    doCheckout(item, resolvedProvider);
  };

  const handleCardAction = (item: PricingItem) => {
    const availableProviders = getAvailablePaymentProvidersForItem(item);
    const selectedProvider = pickProvider(availableProviders);
    launchCheckout(item, selectedProvider?.name || null);
  };

  const handleConfirmContinue = () => {
    setShowConfirmDialog(false);
    if (pendingCheckoutItem) {
      doCheckout(pendingCheckoutItem, pendingCheckoutProvider || undefined);
      setPendingCheckoutItem(null);
      setPendingCheckoutProvider(null);
    }
  };

  useEffect(() => {
    if (!pricing.items || pricing.items.length === 0) {
      return;
    }

    const featuredItem = pricing.items.find((item) => item.is_featured);
    setProductId(featuredItem?.product_id || pricing.items[0]?.product_id || null);
    setIsLoading(false);
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
    <section id={pricing.id} className={cn('relative isolate overflow-hidden py-24 md:py-36', pricing.className, className)}>
      <div className="absolute inset-0 -z-10">
        <div className="from-white/[0.04] via-white/[0.01] pointer-events-none absolute top-0 left-1/2 h-[800px] w-[120vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] to-transparent opacity-40 blur-[80px]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] bg-center opacity-30" />
      </div>

      <div className="mx-auto mb-12 px-4 text-center md:px-8">
        {pricing.sr_only_title && <h1 className="sr-only">{pricing.sr_only_title}</h1>}
        <h2 className="mb-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
          <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">{pricing.title}</span>
        </h2>
        <div className="mx-auto mb-8 flex max-w-2xl flex-col items-center gap-4">
          {(pricing.description || '')
            .split('\n')
            .filter(Boolean)
            .map((line, index) => (
              <p
                key={index}
                className={
                  index === 0
                    ? 'text-xl leading-snug font-medium text-white/90 md:text-2xl'
                    : 'max-w-xl text-sm leading-relaxed text-white/50 md:text-base'
                }
              >
                {line}
              </p>
            ))}
        </div>
      </div>

      <div className="container">
        {pricing.groups && pricing.groups.length > 0 && (
          <div className="mx-auto mb-10 flex w-full justify-center">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
              {pricing.groups.map((item, index) => {
                const isActive = group === (item.name || '');
                return (
                  <button
                    key={index}
                    onClick={() => setGroup(item.name || '')}
                    className={cn(
                      'relative z-10 flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300',
                      isActive ? 'text-white' : 'text-white/50 hover:text-white'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="group-active"
                        className="absolute inset-0 z-[-1] rounded-full bg-white/10"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10">{item.title}</span>
                    {item.label && (
                      <span className="relative z-10 ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                        <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">{item.label}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeSubscriptions.length > 0 && (
          <div className="mx-auto mb-8 flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2.5 text-sm text-white/80">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {activeSubscriptions.length === 1
                  ? t('status_bar_single', {
                    plan: getLocalizedName(activeSubscriptions[0]),
                    credits: String(totalActiveCredits),
                  })
                  : t('status_bar_multiple', {
                    count: String(activeSubscriptions.length),
                    credits: String(totalActiveCredits),
                  })}
              </span>
            </div>
            <Link href="/settings/billing" className="text-primary hover:text-primary/80 shrink-0 text-xs font-medium transition-colors">
              {t('manage_subscriptions')} →
            </Link>
          </div>
        )}

        <div className={cn('grid w-full gap-6', mdGridColsClass)}>
          {visibleItems.map((item, index) => {
            const isCurrentPlan = activeSubProductIds.has(item.product_id);
            const currencyState = itemCurrencies[item.product_id];
            const displayedItem = currencyState?.displayedItem || item;
            const selectedCurrency = currencyState?.selectedCurrency || item.currency;
            const currencies = getCurrenciesFromItem(item);
            const isFeatured = Boolean(item.is_featured);
            const availableProviders = getAvailablePaymentProvidersForItem(displayedItem);
            const preferredProvider = pickProvider(availableProviders);
            const canSwitchProvider = paymentSelectionEnabled && availableProviders.length > 1;
            const paymentChoices = canSwitchProvider ? availableProviders : preferredProvider ? [preferredProvider] : [];
            const cardButtonLabel = availableProviders.length > 0 ? item.button?.title || t('buy_now') : t('payment_unavailable');

            return (
              <div key={item.product_id || index} className="relative h-full">
                {item.label && (
                  <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
                    <span className="shadow-primary/20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-bold tracking-wider text-white uppercase shadow-lg backdrop-blur-xl">
                      <Zap className="text-primary size-3" />
                      <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">{item.label}</span>
                    </span>
                  </div>
                )}

                <Card
                  className={cn(
                    'relative flex h-full flex-col overflow-hidden rounded-3xl border backdrop-blur-xl transition-all duration-300',
                    'hover:border-white/20 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.05)]',
                    isFeatured
                      ? 'border-primary/40 from-white/[0.06] bg-gradient-to-b via-white/[0.02] to-transparent shadow-[0_0_40px_-10px_rgba(255,255,255,0.05)]'
                      : 'border-white/10 bg-white/5'
                  )}
                >
                  <CardHeader className="flex-none space-y-0">
                    <CardTitle className="font-medium">
                      <h3 className="text-sm font-medium">{item.title}</h3>
                    </CardTitle>

                    <div className="my-3 flex items-center gap-3">
                      {displayedItem.original_price && (
                        <span className="text-muted-foreground text-sm line-through">{displayedItem.original_price}</span>
                      )}
                      <div className="block text-4xl leading-none font-bold tracking-tight text-white">
                        <span>{displayedItem.price}</span>{' '}
                        {displayedItem.unit ? <span className="text-base font-normal text-white/50">{displayedItem.unit}</span> : null}
                      </div>
                      <CurrencySwitch
                        productId={item.product_id}
                        currencies={currencies}
                        selectedCurrency={selectedCurrency}
                        onSelect={(currency) => handleCurrencyChange(item.product_id, currency)}
                      />
                    </div>

                    <CardDescription className="text-sm">{item.description}</CardDescription>
                    {item.tip && <span className="text-muted-foreground text-sm">{item.tip}</span>}

                    {isCurrentPlan ? (
                      <Button
                        variant="outline"
                        className="mt-6 h-12 w-full rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        disabled
                      >
                        <span className="text-sm font-medium">{t('current_plan')}</span>
                      </Button>
                    ) : (
                      <>
                        {paymentChoices.length > 0 && (
                          <div className="mt-5">
                            <div className="mb-2 text-[11px] font-medium text-white/38">{t('payment_methods')}</div>
                            <div className="flex flex-wrap gap-2">
                              {paymentChoices.map((provider) => {
                                const isSelected = preferredProvider?.name === provider.name;
                                const providerLabel = (
                                  <span className="relative z-10 inline-flex items-center gap-1.5">
                                    <Image
                                      src={provider.iconUrl}
                                      alt=""
                                      aria-hidden="true"
                                      width={14}
                                      height={14}
                                      className="h-3.5 w-3.5 rounded-sm object-contain"
                                    />
                                    <span>{provider.title}</span>
                                  </span>
                                );

                                if (canSwitchProvider) {
                                  return (
                                    <button
                                      key={provider.name}
                                      type="button"
                                      aria-pressed={isSelected}
                                      onClick={() => rememberPreferredProvider(provider.name)}
                                      disabled={isLoading}
                                      className={cn(
                                        'relative isolate inline-flex h-8 items-center justify-center overflow-hidden rounded-full px-3.5 text-[12px] transition-colors',
                                        'focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                                        isSelected
                                          ? 'text-white'
                                          : 'border border-white/8 bg-white/[0.03] text-white/54 hover:border-white/14 hover:bg-white/[0.05] hover:text-white/78'
                                      )}
                                    >
                                      {isSelected && (
                                        <motion.span
                                          layoutId={`payment-provider-${item.product_id}`}
                                          className="absolute inset-0 rounded-full border border-white/12 bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                        />
                                      )}
                                      {providerLabel}
                                    </button>
                                  );
                                }

                                return (
                                  <span
                                    key={provider.name}
                                    className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-3.5 text-[12px] text-white/68"
                                  >
                                    {providerLabel}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => handleCardAction(displayedItem)}
                          disabled={isLoading || availableProviders.length === 0}
                          className={cn(
                            'mt-4 h-12 w-full rounded-full font-bold transition-all duration-300',
                            isFeatured
                              ? 'border-none bg-white text-black shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:bg-white/90'
                              : 'border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
                          )}
                        >
                          {isLoading && item.product_id === productId ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="size-4 animate-spin" />
                              <span>{t('processing')}</span>
                            </div>
                          ) : (
                            <span>{cardButtonLabel}</span>
                          )}
                        </Button>
                      </>
                    )}
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col space-y-4">
                    <hr className="border-dashed" />
                    {item.features_title && <p className="text-sm font-medium">{item.features_title}</p>}
                    <ul className="list-outside space-y-3 text-sm">
                      {item.features?.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-3 text-white/70">
                          <div className="bg-white/[0.08] text-white/60 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                            <Check className="size-3" />
                          </div>
                          <span className="flex-1">{feature}</span>
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

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="border-white/10 bg-black/95 text-white backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{t('confirm_title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">{t('confirm_current')}</p>
              <div className="space-y-1.5">
                {activeSubscriptions.map((subscription) => (
                  <div
                    key={subscription.id}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">{getLocalizedName(subscription)}</span>
                    <span className="text-white/50">
                      {subscription.creditsAmount || 0} {t('credits_unit')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {pendingCheckoutItem && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">{t('confirm_adding')}</p>
                <div className="border-primary/20 bg-primary/5 flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="text-white">{pendingCheckoutItem.product_name || pendingCheckoutItem.title}</span>
                  <span className="text-primary">
                    {pendingCheckoutItem.credits || 0} {t('credits_unit')}
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm font-medium text-white">
              {t('confirm_total_credits', {
                credits: String(totalActiveCredits + (pendingCheckoutItem?.credits || 0)),
              })}
            </div>

            <p className="text-xs leading-relaxed text-white/40">{t('confirm_note')}</p>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                setShowConfirmDialog(false);
                setPendingCheckoutItem(null);
                setPendingCheckoutProvider(null);
                window.location.href = '/settings/billing';
              }}
            >
              {t('confirm_manage')}
            </Button>
            <Button
              className="flex-1 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/20"
              onClick={handleConfirmContinue}
            >
              {t('confirm_continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
