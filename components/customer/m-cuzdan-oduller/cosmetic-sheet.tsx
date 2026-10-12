'use client';

import { DrawCheck } from '@/components/fx/event-fx';
import { playSound } from '@/lib/sound';
import { useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { m as Motion } from 'framer-motion';
import { Gift, Pin, PinOff, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/ds/data';
import { RarityBadge } from '@/components/ds/play';
import { EmptyState, InlineError } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { SPRING, useMotionPolicy } from '@/lib/motion';
import { isEquippable } from '@/lib/wallet-rewards/rules';
import type { CosmeticDTO, CosmeticsCatalogDTO, CosmeticStateResult, PurchaseCosmeticResult } from '@/lib/wallet-rewards/types';
import { errorText, newIdempotencyKey, walletPost, WalletApiError } from './api';
import { useWalletCopy } from './copy';
import { formatPoints } from './format';
import { CosmeticPreview } from './cosmetic-preview';
import { GiftDialog } from './gift-dialog';
import { useShallowQuery } from './use-shallow-query';

type Flow = { id: string; stage: 'confirm' | 'buying' | 'bought'; error?: string };

/**
 * Kozmetik detayı (`?item=<id>`): büyük önizleme, nerede görüneceği, nadirlik; birincil eylem
 * duruma göre Satın al (onaylı) → "Şimdi kuşan" / Kuşan-Çıkar / Vitrine sabitle; Hediye et.
 */
export function CosmeticSheet({
  catalog,
  balance,
  onBalance,
  onRefresh,
}: {
  catalog: CosmeticsCatalogDTO;
  balance: number;
  onBalance: (n: number) => void;
  onRefresh: () => void;
}) {
  const copy = useWalletCopy();
  const policy = useMotionPolicy();
  const { update: updateSession } = useSession();
  const url = useShallowQuery();
  const openId = url.get('item');
  const byId = useMemo(() => new Map(catalog.items.map((i) => [i.id, i])), [catalog.items]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  // İstek anahtarı HEDEFE bağlı: ağ hatasından sonra başka bir ögeye geçilirse eski anahtar
  // taşınmaz (idempotency yanıt tekrarı gövdeye bakmaz → önceki ögenin yanıtı dönerdi).
  const keyRef = useRef<{ id: string; key: string } | null>(null);
  const stage = (id: string) => (flow?.id === id ? flow : null);

  async function buy(item: CosmeticDTO) {
    if (keyRef.current?.id !== item.id) keyRef.current = { id: item.id, key: newIdempotencyKey() };
    setFlow({ id: item.id, stage: 'buying' });
    try {
      const r = await walletPost<PurchaseCosmeticResult>(
        '/api/customer/wallet/cosmetics/purchase',
        { cosmeticId: item.id, expectedPrice: item.price },
        { idempotencyKey: keyRef.current.key }
      );
      keyRef.current = null;
      onBalance(r.newBalance);
      setFlow({ id: item.id, stage: 'bought' });
      playSound('coin'); // SES: satın alma tamamlandı
      announce(copy.cosmetics.bought);
      onRefresh();
    } catch (err) {
      if (err instanceof WalletApiError && err.status >= 400 && err.status < 500) {
        keyRef.current = null;
        onRefresh();
      }
      setFlow({ id: item.id, stage: 'confirm', error: errorText(err, copy.errors) });
    }
  }

  async function act(item: CosmeticDTO, action: 'equip' | 'unequip' | 'pin' | 'unpin') {
    setBusyAction(action);
    setActionError(null);
    try {
      const r = await walletPost<CosmeticStateResult>('/api/customer/wallet/cosmetics/state', { cosmeticId: item.id, action });
      if (action === 'equip' || action === 'unequip') {
        // Üst çubuktaki avatar çerçevesi anında güncellensin (JWT); sayfa yenilemesi yedek.
        try {
          await updateSession({ equippedFrame: r.equippedFrame, equippedBackground: r.equippedBackground });
        } catch {
          /* oturum güncellenemezse yenileme yeterli */
        }
      }
      const msg =
        action === 'equip'
          ? copy.cosmetics.equippedNow
          : action === 'unequip'
            ? copy.cosmetics.unequippedNow
            : action === 'pin'
              ? copy.cosmetics.pinnedNow
              : copy.cosmetics.unpinnedNow;
      toast.success(msg);
      announce(msg);
      onRefresh();
    } catch (err) {
      setActionError(errorText(err, copy.errors));
    } finally {
      setBusyAction(null);
    }
  }

  const current = openId ? byId.get(openId) ?? null : null;

  return (
    <>
      <DetailSheet
        open={!!openId}
        id={openId}
        onOpenChange={(next) => {
          if (next) return;
          url.set({ item: null });
          setFlow(null);
          setActionError(null);
          // Anahtar kapanışta sıfırlanmaz: belirsiz (ağ) hatadan sonra aynı ögeye yeniden deneme
          // aynı anahtarla gider → sunucu ilk sonucu tekrarlar, çift borç olmaz.
        }}
        size="md"
        title={(id) => byId.get(id)?.name ?? copy.errors.COSMETIC_NOT_FOUND}
        description={(id) => {
          const it = byId.get(id);
          return it ? copy.cosmetics.typeOne[it.type] : null;
        }}
        footer={(id) => {
          const it = byId.get(id);
          if (!it) return null;
          const f = stage(id);
          const giftBtn = (
            <Button variant="ghost" onClick={() => setGiftOpen(true)}>
              <Gift aria-hidden className="size-4" />
              {copy.cosmetics.gift}
            </Button>
          );
          if (!it.owned && f?.stage !== 'bought') {
            if (f?.stage === 'confirm' || f?.stage === 'buying') {
              return (
                <>
                  <Button variant="outline" onClick={() => setFlow(null)} disabled={f.stage === 'buying'}>
                    {copy.detail.cancel}
                  </Button>
                  <Button onClick={() => void buy(it)} loading={f.stage === 'buying'} disabled={f.stage === 'buying' || balance < it.price}>
                    {copy.detail.confirm}
                  </Button>
                </>
              );
            }
            return (
              <>
                {giftBtn}
                <Button onClick={() => setFlow({ id, stage: 'confirm' })} disabled={balance < it.price}>
                  {copy.cosmetics.buy(formatPoints(it.price, copy.locale))}
                </Button>
              </>
            );
          }
          // Sahip (ya da az önce aldı): kuşan/çıkar + vitrin.
          return (
            <>
              {giftBtn}
              <Button
                variant="outline"
                onClick={() => void act(it, it.pinned ? 'unpin' : 'pin')}
                loading={busyAction === 'pin' || busyAction === 'unpin'}
                disabled={!!busyAction || (!it.pinned && catalog.pinsUsed >= catalog.pinLimit)}
              >
                {it.pinned ? <PinOff aria-hidden className="size-4" /> : <Pin aria-hidden className="size-4" />}
                {it.pinned ? copy.cosmetics.unpin : copy.cosmetics.pin}
              </Button>
              {isEquippable(it.type) && (
                <Button
                  onClick={() => void act(it, it.equipped ? 'unequip' : 'equip')}
                  loading={busyAction === 'equip' || busyAction === 'unequip'}
                  disabled={!!busyAction}
                >
                  <Shirt aria-hidden className="size-4" />
                  {it.equipped ? copy.cosmetics.unequip : copy.cosmetics.equip}
                </Button>
              )}
            </>
          );
        }}
      >
        {(id) => {
          const it = byId.get(id);
          if (!it) return <EmptyState variant="no-results" compact title={copy.errors.COSMETIC_NOT_FOUND} description={null} />;
          const f = stage(id);
          return (
            <div className="flex flex-col gap-5">
              <div className="group relative grid place-items-center rounded-card bg-surface-2 py-8">
                <CosmeticPreview item={it} preview={catalog.preview} size="lg" animate={!policy.reduce} />
                <span className="absolute left-3 top-3">
                  <RarityBadge rarity={it.rarity} register="ops" />
                </span>
              </div>

              {f?.stage === 'bought' && (
                <Motion.div
                  role="status"
                  initial={policy.reduce ? false : { scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={policy.transition(SPRING.bouncy)}
                  className="qx-small flex items-center gap-2 rounded-card border border-success-border bg-success-subtle p-3 font-medium text-success"
                >
                  <DrawCheck className="size-5 shrink-0" circle={false} />
                  {copy.cosmetics.bought}
                </Motion.div>
              )}

              {it.description && <p className="qx-body text-fg">{it.description}</p>}
              <p className="qx-small text-fg-muted">{copy.cosmetics.whereVisible[it.type]}</p>

              {!it.owned && f?.stage !== 'bought' && (
                <div className="rounded-card border border-subtle bg-surface-2 p-4">
                  <p className="qx-body qx-num font-semibold text-fg">{copy.points(formatPoints(it.price, copy.locale))}</p>
                  {balance < it.price ? (
                    <p className="qx-small mt-1 text-fg-muted">{copy.missing(formatPoints(it.price - balance, copy.locale))}</p>
                  ) : (
                    (f?.stage === 'confirm' || f?.stage === 'buying') && (
                      <>
                        <p className="qx-small mt-2 font-semibold text-fg">{copy.cosmetics.buyTitle}</p>
                        <p className="qx-small text-fg-muted">{copy.cosmetics.buyBody}</p>
                        <p className="qx-small qx-num mt-2 font-semibold text-fg">
                          {copy.detail.balanceChange}: {formatPoints(balance, copy.locale)} → {formatPoints(balance - it.price, copy.locale)}
                        </p>
                      </>
                    )
                  )}
                  {f?.stage === 'confirm' && f.error && (
                    <InlineError variant="banner" className="mt-3">
                      {f.error}
                    </InlineError>
                  )}
                </div>
              )}

              {(it.owned || f?.stage === 'bought') && (
                <div className="rounded-card border border-subtle bg-surface-2 p-4">
                  <p className="qx-small font-semibold text-fg">{copy.cosmetics.pins(catalog.pinsUsed, catalog.pinLimit)}</p>
                  <p className="qx-caption mt-1 text-fg-muted">{copy.cosmetics.pinsHint}</p>
                  {it.giftedBy && (
                    <p className="qx-small mt-3 text-fg">
                      <Gift aria-hidden className="mr-1 inline size-4 text-brand" />
                      {copy.cosmetics.giftFrom(it.giftedBy)}
                      {it.giftMessage ? <span className="mt-1 block italic text-fg-muted">“{it.giftMessage}”</span> : null}
                    </p>
                  )}
                </div>
              )}

              {actionError && <InlineError variant="banner">{actionError}</InlineError>}
            </div>
          );
        }}
      </DetailSheet>
      {current && <GiftDialog item={current} balance={balance} open={giftOpen} onOpenChange={setGiftOpen} onSent={onRefresh} />}
    </>
  );
}
