'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Ban, Copy, Download, Unlock, Printer, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, StatusBadge, statusBadgeProps, Timeline } from '@/components/ds/data';
import { ConfirmAction, ErrorState, SkeletonDetail } from '@/components/states';
import type { CardDetail } from '@/lib/admin-cards/contract';
import { archiveCard, assignCard, bulkCards, cardsKeys, errorText, fetchDetail, previewArchive, unassignCard } from './api';
import { AssignDialog, BlockDialog } from './dialogs';
import { CARD_STATUS, copyText, customerLabel, fmtDate, fmtDateTime, fmtNumber, groupToken, viewStatus } from './format';

type QrState = { token: string; png: string; svg: string } | { token: string; error: true } | null;

/**
 * QR kodu kartın KENDİ token'ından üretilir; sonuç gelirken seçili token değiştiyse atılır
 * (eski sürüm önceki kartın QR'ını yeni kartın yanında gösterebiliyordu — B5).
 */
function useCardQr(token: string, url: string) {
  const [state, setState] = useState<QrState>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState(null);
    import('qrcode')
      .then(async (QR) => {
        const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#000000', light: '#ffffff' } };
        const [png, svg] = await Promise.all([QR.toDataURL(url, { ...opts, width: 640 }), QR.toString(url, { ...opts, type: 'svg' })]);
        if (live) setState({ token, png, svg });
      })
      .catch(() => live && setState({ token, error: true }));
    return () => {
      live = false;
    };
  }, [token, url, attempt]);
  const current = state && state.token === token ? state : null;
  return { qr: current, retry: () => setAttempt((n) => n + 1) };
}

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function printQr(png: string, token: string) {
  const w = window.open('', '_blank', 'width=480,height=640');
  if (!w) {
    toast.error('Yazdırma penceresi açılamadı. Açılır pencere engelini kaldırıp tekrar deneyin.');
    return;
  }
  const doc = w.document;
  doc.title = `Kart ${token}`;
  const img = doc.createElement('img');
  img.src = png;
  img.alt = `Kart ${token} QR kodu`;
  img.style.cssText = 'width:60mm;height:60mm;display:block;margin:10mm auto 2mm';
  const p = doc.createElement('p');
  p.textContent = groupToken(token);
  p.style.cssText = 'text-align:center;font:10pt ui-monospace,monospace';
  doc.body.append(img, p);
  img.onload = () => {
    w.focus();
    w.print();
  };
}

function CardQr({ card }: { card: CardDetail }) {
  const { qr, retry } = useCardQr(card.token, card.url);
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-subtle bg-surface-1 p-4 sm:flex-row sm:items-start">
      <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg bg-white p-1" aria-live="polite">
        {qr && 'png' in qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr.png} alt={`Kart ${card.token} için QR kodu`} className="h-full w-full" />
        ) : qr ? (
          <div className="space-y-2 p-2 text-center">
            <p className="text-xs text-danger">QR üretilemedi.</p>
            <Button size="sm" variant="outline" className="min-h-11" onClick={retry}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Tekrar dene
            </Button>
          </div>
        ) : (
          <div className="h-full w-full animate-pulse rounded bg-surface-3 motion-reduce:animate-none" role="status" aria-label="QR kodu hazırlanıyor" />
        )}
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className="break-all font-mono text-sm text-fg">{card.url}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={async () => ((await copyText(card.url)) ? toast.success('Kart bağlantısı kopyalandı') : toast.error('Kopyalanamadı; bağlantıyı elle seçin.'))}
          >
            <Copy className="h-4 w-4" aria-hidden />
            Bağlantıyı kopyala
          </Button>
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={!qr || !('png' in qr)} onClick={() => qr && 'png' in qr && download(`kart-${card.token}.png`, qr.png)}>
            <Download className="h-4 w-4" aria-hidden />
            PNG
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={!qr || !('svg' in qr)}
            onClick={() => {
              if (!qr || !('svg' in qr)) return;
              const href = URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml' }));
              download(`kart-${card.token}.svg`, href);
              setTimeout(() => URL.revokeObjectURL(href), 1000);
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
            SVG
          </Button>
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={!qr || !('png' in qr)} onClick={() => qr && 'png' in qr && printQr(qr.png, card.token)}>
            <Printer className="h-4 w-4" aria-hidden />
            Yazdır
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CardDetailBody({ id, onChanged }: { id: string; onChanged: () => void }) {
  const q = useQuery({ queryKey: cardsKeys.detail(id), queryFn: () => fetchDetail(id), staleTime: 10_000 });
  const [blockOpen, setBlockOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  if (q.isLoading) return <SkeletonDetail />;
  if (q.isError || !q.data)
    return <ErrorState title="Kart yüklenemedi" description={errorText(q.error)} onRetry={() => q.refetch()} />;

  const card = q.data;
  const after = async (msg: string) => {
    toast.success(msg);
    await q.refetch();
    onChanged();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...statusBadgeProps(CARD_STATUS, viewStatus(card))} />
        {card.status === 'BLOCKED' && card.blockReason ? <span className="text-sm text-fg-muted">{card.blockReason}</span> : null}
      </div>

      <CardQr card={card} />

      <section aria-labelledby={`card-actions-${card.id}`} className="space-y-2">
        <h3 id={`card-actions-${card.id}`} className="text-sm font-semibold text-fg">
          İşlemler
        </h3>
        {card.archived ? (
          <p className="text-sm text-fg-muted">Arşivlenmiş kart terminaldir: üzerinde işlem yapılamaz, geçmişi korunur.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {card.allowed.assign ? (
              <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4" aria-hidden />
                Müşteriye ata
              </Button>
            ) : null}
            {card.allowed.unassign ? (
              <ConfirmAction
                tone="warning"
                trigger={
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                    <UserMinus className="h-4 w-4" aria-hidden />
                    Müşteriden kaldır
                  </Button>
                }
                title="Kart müşteriden kaldırılsın mı?"
                description={`Kart ${customerLabel(card.customer)} hesabından ayrılır ve “Kullanılmamış” durumuna döner; ${fmtNumber(card.consumptions)} tüketim kaydı korunur. Müşteriye bildirim gider.`}
                confirmLabel="Müşteriden kaldır"
                onConfirm={async () => {
                  await unassignCard(card.id);
                  await after('Kart müşteriden kaldırıldı');
                }}
              />
            ) : null}
            {card.allowed.block ? (
              <Button size="sm" variant="outline" className="min-h-11 text-danger sm:min-h-9" onClick={() => setBlockOpen(true)}>
                <Ban className="h-4 w-4" aria-hidden />
                Blokla
              </Button>
            ) : null}
            {card.allowed.unblock ? (
              <ConfirmAction
                tone="brand"
                trigger={
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                    <Unlock className="h-4 w-4" aria-hidden />
                    Bloğu kaldır
                  </Button>
                }
                title="Blok kaldırılsın mı?"
                description={
                  card.unblockTo === 'ACTIVATED'
                    ? `Kart ${customerLabel(card.customer)} hesabında yeniden “Aktif” olur.`
                    : 'Kart kimseye bağlı değil; “Kullanılmamış” durumuna döner ve tarayan ilk müşteri tarafından aktive edilebilir.'
                }
                confirmLabel="Bloğu kaldır"
                onConfirm={async () => {
                  await bulkCards({ action: 'unblock', ids: [card.id], notify: !!card.customer });
                  await after('Blok kaldırıldı');
                }}
              />
            ) : null}
            {card.allowed.archive ? (
              <ConfirmAction
                tone="danger"
                trigger={
                  <Button size="sm" variant="ghost" className="min-h-11 text-danger sm:min-h-9">
                    <Archive className="h-4 w-4" aria-hidden />
                    Arşivle
                  </Button>
                }
                title="Kart arşivlensin mi?"
                description="Kart kalıcı olarak kullanım dışı kalır. Tüketimler, yorumlar ve kartın denetim izi silinmez."
                loadImpact={async () => {
                  const impact = await previewArchive(card.id);
                  return {
                    items: (impact?.items ?? []).map((i) => ({ label: i.label, value: fmtNumber(i.value), emphasis: i.emphasis })),
                    warning: impact?.warning,
                  };
                }}
                confirmPhrase={card.customer || card.consumptions > 0 ? card.token : undefined}
                confirmLabel="Arşivle"
                onConfirm={async () => {
                  await archiveCard(card.id);
                  await after('Kart arşivlendi; geçmiş korundu');
                }}
              />
            ) : null}
          </div>
        )}
      </section>

      <KeyValueList
        items={[
          { id: 'token', label: 'Kod', value: groupToken(card.token), copyValue: card.token, mono: true },
          { id: 'id', label: 'Kart kimliği', value: card.id, copyValue: card.id, mono: true },
          {
            id: 'customer',
            label: 'Müşteri',
            value: card.customer ? (
              <Link href={`/admin/users/${card.customer.id}`} className="font-medium text-brand underline-offset-4 hover:underline focus-visible:underline">
                {customerLabel(card.customer)}
              </Link>
            ) : null,
            hint: card.customer?.name ? card.customer.email : undefined,
          },
          {
            id: 'batch',
            label: 'Üretim partisi',
            value: card.batchId ? (
              <Link href={`/admin/cards?batch=${encodeURIComponent(card.batchId)}`} className="text-brand underline-offset-4 hover:underline focus-visible:underline">
                {card.batchName ?? card.batchId}
              </Link>
            ) : null,
            hint: card.batchCreatedAt ? fmtDate(card.batchCreatedAt) : undefined,
          },
          { id: 'created', label: 'Üretim', value: fmtDateTime(card.createdAt) },
          { id: 'activated', label: 'Aktivasyon', value: card.activatedAt ? fmtDateTime(card.activatedAt) : null },
          { id: 'blocked', label: 'Bloklanma', value: card.blockedAt ? fmtDateTime(card.blockedAt) : null, hidden: !card.blockedAt },
          { id: 'consumptions', label: 'Tüketim', value: fmtNumber(card.consumptions), hint: card.lastConsumptionAt ? `Son: ${fmtDateTime(card.lastConsumptionAt)}` : undefined },
        ]}
      />

      <section aria-labelledby={`card-tl-${card.id}`} className="space-y-2">
        <h3 id={`card-tl-${card.id}`} className="text-sm font-semibold text-fg">
          Zaman çizelgesi
        </h3>
        <p className="text-xs text-fg-muted">Son 50 kart olayı ve son 10 tüketim.</p>
        <Timeline
          ariaLabel="Kart olayları"
          dense
          timeStyle="datetime"
          events={card.timeline.map((e) => ({ id: e.id, title: e.title, description: e.description ?? undefined, at: e.at, tone: e.tone, actor: e.actor ?? undefined }))}
          emptyLabel="Bu kart için kayıtlı olay yok."
        />
      </section>

      {q.isRefetching ? <p className="sr-only" role="status">Güncelleniyor</p> : null}

      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title="Kart bloklansın mı?"
        canNotify={!!card.customer}
        onConfirm={async (v) => {
          await bulkCards({ action: 'block', ids: [card.id], ...v });
          await after('Kart bloklandı');
        }}
      />
      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        token={card.token}
        onConfirm={async (customerId) => {
          await assignCard(card.id, customerId);
          await after('Kart müşteriye atandı');
        }}
      />
    </div>
  );
}
