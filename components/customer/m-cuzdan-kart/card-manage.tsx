'use client';

/**
 * Kart yönetimi: telefon cüzdanı (yalnız yapılandırma tam + uygun platform), dondur/çöz,
 * "kartımı kaybettim → yeni kod". "Paylaş" yok: kart kodu kasa yetkisi taşır (my-card B3).
 */
import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone, Snowflake, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction, SectionCard } from '@/components/states';
import type { WalletCard, WalletCardPayload } from '@/lib/wallet-card/dto';
import type { CardAction } from '@/lib/wallet-card/actions';
import type { CardCopy } from './copy';

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const iPadOs = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOs || /Macintosh/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

async function postAction(cardId: string, action: CardAction): Promise<void> {
  const res = await fetch(`/api/customer/wallet/card/${encodeURIComponent(cardId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof body.error === 'string' && body.error ? body.error : '');
  }
}

export function CardManage({
  card,
  wallet,
  copy,
  onChanged,
}: {
  card: WalletCard;
  wallet: WalletCardPayload['wallet'];
  copy: CardCopy;
  onChanged: () => Promise<unknown> | void;
}) {
  const [platform, setPlatform] = useState<Platform>('other');
  const [walletBusy, setWalletBusy] = useState<'apple' | 'google' | null>(null);
  const [busy, setBusy] = useState<CardAction | null>(null);
  useEffect(() => setPlatform(detectPlatform()), []);

  const adminBlocked = card.status === 'BLOCKED' && !card.frozenByCustomer;
  if (adminBlocked || card.status === 'UNUSED') return null;

  const active = card.status === 'ACTIVATED';
  const showApple = active && wallet.apple && platform === 'ios';
  const showGoogle = active && wallet.google && platform !== 'ios';

  const run = async (action: CardAction, success: string) => {
    setBusy(action);
    try {
      await postAction(card.id, action);
      toast.success(success);
      await onChanged();
    } catch (error) {
      // ConfirmAction diyaloğu açık kalsın ve hatayı göstersin diye yeniden fırlat.
      const message = error instanceof Error && error.message ? error.message : copy.actionFailed;
      toast.error(message);
      throw new Error(message);
    } finally {
      setBusy(null);
    }
  };

  const addGoogle = async () => {
    setWalletBusy('google');
    try {
      const res = await fetch(`/api/wallet/google?cardId=${encodeURIComponent(card.id)}`);
      const body = (await res.json().catch(() => ({}))) as { saveUrl?: string; data?: { saveUrl?: string } };
      const url = body.saveUrl ?? body.data?.saveUrl;
      if (res.ok && url) window.location.assign(url);
      else toast.error(copy.walletFailed);
    } catch {
      toast.error(copy.walletFailed);
    } finally {
      setWalletBusy(null);
    }
  };

  const addApple = () => {
    setWalletBusy('apple');
    // iOS Safari pkpass'i yalnız doğrudan gezinmeyle Wallet'a açar (blob + a[download] değil).
    window.location.assign(`/api/wallet/apple?cardId=${encodeURIComponent(card.id)}`);
    window.setTimeout(() => setWalletBusy(null), 4000);
  };

  return (
    <SectionCard title={copy.manageTitle} icon={<ShieldCheck />}>
      <div className="space-y-3">
        {(showApple || showGoogle) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {showApple && (
              <Button type="button" variant="outline" className="min-h-11" onClick={addApple} loading={walletBusy === 'apple'}>
                <Smartphone className="h-4 w-4" aria-hidden />
                {copy.wallet} · Apple Wallet
              </Button>
            )}
            {showGoogle && (
              <Button type="button" variant="outline" className="min-h-11" onClick={addGoogle} loading={walletBusy === 'google'}>
                <Smartphone className="h-4 w-4" aria-hidden />
                {copy.wallet} · Google
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {card.frozenByCustomer ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              loading={busy === 'unfreeze'}
              onClick={() => void run('unfreeze', copy.unfrozen).catch(() => undefined)}
            >
              <Sun className="h-4 w-4" aria-hidden />
              {copy.unfreeze}
            </Button>
          ) : (
            <ConfirmAction
              tone="warning"
              title={copy.freezeTitle}
              description={copy.freezeDesc}
              confirmLabel={copy.freezeConfirm}
              irreversibleNote={false}
              onConfirm={() => run('freeze', copy.frozen)}
              trigger={
                <Button type="button" variant="outline" className="min-h-11" loading={busy === 'freeze'}>
                  <Snowflake className="h-4 w-4" aria-hidden />
                  {copy.freeze}
                </Button>
              }
            />
          )}
          <ConfirmAction
            tone="danger"
            title={copy.rotateTitle}
            description={copy.rotateDesc}
            confirmLabel={copy.rotateConfirm}
            onConfirm={() => run('rotate', copy.rotated)}
            trigger={
              <Button type="button" variant="outline" className="min-h-11 text-danger" loading={busy === 'rotate'}>
                <KeyRound className="h-4 w-4" aria-hidden />
                {copy.rotate}
              </Button>
            }
          />
        </div>

        <p className="qx-caption flex items-start gap-2 text-fg-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          {copy.safety}
        </p>
      </div>
    </SectionCard>
  );
}
