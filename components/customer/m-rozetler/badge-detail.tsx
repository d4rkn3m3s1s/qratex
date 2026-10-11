'use client';

import { useId, useState } from 'react';
import { Pin, Share2, Star, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { BadgeGlyph, RarityBadge, RARITY_STYLES } from '@/components/ds/play';
import { KeyValueList } from '@/components/ds/data';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { CollectionItem, CollectionStats } from '@/lib/badges/collection-logic';
import { formatEarnedDate, formatInt, formatPct, useBadgesCopy } from './copy';
import { shareBadge, type ShareOutcome } from './badge-share';

type Props = {
  item: CollectionItem | null;
  stats: CollectionStats;
  featuredBadgeId: string | null;
  pinPending: boolean;
  featurePending: boolean;
  onTogglePin: (id: string, next: boolean) => void;
  onFeature: (id: string) => void;
};

/** Detay çekmecesinin gövdesi (başlık/kapama `DetailSheet`'te). */
export function BadgeDetailBody({ item }: { item: CollectionItem | null }) {
  const copy = useBadgesCopy();
  if (!item) return <p className="qx-body text-fg-muted">{copy.detailNotFound}</p>;

  const rarity = RARITY_STYLES[item.rarity];
  const pct = item.holdersPct !== null ? formatPct(item.holdersPct, copy) : null;
  const accent = item.characterCategory?.accent ?? item.color ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <div className="relative">
          <span
            aria-hidden
            className="absolute -inset-6 rounded-full opacity-50 blur-2xl"
            style={{ background: `radial-gradient(circle, ${accent ?? rarity.edge}, transparent 70%)` }}
          />
          <BadgeGlyph label={item.name} imageSrc={item.thumb ?? item.icon} rarity={item.rarity} color={accent ?? undefined} size="xl" className="relative" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <RarityBadge rarity={item.rarity} size="md" locale={copy.locale} />
          <span className="qx-caption rounded-chip bg-surface-muted px-2 py-1 font-medium text-fg-muted">
            {item.characterCategory ? `${item.characterCategory.emoji} ${item.characterCategory.name}` : copy.categoryLabel(item.category)}
          </span>
          {item.surprise && (
            <span className="qx-caption inline-flex items-center gap-1 rounded-chip bg-surface-muted px-2 py-1 font-medium text-fg-muted">
              <EyeOff aria-hidden className="size-3" />
              {copy.secretBadge}
            </span>
          )}
          {item.isNew && (
            <span className="qx-caption rounded-chip bg-brand px-2 py-1 font-semibold text-brand-fg">{copy.newBadge}</span>
          )}
        </div>
        {item.description && <p className="qx-body max-w-prose text-fg-muted">{item.description}</p>}
      </div>

      {item.quote && (
        <figure className="rounded-card border border-subtle bg-surface-0 p-4">
          <figcaption className="qx-caption mb-1 font-semibold uppercase tracking-wide text-fg-muted">{copy.detailQuoteLabel}</figcaption>
          <blockquote className="qx-body text-fg">{item.quote}</blockquote>
        </figure>
      )}

      <KeyValueList
        items={[
          { id: 'earned', label: copy.kvEarned, value: formatEarnedDate(item.earnedAt, copy) },
          {
            id: 'points',
            label: copy.kvPoints,
            value: item.creditedPoints > 0 ? copy.detailCredited(formatInt(item.creditedPoints, copy)) : copy.detailNoCredit,
          },
          { id: 'share', label: copy.kvRarity, value: pct !== null ? copy.detailRarityShare(pct) : null, hidden: pct === null },
        ]}
      />
    </div>
  );
}

/** Çekmece altbilgisi: vitrin anahtarı + paylaş + (karakterde) ana karakter. */
export function BadgeDetailFooter({ item, stats, featuredBadgeId, pinPending, featurePending, onTogglePin, onFeature }: Props) {
  const copy = useBadgesCopy();
  const switchId = useId();
  const [sharing, setSharing] = useState(false);
  if (!item) return null;

  const pinFull = !item.isPinned && stats.pinnedTotal >= stats.pinLimit;
  const isCharacter = item.kind === 'character';
  const isFeatured = featuredBadgeId === item.id;

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      let outcome: ShareOutcome;
      if (isCharacter) {
        const { shareCharacter } = await import('@/components/customer/character-share-card');
        await shareCharacter({
          badgeId: item.id,
          name: item.name,
          icon: item.icon ?? undefined,
          description: item.description,
          category: item.characterCategory,
          rarity: item.rarity,
          holders: item.holders,
          ratePct: item.holdersPct,
        }, copy.locale);
        outcome = 'shared';
      } else {
        const rarityLabel = RARITY_STYLES[item.rarity].label[copy.locale];
        outcome = await shareBadge({
          id: item.id,
          name: item.name,
          imageSrc: item.icon ?? item.thumb,
          rarity: item.rarity,
          rarityLabel,
          holdersPct: item.holdersPct,
          color: item.color,
          kicker: copy.shareCardKicker,
          footer: copy.shareCardFooter,
          pctLabel: item.holdersPct !== null ? copy.detailRarityShare(formatPct(item.holdersPct, copy)) : null,
          shareTitle: copy.shareTitle(item.name),
          shareText: copy.shareText(item.name, rarityLabel.toLocaleLowerCase(copy.dateTag)),
        });
      }
      if (outcome === 'downloaded') toast.success(copy.shareDownloaded);
      else if (outcome === 'copied') toast.success(copy.shareCopied);
      else if (outcome === 'failed') toast.error(copy.shareFailed);
    } catch {
      toast.error(copy.shareFailed);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={switchId} className="qx-small flex items-center gap-1.5 font-semibold text-fg">
            <Pin aria-hidden className="size-4 text-fg-muted" />
            {copy.detailPinLabel}
          </label>
          <p id={`${switchId}-hint`} className="qx-caption mt-0.5 text-fg-muted">
            {pinFull ? copy.detailPinFull(stats.pinLimit) : copy.detailPinHint(stats.pinnedTotal, stats.pinLimit)}
          </p>
        </div>
        {/* 44px dokunma alanı: görünür anahtar küçük, sarmalayıcı hedefi büyütür. */}
        <span className="grid min-h-11 min-w-11 shrink-0 place-items-center">
          <Switch
            id={switchId}
            checked={item.isPinned}
            disabled={pinPending || pinFull}
            aria-describedby={`${switchId}-hint`}
            aria-busy={pinPending || undefined}
            onCheckedChange={(next) => onTogglePin(item.id, next)}
          />
        </span>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {isCharacter && (
          <Button
            variant={isFeatured ? 'secondary' : 'outline'}
            className="min-h-11"
            disabled={isFeatured || featurePending}
            aria-pressed={isFeatured}
            onClick={() => onFeature(item.id)}
          >
            <Star aria-hidden className={isFeatured ? 'mr-2 size-4 fill-current' : 'mr-2 size-4'} />
            {isFeatured ? copy.detailFeatured : featurePending ? copy.detailFeaturing : copy.detailFeature}
          </Button>
        )}
        <Button className="min-h-11" onClick={onShare} disabled={sharing} aria-busy={sharing || undefined}>
          <Share2 aria-hidden className="mr-2 size-4" />
          {sharing ? copy.detailSharing : copy.detailShare}
        </Button>
      </div>
    </div>
  );
}
