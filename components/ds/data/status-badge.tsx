'use client';

import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Info,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, type Tone } from '@/components/states';
import { useDataCopy } from './copy';
import { SEVERITY_TONE, type Severity } from './status-meta';

/** Her tonun varsayılan ikonu — renk körü ve gri tonlamada da ayırt edilir. */
export const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: CircleDashed,
  brand: CircleDot,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

const SIZE = {
  sm: 'qx-caption gap-1 px-1.5 py-0.5 [&_svg]:h-3 [&_svg]:w-3',
  md: 'qx-small gap-1.5 px-2 py-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5',
} as const;

export type StatusBadgeProps = {
  label: ReactNode;
  tone?: Tone;
  /** Özel ikon; `null` → ikonsuz (yalnız metnin anlamı yeterliyse). */
  icon?: LucideIcon | null;
  size?: 'sm' | 'md';
  /** Ekran okuyucu için ön ek (ör. "Durum"). */
  srPrefix?: string;
  title?: string;
  className?: string;
};

/**
 * Durum rozeti — ikon + metin + ton. Yalnız renge dayanmaz: her tonun kendi
 * ikonu var, metin her zaman görünür. Rol token'ları → her temada ≥ 4.5:1.
 */
export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge(
  { label, tone = 'neutral', icon, size = 'md', srPrefix, title, className },
  ref,
) {
  const Icon = icon === null ? null : icon ?? TONE_ICON[tone];
  return (
    <span
      ref={ref}
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-chip font-medium leading-none',
        SIZE[size],
        TONE_CHIP[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="shrink-0" strokeWidth={2} />}
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      <span className="min-w-0 truncate py-0.5">{label}</span>
    </span>
  );
});

export type StatusDefinition = { label: string; tone: Tone; icon?: LucideIcon | null };
export type StatusMap<K extends string = string> = Record<K, StatusDefinition>;

/** Tip güvenli durum sözlüğü tanımı (sayfa başına bir kez). */
export function defineStatusMap<K extends string>(map: StatusMap<K>): StatusMap<K> {
  return map;
}

/**
 * Sözlükten rozet özellikleri; bilinmeyen durum ham değeriyle nötr gösterilir
 * (asla boş rozet / çökme yok).
 *
 *   const ORDER_STATUS = defineStatusMap({ PAID: { label: 'Ödendi', tone: 'success' }, … });
 *   <StatusBadge {...statusBadgeProps(ORDER_STATUS, row.status)} />
 */
export function statusBadgeProps<K extends string>(map: StatusMap<K>, status: string | null | undefined): StatusBadgeProps {
  const def = status != null ? (map as Record<string, StatusDefinition | undefined>)[status] : undefined;
  if (!def) return { label: status ?? '—', tone: 'neutral' };
  return { label: def.label, tone: def.tone, icon: def.icon };
}

const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertCircle,
  low: ArrowDown,
  info: Info,
};

export type SeverityBadgeProps = {
  severity: Severity;
  /** Özel etiket (varsayılan: Kritik/Yüksek/Orta/Düşük/Bilgi). */
  label?: ReactNode;
  size?: 'sm' | 'md';
  /** Kritik düzeyi dolgu ile vurgula (ops listelerinde dikkat çekmek için). */
  emphasize?: boolean;
  className?: string;
};

/**
 * Önem rozeti — her düzeyin ayrı ikonu ve metni var (kritik ↔ yüksek aynı
 * renkte olsa bile ikon/metin ayırır). Ekran okuyucuya "Önem: Kritik".
 */
export const SeverityBadge = forwardRef<HTMLSpanElement, SeverityBadgeProps>(function SeverityBadge(
  { severity, label, size = 'md', emphasize = false, className },
  ref,
) {
  const copy = useDataCopy();
  const solid = emphasize && severity === 'critical';
  return (
    <StatusBadge
      ref={ref}
      label={label ?? copy.severity[severity]}
      tone={SEVERITY_TONE[severity]}
      icon={SEVERITY_ICON[severity]}
      size={size}
      srPrefix={copy.severityPrefix}
      className={cn(solid && 'bg-danger text-danger-fg ring-danger', className)}
    />
  );
});
