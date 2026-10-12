'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox, SearchX, FilterX, Lock, Sparkles } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion/variants';
import { useStateCopy } from './copy';
import { TONE_CHIP, type Tone } from './tone';

export type EmptyVariant = 'default' | 'first-use' | 'no-results' | 'filtered' | 'permission';

const VARIANT_ICON: Record<EmptyVariant, LucideIcon> = {
  default: Inbox,
  'first-use': Sparkles,
  'no-results': SearchX,
  filtered: FilterX,
  permission: Lock,
};

const VARIANT_TONE: Record<EmptyVariant, Tone> = {
  default: 'neutral',
  'first-use': 'brand',
  'no-results': 'neutral',
  filtered: 'neutral',
  permission: 'warning',
};

export type EmptyStateProps = {
  /** Bağlama göre ikon/ton/varsayılan metin. */
  variant?: EmptyVariant;
  icon?: LucideIcon;
  title?: ReactNode;
  /** `null` → açıklama satırı gösterilmez; `undefined` → bağlama uygun varsayılan. */
  description?: ReactNode;
  /** Birincil aksiyon (ör. "Kampanya oluştur"). */
  action?: ReactNode;
  /** İkincil aksiyon (ör. "Filtreleri temizle", yardım bağlantısı). */
  secondaryAction?: ReactNode;
  tone?: Tone;
  /** Kart içi / dar alan. */
  compact?: boolean;
  className?: string;
  /** Başlık seviyesi (sayfa hiyerarşisine uydurmak için). */
  headingLevel?: 'h2' | 'h3' | 'p';
};

/**
 * Boş durum — "veri yok" metinlerinin TEK hâli. Hata durumunda KULLANILMAZ
 * (bkz. ErrorState / QueryState). Ekran okuyucu için `role="status"`.
 */
export function EmptyState({
  variant = 'default',
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone,
  compact = false,
  className,
  headingLevel = 'h3',
}: EmptyStateProps) {
  const copy = useStateCopy();
  const Icon = icon ?? VARIANT_ICON[variant];
  const resolvedTone = tone ?? VARIANT_TONE[variant];
  const defaultTitle = variant === 'no-results' || variant === 'filtered' ? copy.noResultsTitle : variant === 'permission' ? copy.forbiddenTitle : copy.emptyTitle;
  const defaultBody = variant === 'no-results' || variant === 'filtered' ? copy.noResultsBody : variant === 'permission' ? copy.forbiddenBody : copy.emptyBody;
  const Heading = headingLevel;

  return (
    <Motion.div
      role="status"
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cn(
        'mx-auto flex max-w-md flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <div
        className={cn(
          'grid place-items-center rounded-card',
          TONE_CHIP[resolvedTone],
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
        aria-hidden
      >
        {/* Sakin "nefes": yalnız ikon, 4.8 sn döngü, ±%4 (azaltılmış harekette durur). */}
        <Icon className={cn(compact ? 'h-5 w-5' : 'h-7 w-7', 'qx-fx-breathe')} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <Heading className={cn('font-semibold text-fg', compact ? 'qx-body' : 'qx-h3')}>{title ?? defaultTitle}</Heading>
        {description !== null && (
          <p className={cn('text-fg-muted', compact ? 'qx-caption' : 'qx-body')}>{description ?? defaultBody}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </Motion.div>
  );
}
