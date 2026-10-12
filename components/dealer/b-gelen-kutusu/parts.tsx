'use client';

/**
 * Gelen Kutusu küçük yapı taşları: yıldız puanı (erişilebilir ad), kaynak ikonu, duygu ve SLA
 * rozetleri, öncelik şeridi, baş harf avatarı, yerel `select`. Anlam yalnız renge bırakılmaz:
 * her rozet ikon + metin taşır.
 */
import type { ReactNode, SelectHTMLAttributes } from 'react';
import {
  AlertTriangle,
  Clock,
  Frown,
  Hourglass,
  Meh,
  QrCode,
  ShoppingBag,
  Smile,
  Star,
  TimerOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, type Tone } from '@/components/states';
import type { InboxPriority, InboxSentiment, InboxSla, InboxSource } from '@/lib/dealer-inbox/types';
import { useInboxCopy } from './copy';

export function RatingStars({ rating, size = 'sm', className }: { rating: number; size?: 'sm' | 'md'; className?: string }) {
  const copy = useInboxCopy();
  const s = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span role="img" aria-label={copy.ratingAria(rating)} className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(s, i <= rating ? 'fill-warning text-warning' : 'fill-transparent text-fg-subtle')}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

export function SourceIcon({ source, className }: { source: InboxSource; className?: string }) {
  const Icon = source === 'qr' ? QrCode : ShoppingBag;
  return <Icon aria-hidden className={cn('h-3.5 w-3.5 shrink-0', className)} />;
}

export function Chip({ tone = 'neutral', icon, children, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn('qx-caption qx-fx-status inline-flex max-w-full items-center gap-1 rounded-chip px-2 py-0.5 font-medium', TONE_CHIP[tone])}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

const SENTIMENT_META: Record<InboxSentiment, { tone: Tone; Icon: typeof Smile }> = {
  positive: { tone: 'success', Icon: Smile },
  neutral: { tone: 'neutral', Icon: Meh },
  negative: { tone: 'danger', Icon: Frown },
  pending: { tone: 'info', Icon: Hourglass },
};

export function SentimentChip({ sentiment }: { sentiment: InboxSentiment }) {
  const copy = useInboxCopy();
  const { tone, Icon } = SENTIMENT_META[sentiment];
  const label = sentiment === 'pending' ? copy.badge.pendingAi : copy.sentiments[sentiment];
  return (
    <Chip tone={tone} icon={<Icon aria-hidden className="h-3 w-3" />}>
      {label}
    </Chip>
  );
}

export function SlaChip({ sla, title }: { sla: InboxSla; title?: string }) {
  const copy = useInboxCopy();
  if (sla.state === 'done' || sla.state === 'ok') return null;
  const overdue = sla.state === 'overdue';
  return (
    <Chip
      tone={overdue ? 'danger' : 'warning'}
      title={title}
      icon={overdue ? <TimerOff aria-hidden className="h-3 w-3" /> : <Clock aria-hidden className="h-3 w-3" />}
    >
      {copy.sla[sla.state]}
    </Chip>
  );
}

export function SignalChip({ children }: { children: ReactNode }) {
  return (
    <Chip tone="warning" icon={<AlertTriangle aria-hidden className="h-3 w-3" />}>
      {children}
    </Chip>
  );
}

/** Kart sol kenar şeridi (dekoratif; öncelik ayrıca metinle de anlatılır). */
export const PRIORITY_STRIPE: Record<InboxPriority, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-border',
};

export function Initials({ name, anonymous }: { name: string | null; anonymous: boolean }) {
  const text = anonymous || !name ? '?' : name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR')).join('');
  return (
    <span
      aria-hidden
      className="qx-small grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted font-semibold text-fg-muted ring-1 ring-inset ring-border"
    >
      {text}
    </span>
  );
}

export function NativeSelect({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="qx-caption font-medium text-fg-muted">{label}</span>
      <select
        {...rest}
        className="qx-small h-11 min-h-11 w-full min-w-0 rounded-control border border-strong bg-surface-1 px-2.5 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:min-h-10"
      >
        {children}
      </select>
    </label>
  );
}
