'use client';

import { memo } from 'react';
import { Archive, ArchiveRestore, Ban, CalendarClock, Copy, MapPin, MoreHorizontal, Pencil, Printer, QrCode, RefreshCw, Undo2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkline } from '@/components/ds/data';
import { TONE_CHIP } from '@/components/states';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { QrLifecycleAction } from '@/lib/dealer/qr-codes/rules';
import type { QrItemDto } from '@/lib/dealer/qr-codes/types';
import { printUrl } from './api';
import { STATUS_LABEL, STATUS_TONE, fmtDate, statsLine } from './format';

export type CardIntent =
  | { kind: 'open'; tab?: 'print' | 'settings' | 'stats' | 'history' }
  | { kind: 'copy' }
  | { kind: 'toggle'; next: boolean }
  | { kind: 'lifecycle'; action: QrLifecycleAction };

export const QrCard = memo(function QrCard({
  item,
  index,
  selected,
  busy,
  onSelect,
  onIntent,
}: {
  item: QrItemDto;
  index: number;
  selected: boolean;
  busy: boolean;
  onSelect: (item: QrItemDto, next: boolean) => void;
  onIntent: (item: QrItemDto, intent: CardIntent) => void;
}) {
  const live = item.status !== 'revoked' && item.status !== 'archived';
  const canToggle = live && item.status !== 'expired';
  const tone = STATUS_TONE[item.status];
  const nameId = `qr-${item.id}-name`;

  return (
    <Reveal as="li" index={index} className="list-none">
      <article
        aria-labelledby={nameId}
        aria-busy={busy || undefined}
        className={cn(
          'group relative flex h-full flex-col gap-3 rounded-lg border bg-surface-1 p-3 transition-colors duration-fast sm:p-4',
          selected ? 'border-brand ring-1 ring-brand' : 'border-border hover:border-border-strong',
          !live && 'bg-surface-muted'
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onIntent(item, { kind: 'open', tab: 'print' })}
            aria-label={`${item.name} — QR önizleme ve yazdırma`}
            className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {live ? (
              // Sunucunun ürettiği gerçek QR (indirilen/basılanla aynı motor). Liste başına lazy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={printUrl({ ids: [item.id], template: 'plain', format: 'svg', fg: '#111111', bg: '#FFFFFF' })}
                alt=""
                width={80}
                height={80}
                loading="lazy"
                decoding="async"
                className="h-full w-full"
              />
            ) : (
              <QrCode className="h-8 w-8 text-fg-subtle" aria-hidden />
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3 id={nameId} className="qx-body min-w-0 truncate font-semibold text-fg" title={item.name}>
                {item.name}
              </h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${item.name} için işlemler`}
                    className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <MoreHorizontal className="h-5 w-5" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {live && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'open', tab: 'print' })}>
                      <Printer className="mr-2 h-4 w-4" aria-hidden /> Yazdır ve indir
                    </DropdownMenuItem>
                  )}
                  {item.status !== 'archived' && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'open', tab: 'settings' })}>
                      <Pencil className="mr-2 h-4 w-4" aria-hidden /> Düzenle
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'open', tab: 'stats' })}>
                    <CalendarClock className="mr-2 h-4 w-4" aria-hidden /> İstatistik ve geçmiş
                  </DropdownMenuItem>
                  {live && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'copy' })}>
                      <Copy className="mr-2 h-4 w-4" aria-hidden /> Linki kopyala
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {live && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'lifecycle', action: 'rotate' })}>
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Kodu yenile
                    </DropdownMenuItem>
                  )}
                  {live && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'lifecycle', action: 'revoke' })}>
                      <Ban className="mr-2 h-4 w-4" aria-hidden /> İptal et
                    </DropdownMenuItem>
                  )}
                  {item.status === 'revoked' && (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'lifecycle', action: 'unrevoke' })}>
                      <Undo2 className="mr-2 h-4 w-4" aria-hidden /> İptali geri al
                    </DropdownMenuItem>
                  )}
                  {item.status === 'archived' ? (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'lifecycle', action: 'restore' })}>
                      <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden /> Arşivden geri al
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => onIntent(item, { kind: 'lifecycle', action: 'archive' })}>
                      <Archive className="mr-2 h-4 w-4" aria-hidden /> Arşivle
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('qx-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', TONE_CHIP[tone])}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {STATUS_LABEL[item.status]}
              </span>
              {item.expiringSoon && (
                <span className={cn('qx-caption rounded-full px-2 py-0.5 font-medium', TONE_CHIP.warning)}>
                  {fmtDate(item.expiresAt)} sona eriyor
                </span>
              )}
              {item.location && (
                <span className="qx-caption inline-flex min-w-0 items-center gap-1 text-fg-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {item.location.name}
                    {!item.location.isActive && ' (arşiv)'}
                  </span>
                </span>
              )}
            </div>
            <p className="qx-caption font-mono text-fg-subtle">{item.code}</p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="qx-small text-fg">
            <span className="sr-only">Son 30 gün: </span>
            {statsLine(item.stats.scans, item.stats.feedbacks, item.stats.conversion)}
            {item.stats.avgRating != null && <span className="text-fg-muted"> · ★ {item.stats.avgRating.toLocaleString('tr-TR')}</span>}
          </p>
          <div className="flex items-end gap-2">
            <div className="h-8 min-w-0 flex-1">
              {item.stats.scans > 0 ? (
                <Sparkline data={item.stats.spark} tone="brand" height={32} area zeroBased label={`${item.name}: son 14 günün günlük taramaları`} />
              ) : (
                <p className="qx-caption text-fg-subtle">Son 30 günde tarama yok</p>
              )}
            </div>
            <span className="qx-caption shrink-0 text-fg-subtle">30 gün</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelect(item, v === true)}
              aria-label={`${item.name} seç`}
            />
            <span className="qx-small text-fg-muted">Seç</span>
          </label>
          {canToggle ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <span className="qx-small text-fg-muted">{item.isActive ? 'Yayında' : 'Duraklatıldı'}</span>
              <Switch
                checked={item.isActive}
                disabled={busy}
                onCheckedChange={(next) => onIntent(item, { kind: 'toggle', next })}
                aria-label={`${item.name} ${item.isActive ? 'duraklat' : 'yayına al'}`}
              />
            </label>
          ) : (
            <span className="qx-caption text-fg-subtle">{item.feedbackTotal > 0 ? `${item.feedbackTotal} yorum korunuyor` : ' '}</span>
          )}
        </div>
      </article>
    </Reveal>
  );
});
