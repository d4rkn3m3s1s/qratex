'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { usePageCopy } from './copy';
import { useUrlState } from './url-state';

export type SectionTab = {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Sayaç rozeti (ör. bekleyen kayıt). */
  count?: number;
  disabled?: boolean;
  /** Sekme içeriği; verilmezse `children(active)` kullanılır. */
  content?: ReactNode;
};

export type SectionTabsProps = {
  tabs: readonly SectionTab[];
  /** URL anahtarı. Varsayılan `tab`. */
  paramKey?: string;
  /** Varsayılan sekme (URL'ye yazılmaz). Varsayılan ilk sekme. */
  defaultValue?: string;
  /** Kontrollü kullanım (URL yerine). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Sekme değişince URL'den silinecek anahtarlar (ör. `page`, `id`). */
  resetKeys?: readonly string[];
  /** İçerik üretici (sekmelerin `content`'i yoksa). */
  children?: (active: string) => ReactNode;
  ariaLabel?: string;
  /** `underline` (varsayılan, ops) ya da `pill` (play / kompakt). */
  variant?: 'underline' | 'pill';
  /** ≥ 44px dokunma hedefi (mobilde her zaman açık). */
  touchTarget?: boolean;
  className?: string;
  listClassName?: string;
  contentClassName?: string;
};

type ViewProps = Omit<SectionTabsProps, 'value' | 'onValueChange' | 'paramKey' | 'resetKeys'> & {
  value: string;
  onValueChange: (value: string) => void;
};

function SectionTabsView({
  tabs,
  value,
  onValueChange,
  children,
  ariaLabel,
  variant = 'underline',
  touchTarget = false,
  className,
  listClassName,
  contentClassName,
}: ViewProps) {
  const copy = usePageCopy();
  const underline = variant === 'underline';
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} activationMode="automatic" className={cn('min-w-0', className)}>
      <div className={cn('-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', underline && 'border-b border-subtle')}>
        <TabsPrimitive.List
          aria-label={ariaLabel ?? copy.sections}
          className={cn('flex w-max min-w-full items-stretch gap-1', !underline && 'rounded-control bg-surface-muted p-1', listClassName)}
        >
          {tabs.map((tab) => (
            <TabsPrimitive.Trigger
              key={tab.value}
              value={tab.value}
              disabled={tab.disabled}
              className={cn(
                'qx-small group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 font-medium text-fg-muted',
                'min-h-11 transition-colors duration-fast ease-standard hover:text-fg',
                touchTarget ? '' : 'sm:min-h-10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
                'disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
                underline
                  ? 'rounded-t-chip data-[state=active]:text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:duration-fast data-[state=active]:after:bg-brand'
                  : 'rounded-chip data-[state=active]:bg-surface-1 data-[state=active]:text-fg data-[state=active]:qx-elevation-1',
              )}
            >
              {tab.icon && <span aria-hidden className="inline-flex">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="qx-caption qx-num rounded-chip bg-surface-muted px-1.5 py-0.5 font-semibold text-fg-muted group-data-[state=active]:bg-brand-subtle group-data-[state=active]:text-brand">
                  {tab.count}
                </span>
              )}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>
      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.value}
          value={tab.value}
          className={cn(
            'mt-4 min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-base',
            contentClassName,
          )}
        >
          {tab.content ?? (value === tab.value ? children?.(tab.value) : null)}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

function resolveValue(tabs: readonly SectionTab[], raw: string | null | undefined, fallback: string): string {
  return raw && tabs.some((t) => t.value === raw && !t.disabled) ? raw : fallback;
}

function SectionTabsUrl({
  paramKey = 'tab',
  resetKeys,
  defaultValue,
  onValueChange: notify,
  value: _ignored,
  ...rest
}: SectionTabsProps & { defaultValue: string }) {
  const url = useUrlState();
  const { set } = url;
  const urlValue = resolveValue(rest.tabs, url.get(paramKey), defaultValue);
  // İyimser seçim: router.replace bir RSC turunu bekler (yavaş sunucuda saniyeler sürer ve
  // sekme "tıklanmıyor" gibi görünür). Sekme tıklandığı an değişir; URL yetişince bırakılır.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => {
    setOptimistic(null);
  }, [urlValue]);
  const value = optimistic ?? urlValue;
  const onValueChange = useCallback(
    (next: string) => {
      setOptimistic(next);
      set({ [paramKey]: next === defaultValue ? null : next }, { resetKeys });
      notify?.(next);
    },
    [set, paramKey, defaultValue, resetKeys, notify],
  );
  return <SectionTabsView {...rest} value={value} onValueChange={onValueChange} />;
}

/**
 * Bölüm sekmeleri — etkin sekme URL'de (`?tab=`): paylaşılabilir link,
 * yenileme sonrası aynı sekme. Radix Tabs: ← → / Home / End ile gezinme,
 * `tablist`/`tab`/`tabpanel` rolleri ve `aria-controls` bağları hazır.
 * Mobilde yatay kaydırılır, dokunma hedefi ≥ 44px.
 */
export function SectionTabs(props: SectionTabsProps) {
  const fallback = props.defaultValue ?? props.tabs.find((t) => !t.disabled)?.value ?? '';
  if (props.value !== undefined) {
    const { value, onValueChange, paramKey: _p, resetKeys: _r, ...rest } = props;
    return <SectionTabsView {...rest} value={resolveValue(props.tabs, value, fallback)} onValueChange={onValueChange ?? (() => {})} />;
  }
  const { paramKey: _p, resetKeys: _r, ...viewRest } = props;
  return (
    <Suspense fallback={<SectionTabsView {...viewRest} value={fallback} onValueChange={() => {}} />}>
      <SectionTabsUrl {...props} defaultValue={fallback} />
    </Suspense>
  );
}
