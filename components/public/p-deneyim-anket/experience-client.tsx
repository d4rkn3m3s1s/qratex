'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, Check, Copy, RotateCw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { track } from '@/lib/analytics';
import { getShareCopy, type ShareLocale } from './copy';

/**
 * Deneyim kartı istemci adaları — küçük tutulur; kart ve metinler sunucuda render edilir.
 */

/** Sayfa açıldıktan sonra tek seferlik görüntülenme sayımı (sunucu tekilleştirir). */
export function ExperienceViewBeacon({ token, isOwner }: { token: string; isOwner: boolean }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track('exp_card_view', { owner: isOwner });
    if (isOwner) return; // paylaşanın kendi açışı sayılmaz (sunucu da denetler)
    void fetch(`/api/public/experience-share/${encodeURIComponent(token)}/view`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      /* sayım yardımcıdır; hata kartı etkilemez */
    });
  }, [token, isOwner]);
  return null;
}

/** Ölçülen CTA bağlantısı (kart → kayıt / mekân / yol tarifi hunisi). */
export function TrackedLink({
  href,
  cta,
  external = false,
  className,
  children,
  'aria-label': ariaLabel,
  variant = 'default',
  size = 'lg',
}: {
  href: string;
  cta: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'lg';
}) {
  const onClick = () => track('exp_card_cta_click', { cta });
  return (
    <Button asChild variant={variant} size={size} className={className}>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={ariaLabel}>
          {children}
        </a>
      ) : (
        <Link href={href} onClick={onClick} aria-label={ariaLabel}>
          {children}
        </Link>
      )}
    </Button>
  );
}

/** Geçici hata ekranında: sunucu bileşenini yeniden çalıştır. */
export function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() => {
        setPending(true);
        router.refresh();
        window.setTimeout(() => setPending(false), 1500);
      }}
      className="gap-2"
    >
      {!pending && <RotateCw className="h-4 w-4" aria-hidden />}
      {label}
    </Button>
  );
}

/** Paylaşanın kendi kartını açtığında: görüntülenme, paylaş, paylaşımı durdur. */
export function OwnerPanel({
  token,
  venueName,
  viewCount,
  daysLeftLabel,
  locale,
}: {
  token: string;
  venueName: string;
  viewCount: number;
  daysLeftLabel: string;
  locale: ShareLocale;
}) {
  const copy = getShareCopy(locale);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function share() {
    const url = window.location.href;
    const text = copy.ownerShareText(venueName);
    setMessage(null);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: text, text, url });
        track('exp_card_reshare', { method: 'native' });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // kullanıcı vazgeçti
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce(copy.ownerCopied);
      track('exp_card_reshare', { method: 'copy' });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage(copy.ownerCopyFailed);
    }
  }

  async function revoke() {
    const res = await fetch(`/api/customer/experience-share/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => null);
    if (!res || !res.ok) throw new Error(copy.ownerRevokeFailed);
    announce(copy.ownerRevoked);
    track('exp_card_revoke');
    router.refresh();
  }

  return (
    <section aria-labelledby="exp-owner-title" className="rounded-card border border-brand-border bg-brand-subtle p-4">
      <h2 id="exp-owner-title" className="qx-body font-semibold text-fg">
        {copy.ownerTitle}
      </h2>
      <p className="qx-small mt-1 text-fg-muted">{copy.ownerBody}</p>
      <ul className="qx-small mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <li className="qx-num font-medium text-fg">{copy.ownerViews(viewCount)}</li>
        <li className="text-fg-muted">{daysLeftLabel}</li>
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={share} className="gap-2 sm:flex-1">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : canShare ? <Share2 className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? copy.ownerCopied : copy.ownerShare}
        </Button>
        <ConfirmAction
          trigger={
            <Button type="button" variant="outline" className="gap-2 sm:flex-1">
              <Ban className="h-4 w-4" aria-hidden />
              {copy.ownerRevoke}
            </Button>
          }
          tone="danger"
          title={copy.ownerRevokeConfirmTitle}
          description={copy.ownerRevokeConfirmBody}
          confirmLabel={copy.ownerRevokeConfirm}
          cancelLabel={copy.ownerRevokeCancel}
          irreversibleNote={false}
          onConfirm={revoke}
        />
      </div>
      {message && (
        <p role="alert" className="qx-small mt-2 text-danger">
          {message}
        </p>
      )}
    </section>
  );
}
