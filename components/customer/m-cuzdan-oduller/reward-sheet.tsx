'use client';

import { playSound } from '@/lib/sound';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { ArrowRight, Info, QrCode } from 'lucide-react';
import { Burst, DrawCheck } from '@/components/fx/event-fx';
import { Button } from '@/components/ui/button';
import { DetailSheet, KeyValueList, type KeyValueItem } from '@/components/ds/data';
import { RewardProgress } from '@/components/ds/play';
import { EmptyState, InlineError } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { SPRING, useMotionPolicy } from '@/lib/motion';
import { passParam } from '@/lib/wallet-rewards/rules';
import type { ClaimRewardResult, RewardDTO } from '@/lib/wallet-rewards/types';
import { errorText, newIdempotencyKey, walletPost, WalletApiError } from './api';
import { useWalletCopy } from './copy';
import { formatDate, formatPoints } from './format';
import { RewardVisual } from './reward-visual';
import { useShallowQuery } from './use-shallow-query';

type Flow =
  | { id: string; stage: 'confirm'; error?: string }
  | { id: string; stage: 'claiming' }
  | { id: string; stage: 'success'; result: ClaimRewardResult };

/**
 * Ödül detay penceresi (`?reward=<id>` derin linki; mobilde alttan sheet, masaüstünde yan panel).
 * Birincil eylem duruma göre: Al → satır içi onay (bakiye değişimi) → "Ödülün hazır".
 * Alınamayan ödülde onay HİÇ açılmaz; neden ve hedef ilerlemesi gösterilir.
 */
export function RewardSheet({
  rewards,
  balance,
  onClaimed,
  onRefresh,
}: {
  rewards: readonly RewardDTO[];
  balance: number;
  onClaimed: (result: ClaimRewardResult) => void;
  onRefresh: () => void;
}) {
  const copy = useWalletCopy();
  const policy = useMotionPolicy();
  const byId = useMemo(() => new Map(rewards.map((r) => [r.id, r])), [rewards]);
  const [flow, setFlow] = useState<Flow | null>(null);
  // İstek anahtarı HEDEFE bağlı: ağ hatasından sonra başka bir ögeye geçilirse eski anahtar
  // taşınmaz (idempotency yanıt tekrarı gövdeye bakmaz → önceki ögenin yanıtı dönerdi).
  const keyRef = useRef<{ id: string; key: string } | null>(null);
  const url = useShallowQuery();
  const openId = url.get('reward');

  const stageFor = (id: string) => (flow && flow.id === id ? flow : null);

  async function claim(reward: RewardDTO) {
    if (keyRef.current?.id !== reward.id) keyRef.current = { id: reward.id, key: newIdempotencyKey() };
    setFlow({ id: reward.id, stage: 'claiming' });
    try {
      const result = await walletPost<ClaimRewardResult>(
        '/api/customer/wallet/rewards/claim',
        { rewardId: reward.id },
        { idempotencyKey: keyRef.current.key }
      );
      keyRef.current = null;
      setFlow({ id: reward.id, stage: 'success', result });
      playSound('reward');
      announce(copy.detail.successTitle);
      onClaimed(result);
    } catch (err) {
      // Sunucu durumu değiştiyse (stok bitti, süre doldu, fiyat değişti) katalog tazelenir.
      if (err instanceof WalletApiError && err.status >= 400 && err.status < 500) {
        keyRef.current = null;
        onRefresh();
      }
      setFlow({ id: reward.id, stage: 'confirm', error: errorText(err, copy.errors) });
    }
  }

  function rulesOf(r: RewardDTO): KeyValueItem[] {
    const items: KeyValueItem[] = [
      { id: 'cost', label: copy.detail.cost, value: copy.points(formatPoints(r.cost, copy.locale)) },
      {
        id: 'stock',
        label: copy.detail.stock,
        value:
          r.stock.kind === 'unlimited'
            ? copy.stockUnlimited
            : r.stock.kind === 'out'
              ? copy.stockOut
              : r.stock.kind === 'low'
                ? copy.stockLow(r.stock.left)
                : copy.stockLeft(r.stock.left),
      },
    ];
    if (r.validFrom) items.push({ id: 'from', label: copy.detail.validFrom, value: formatDate(r.validFrom, copy.locale, true) });
    if (r.validUntil) items.push({ id: 'until', label: copy.detail.validUntil, value: formatDate(r.validUntil, copy.locale, true) });
    if (r.perUserLimit) {
      items.push({
        id: 'limit',
        label: copy.detail.perUserLimit,
        value: `${copy.detail.perUserValue(r.perUserLimit)} · ${copy.perUser(r.userClaimCount, r.perUserLimit)}`,
      });
    }
    return items;
  }

  return (
    <DetailSheet
      open={!!openId}
      id={openId}
      onOpenChange={(next) => {
        if (next) return;
        url.set({ reward: null });
        setFlow(null);
        // Anahtar kapanışta sıfırlanmaz: belirsiz (ağ) hatadan sonra aynı ögeye yeniden deneme
        // aynı anahtarla gider → sunucu ilk sonucu tekrarlar, çift borç olmaz.
      }}
      size="md"
      title={(id) => byId.get(id)?.name ?? copy.errors.REWARD_NOT_FOUND}
      description={(id) => {
        const r = byId.get(id);
        return r ? copy.kind[r.kind] : null;
      }}
      footer={(id) => {
        const r = byId.get(id);
        if (!r) return null;
        const f = stageFor(id);
        if (f?.stage === 'success') {
          return (
            <Button asChild className="w-full sm:w-auto">
              <Link href={`/customer/wallet/owned?pass=${passParam('reward', f.result.userRewardId)}`}>
                <QrCode aria-hidden className="size-4" />
                {copy.detail.showPass}
              </Link>
            </Button>
          );
        }
        if (f?.stage === 'confirm' || f?.stage === 'claiming') {
          return (
            <>
              <Button variant="outline" onClick={() => setFlow(null)} disabled={f.stage === 'claiming'}>
                {copy.detail.cancel}
              </Button>
              <Button onClick={() => claim(r)} loading={f.stage === 'claiming'} disabled={f.stage === 'claiming' || r.state !== 'available'}>
                {copy.detail.confirm}
              </Button>
            </>
          );
        }
        if (r.state === 'available') {
          return (
            <Button className="w-full sm:w-auto" onClick={() => setFlow({ id, stage: 'confirm' })}>
              {copy.detail.claim(formatPoints(r.cost, copy.locale))}
            </Button>
          );
        }
        if (r.state === 'insufficient') {
          return (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/customer/scan">
                {copy.detail.earnCta}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          );
        }
        return null;
      }}
    >
      {(id) => {
        const r = byId.get(id);
        if (!r) {
          return <EmptyState variant="no-results" compact title={copy.errors.REWARD_NOT_FOUND} description={null} />;
        }
        const f = stageFor(id);
        if (f?.stage === 'success') {
          return (
            <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
              <Motion.div
                initial={policy.reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={policy.transition(SPRING.bouncy)}
                className="relative grid size-16 place-items-center rounded-full bg-success-subtle text-success ring-1 ring-inset ring-success-border"
              >
                {/* Ödül alındı: ışık patlaması + dönerek gelen tik (CSS, azaltılmışta sade). */}
                <span aria-hidden className="qx-fx-flash" style={{ inset: -24, borderRadius: 999 }} />
                <span className="qx-fx-spin-in grid place-items-center">
                  <DrawCheck className="size-8" />
                </span>
                {!policy.reduce && <Burst trigger={1} kind="light" count={10} radius={52} />}
              </Motion.div>
              <div>
                <p className="qx-h3 text-fg">{copy.detail.successTitle}</p>
                <p className="qx-small mt-1 text-fg-muted">{copy.detail.successBody}</p>
              </div>
              <p className="qx-h3 select-all rounded-control border border-dashed border-strong bg-surface-2 px-4 py-2 font-mono tracking-wider text-fg">
                {f.result.code}
              </p>
              <p className="qx-small text-fg-muted">
                {copy.detail.balanceChange}: <span className="qx-num font-semibold text-fg">{copy.points(formatPoints(f.result.newBalance, copy.locale))}</span>
              </p>
            </div>
          );
        }
        const missing = Math.max(0, r.cost - balance);
        return (
          <div className="flex flex-col gap-5">
            <div className="relative aspect-video w-full overflow-hidden rounded-card bg-surface-muted">
              <RewardVisual imageUrl={r.imageUrl} glyph={r.glyph} kind={r.kind} size="lg" />
            </div>
            <p className="qx-body text-fg">{r.description}</p>

            {(f?.stage === 'confirm' || f?.stage === 'claiming') && (
              <div className="rounded-card border border-brand-border bg-brand-subtle p-4">
                <p className="qx-h3 text-fg">{copy.detail.confirmTitle}</p>
                <p className="qx-small mt-1 text-fg-muted">{copy.detail.confirmBody}</p>
                <p className="qx-body qx-num mt-3 font-semibold text-fg">
                  {copy.detail.balanceChange}: {formatPoints(balance, copy.locale)} → {formatPoints(Math.max(0, balance - r.cost), copy.locale)}
                </p>
                {f.stage === 'confirm' && f.error && (
                  <InlineError variant="banner" className="mt-3">
                    {f.error}
                  </InlineError>
                )}
              </div>
            )}

            {r.state === 'insufficient' && (
              <div className="rounded-card border border-subtle bg-surface-2 p-4">
                <RewardProgress current={balance} target={r.cost} rewardLabel={r.name} register="ops" />
                <p className="qx-caption mt-2 text-fg-muted">{copy.missing(formatPoints(missing, copy.locale))}</p>
              </div>
            )}

            {(r.state === 'soldOut' || r.state === 'upcoming' || r.state === 'expired' || r.state === 'limitReached') && (
              <p className="qx-small flex items-start gap-2 rounded-card border border-subtle bg-surface-2 p-3 text-fg">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
                {copy.detail.unavailable[r.state]}
              </p>
            )}

            <section aria-labelledby={`reward-rules-${r.id}`}>
              <h3 id={`reward-rules-${r.id}`} className="qx-overline mb-2 text-fg-muted">
                {copy.detail.rules}
              </h3>
              <KeyValueList items={rulesOf(r)} divided />
            </section>

            <section aria-labelledby={`reward-how-${r.id}`}>
              <h3 id={`reward-how-${r.id}`} className="qx-overline mb-1 text-fg-muted">
                {copy.detail.howItWorks}
              </h3>
              <p className="qx-small text-fg">{copy.detail.how[r.kind]}</p>
            </section>
          </div>
        );
      }}
    </DetailSheet>
  );
}
