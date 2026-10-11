'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { Award, ArrowRight } from 'lucide-react';
import { DURATION, EASE, OFFSET, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { BUZZ } from '@/lib/moments/effects';
import {
  SCENE_RARITY_LABEL,
  getBadgeSceneColors,
  normalizeSceneRarity,
  sceneBackdrop,
  type ScenePair,
  type SceneRarity,
} from '@/lib/moments/scene-colors';
import type { Moment } from '@/lib/moments/types';
import { MEDALLION_TIMELINE, classifyBadgeIcon, secToMs, type SceneClock } from './scene-math';
import { SceneShell } from './scene-shell';
import { SceneStage } from './stage-lazy';
import { CardAction, DismissHint, useSceneCue } from './scene-parts';
import { useSceneCopy } from '@/lib/moments/scene-copy';

/**
 * Rozet sahnesi (spec §3): orta kart, ~3 sn. 3B madalyon dönerek gelir, takla atar ve
 * yüzü kameraya döndüğü anda rozet ikonu açılır; kenar rozetin `color`'ı ya da nadirlik
 * rengi. "Koleksiyonuna eklendi →" bağlantısı `/customer/badges`.
 *
 * Props sözleşmesi (M2 Host, `next/dynamic` ile yükler): `{ moment, onDone }`.
 */
const REVEAL_MS = secToMs(MEDALLION_TIMELINE.revealAt);
const BURST_MS = secToMs(MEDALLION_TIMELINE.burstAt);
const MARKS = [REVEAL_MS, BURST_MS];

export const BADGES_HREF = '/customer/me/badges';

/** Nadirlik çipi — yalnız QDL rol token'ları (metin her zaman `*-text` rolü, AA). */
const RARITY_CHIP: Record<SceneRarity, string> = {
  common: 'bg-surface-3 text-fg-muted ring-border',
  rare: 'bg-info-subtle text-info ring-info-border',
  epic: 'bg-brand-subtle text-brand ring-brand-border',
  legendary: 'bg-warning-subtle text-warning ring-warning-border',
};

export default function BadgeScene({ moment, onDone }: { moment: Moment; onDone: () => void }) {
  const payload = moment.kind === 'badge' ? moment.payload : null;
  const copy = useSceneCopy();

  useEffect(() => {
    if (!payload) onDone();
  }, [payload, onDone]);
  if (!payload) return null;

  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 60) : copy.badgeFallbackName;
  const rarity = normalizeSceneRarity(payload.rarity);
  const rarityLabel = copy.rarity[rarity] ?? SCENE_RARITY_LABEL[rarity];
  const colors = getBadgeSceneColors({ color: payload.color, rarity: payload.rarity });
  const overline = copy.badgeOverline(Boolean(payload.hidden));
  const announce = copy.badgeAnnounce(overline, name, rarityLabel);

  return (
    <SceneShell kind="badge" variant="card" announce={announce} marks={MARKS} onDone={onDone}>
      {({ clock, elapsed, started, reduce, stageSettled, close, titleId }) => {
        const revealed = reduce || (started && elapsed >= REVEAL_MS);
        return (
          <BadgeCard
            clock={clock}
            reduce={reduce}
            revealed={revealed}
            burst={!reduce && started && elapsed >= BURST_MS}
            stageSettled={stageSettled}
            close={close}
            titleId={titleId}
            name={name}
            icon={payload.icon}
            overline={overline}
            rarity={rarity}
            rarityLabel={rarityLabel}
            colors={colors}
          />
        );
      }}
    </SceneShell>
  );
}

function BadgeIcon({ icon, className }: { icon: unknown; className?: string }) {
  const kind = classifyBadgeIcon(icon);
  const [broken, setBroken] = useState(false);
  if (kind === 'image' && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- rozet ikonu yerel/uzak serbest yol; next/image alan adı listesi gerektirir
      <img
        src={String(icon).trim()}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className={cn('size-full object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]', className)}
      />
    );
  }
  if (kind === 'emoji') {
    return (
      <span className={cn('leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]', className)} style={{ fontSize: '82cqmin' }}>
        {String(icon).trim()}
      </span>
    );
  }
  return <Award className={cn('size-full text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]', className)} strokeWidth={1.6} />;
}

function BadgeCard({
  clock,
  reduce,
  revealed,
  burst,
  stageSettled,
  close,
  titleId,
  name,
  icon,
  overline,
  rarity,
  rarityLabel,
  colors,
}: {
  clock: SceneClock;
  reduce: boolean;
  revealed: boolean;
  burst: boolean;
  stageSettled: () => void;
  close: () => void;
  titleId: string;
  name: string;
  icon: unknown;
  overline: string;
  rarity: SceneRarity;
  rarityLabel: string;
  colors: ScenePair;
}) {
  const copy = useSceneCopy();
  useSceneCue(burst, { sound: 'reveal', buzz: BUZZ.success, withConfetti: false });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-surface-2 text-fg ring-1 ring-inset ring-border qx-elevation-3"
    >
      {/* Sahne kuyusu: koyu set, 3B madalyon ve ortasında rozet ikonu. */}
      <div className={cn('relative w-full overflow-hidden', reduce ? 'h-40' : 'aspect-square')} style={{ background: sceneBackdrop(colors) }}>
        <SceneStage
          preset="medallion"
          colors={colors}
          clock={clock}
          staticOnly={reduce}
          onSettled={stageSettled}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ containerType: 'size' }}>
          {/* Madalyon iç diski ≈ 0,6 × 0,78 × küçük kenar; ikon onun içinde kalır. */}
          <Motion.div
            className="grid place-items-center"
            style={{ width: '30cqmin', height: '30cqmin', containerType: 'size' }}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={revealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
            transition={reduce ? { duration: 0 } : SPRING.bouncy}
          >
            <BadgeIcon icon={icon} />
          </Motion.div>
        </div>
      </div>

      <Motion.div
        className="flex flex-col items-center gap-2 p-5 text-center"
        initial={reduce ? false : { opacity: 0, y: OFFSET.enter }}
        animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: OFFSET.enter }}
        transition={{ duration: reduce ? 0 : DURATION.slow, ease: EASE.emphasized }}
      >
        <p className="qx-overline text-brand">{overline}</p>
        <h2 id={titleId} className="qx-h2 text-fg">
          {name}
        </h2>
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 qx-small font-semibold ring-1 ring-inset', RARITY_CHIP[rarity])}>
          {rarityLabel}
        </span>
        <div className="mt-2 flex w-full flex-col items-center gap-2">
          <Link
            href={BADGES_HREF}
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {copy.badgeAdded}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <CardAction onClick={close} autoFocus>
            {copy.ok}
          </CardAction>
          <DismissHint tone="card" />
        </div>
      </Motion.div>
    </div>
  );
}

