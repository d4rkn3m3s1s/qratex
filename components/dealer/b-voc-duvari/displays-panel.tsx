'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, MonitorPlay, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { WallOverviewDto } from '@/lib/dealer/voc-wall/config';
import { WallApiError, createDisplayLink, displaysKey, fetchDisplays, revokeDisplayLink } from './api';

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });

/**
 * Ekran bağlantıları: TV'ye bayi oturumu açmadan, salt-okunur ve iptal edilebilir bağlantı.
 * Bağlantının tamamı YALNIZ oluşturulduğu an gösterilir (sunucuda yalnız özeti tutulur).
 */
export function DisplaysPanel({ overview }: { overview: WallOverviewDto }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: displaysKey, queryFn: fetchDisplays });
  const [label, setLabel] = useState('');
  const [qr, setQr] = useState('');
  const [fresh, setFresh] = useState<{ url: string; label: string } | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; label: string } | null>(null);
  const ids = { label: useId(), qr: useId() };

  const create = useMutation({
    mutationFn: () => createDisplayLink(label.trim(), qr || null),
    onSuccess: (res) => {
      setFresh({ url: `${window.location.origin}/wall/${res.token}`, label: res.display.label });
      setLabel('');
      void qc.invalidateQueries({ queryKey: displaysKey });
    },
    onError: (e) => toast.error(e instanceof WallApiError ? e.message : 'Bağlantı oluşturulamadı.'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeDisplayLink(id),
    onSuccess: () => {
      toast.success('Ekran bağlantısı iptal edildi. Ekran bir sonraki yenilemede kapanır.');
      void qc.invalidateQueries({ queryKey: displaysKey });
    },
    onError: (e) => toast.error(e instanceof WallApiError ? e.message : 'İptal edilemedi.'),
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Bağlantı kopyalandı.');
    } catch {
      toast.error('Kopyalanamadı; bağlantıyı elle seçip kopyalayın.');
    }
  };

  return (
    <SectionCard
      title="Ekran bağlantıları"
      description="Şubedeki TV'de bu bağlantıyı açın. Oturum gerekmez, yalnız onaylı yorumları gösterir; istediğiniz an iptal edebilirsiniz."
      density="compact"
      icon={<MonitorPlay aria-hidden className="h-4 w-4" />}
    >
      <div className="space-y-4">
        {fresh && (
          <div className="space-y-2 rounded-card border border-brand-border bg-brand-subtle p-3" role="status">
            <p className="qx-small font-medium text-fg">“{fresh.label}” bağlantısı hazır. Bu bağlantı yalnız şimdi gösterilir; kaydedin.</p>
            <Input readOnly value={fresh.url} onFocus={(e) => e.currentTarget.select()} aria-label="Ekran bağlantısı" className="min-h-11 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="min-h-11" onClick={() => copy(fresh.url)}>
                <Copy aria-hidden className="mr-1 h-4 w-4" /> Kopyala
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <a href={fresh.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden className="mr-1 h-4 w-4" /> Yeni sekmede aç
                </a>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setFresh(null)}>
                Kapat
              </Button>
            </div>
          </div>
        )}

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={ids.label} className="qx-small font-medium text-fg">
              Ekran adı
            </label>
            <Input id={ids.label} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="ör. Kasa üstü TV" className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.qr} className="qx-small font-medium text-fg">
              Gösterilecek QR / şube
            </label>
            <select
              id={ids.qr}
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              className="min-h-11 w-full rounded-control border border-input bg-background px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">Varsayılan kuralı izle</option>
              {overview.qrCodes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.location ? `${q.location} · ${q.name}` : q.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="min-h-11" disabled={!label.trim() || create.isPending}>
            <Plus aria-hidden className="mr-1 h-4 w-4" /> {create.isPending ? 'Oluşturuluyor…' : 'Bağlantı oluştur'}
          </Button>
        </form>

        <QueryState
          query={query}
          skeleton="list"
          isEmpty={(d) => d.displays.length === 0}
          empty={{ title: 'Henüz ekran bağlantısı yok', description: 'İlk bağlantıyı oluşturup TV tarayıcısında açın.', compact: true }}
        >
          {(d) => (
            <ul className="divide-y divide-subtle">
              {d.displays.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={cn('qx-small truncate font-medium', x.active ? 'text-fg' : 'text-fg-muted line-through')}>{x.label}</p>
                    <p className="qx-caption text-fg-muted">
                      {x.active ? `Geçerli · ${dateFmt.format(new Date(x.expiresAt))} tarihine kadar` : 'İptal edildi ya da süresi doldu'}
                      {x.qrCodeId && ` · ${overview.qrCodes.find((q) => q.id === x.qrCodeId)?.name ?? 'QR'}`}
                    </p>
                  </div>
                  {x.active && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 shrink-0"
                      disabled={revoke.isPending}
                      onClick={() => setRevoking({ id: x.id, label: x.label })}
                    >
                      İptal et
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
      {revoking && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setRevoking(null)}
          tone="warning"
          title={`“${revoking.label}” bağlantısı iptal edilsin mi?`}
          description="Bu bağlantıyı açık tutan ekran en geç 30 saniye içinde kapanır. İptal geri alınamaz; gerekirse yeni bağlantı oluşturursunuz."
          irreversibleNote={false}
          confirmLabel="İptal et"
          onConfirm={() => revoke.mutateAsync(revoking.id).then(() => setRevoking(null))}
        />
      )}
    </SectionCard>
  );
}
