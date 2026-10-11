'use client';

import { useId, useRef, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import type { CosmeticDTO } from '@/lib/wallet-rewards/types';
import { newIdempotencyKey } from './api';
import { useWalletCopy } from './copy';
import { formatPoints } from './format';

type Recipient = { recipientUserId: string; displayName: string; maskedEmail: string | null };

/**
 * Kozmetik hediye akışı — alıcı önce aranıp DOĞRULANIR (tek eşleşme; maskeli ad + e-posta),
 * sonra açık onayla gönderilir. Puan yalnız onaylanan kimliğe gider (P0-23 sözleşmesi:
 * `GET/POST /api/customer/shop/gift`).
 */
export function GiftDialog({
  item,
  balance,
  open,
  onOpenChange,
  onSent,
}: {
  item: CosmeticDTO;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  const copy = useWalletCopy();
  const qId = useId();
  const msgId = useId();
  const [q, setQ] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  function reset() {
    setQ('');
    setRecipient(null);
    setMessage('');
    setConfirming(false);
    setError(null);
    keyRef.current = null;
  }

  async function lookup() {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer/shop/gift?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { recipient?: Recipient; error?: string } | null;
      if (!res.ok || !json?.recipient) throw new Error(json?.error || copy.errors.generic);
      setRecipient(json.recipient);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : copy.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!recipient) return;
    keyRef.current ??= newIdempotencyKey();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/shop/gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmeticId: item.id, recipientUserId: recipient.recipientUserId, message: message.trim() || null, requestId: keyRef.current, expectedPrice: item.price }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !json?.success) throw new Error(json?.error || copy.errors.generic);
      toast.success(copy.cosmetics.giftSent(recipient.displayName));
      onSent();
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : copy.errors.network);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const insufficient = balance < item.price;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.cosmetics.giftTitle}</DialogTitle>
          <DialogDescription>{copy.cosmetics.giftDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="qx-small text-fg">
            <span className="font-semibold">{item.name}</span> · <span className="qx-num">{copy.points(formatPoints(item.price, copy.locale))}</span>
          </p>

          {!recipient ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void lookup();
              }}
            >
              <div className="min-w-0 flex-1">
                <label htmlFor={qId} className="qx-small mb-1 block font-medium text-fg">
                  {copy.cosmetics.giftSearch}
                </label>
                <input
                  id={qId}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                  maxLength={254}
                  className="qx-small h-11 w-full rounded-control border border-subtle bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button type="submit" variant="outline" loading={busy} disabled={busy || q.trim().length < 3}>
                <Search aria-hidden className="size-4" />
                {copy.cosmetics.giftFind}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-3 rounded-card border border-subtle bg-surface-2 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand" aria-hidden>
                <UserRound className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="qx-caption text-fg-muted">{copy.cosmetics.giftFound}</p>
                <p className="qx-small truncate font-semibold text-fg">{recipient.displayName}</p>
                {recipient.maskedEmail && <p className="qx-caption truncate text-fg-muted">{recipient.maskedEmail}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setRecipient(null); setConfirming(false); }} disabled={busy}>
                {copy.cosmetics.giftChange}
              </Button>
            </div>
          )}

          {recipient && (
            <div>
              <label htmlFor={msgId} className="qx-small mb-1 block font-medium text-fg">
                {copy.cosmetics.giftMessage}
              </label>
              <textarea
                id={msgId}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                rows={3}
                aria-describedby={`${msgId}-count`}
                className="qx-small w-full rounded-control border border-subtle bg-surface-1 p-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p id={`${msgId}-count`} className="qx-caption mt-1 text-right text-fg-muted">
                {copy.cosmetics.giftMessageHint(message.length)}
              </p>
            </div>
          )}

          {confirming && recipient && (
            <div className="rounded-card border border-warning-border bg-warning-subtle p-3" role="alert">
              <p className="qx-small font-semibold text-fg">{copy.cosmetics.giftConfirmTitle}</p>
              <p className="qx-small mt-1 text-fg">{copy.cosmetics.giftConfirmBody(recipient.displayName)}</p>
            </div>
          )}

          {insufficient && <InlineError variant="banner" tone="warning">{copy.missing(formatPoints(item.price - balance, copy.locale))}</InlineError>}
          {error && <InlineError variant="banner">{error}</InlineError>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {copy.detail.cancel}
          </Button>
          {recipient &&
            (confirming ? (
              <Button onClick={() => void send()} loading={busy} disabled={busy || insufficient}>
                {copy.detail.confirm}
              </Button>
            ) : (
              <Button onClick={() => setConfirming(true)} disabled={busy || insufficient}>
                {copy.cosmetics.giftSend(formatPoints(item.price, copy.locale))}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
