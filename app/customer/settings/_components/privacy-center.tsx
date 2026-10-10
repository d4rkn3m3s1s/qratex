'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Download, FileText, Loader2, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineError, QueryState, SectionCard, TONE_CHIP, type Tone } from '@/components/states';
import { ConsentSummaryCard } from '@/components/analytics/consent-preferences-button';
import { cn } from '@/lib/utils';
import { DSR_TYPE_LABELS, type DsrType } from '@/lib/dsr-workflow';

interface OwnRequest {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  message: string | null;
  createdAt: string;
  processedAt: string | null;
  dueAt: string;
  downloadable: boolean;
  timeline: Array<{ type: string; label: string; at: string }>;
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.ok === false) {
    const msg = (json && typeof json.error === 'string' && json.error) || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
    throw new RequestError(msg, res.status);
  }
  return (json.data ?? json) as T;
}

async function saveDownload(res: Response, fallbackName: string) {
  if (!res.ok) {
    await readEnvelope(res);
    return;
  }
  const blob = await res.blob();
  const dispo = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(dispo)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const STATUS_TONE: Record<string, Tone> = {
  received: 'info',
  in_review: 'warning',
  completed: 'success',
  rejected: 'neutral',
};

const FORM_TYPES: Array<{ value: DsrType; hint: string }> = [
  { value: 'rectification', hint: 'Yanlış ya da eksik bir bilginizi düzeltmemizi isteyin.' },
  { value: 'objection', hint: 'Verilerinizin işlenmesine ya da otomatik bir değerlendirmeye (ör. güven puanı) itiraz edin.' },
  { value: 'access', hint: 'Verilerinizin nasıl işlendiğine dair resmî yanıt isteyin. Kopyanız için “Verilerimi indir” anında çalışır.' },
  { value: 'deletion', hint: 'Hesabınızı ve kişisel verilerinizi silmemizi isteyin. Hesap hemen silinmek istenirse aşağıdaki “Hesabı sil” kullanılabilir.' },
];

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

/**
 * Ayarlar › Gizlilik: KVKK haklarının GERÇEKTEN kullanıldığı yer (P0-31, P0-34).
 *  - Çerez/izleme tercihinin özeti ve tercih merkezi.
 *  - "Verilerimi indir": tam envanter paketi; her indirme kanıtlı bir erişim başvurusu olur.
 *  - Düzeltme / itiraz / erişim / silme başvurusu: hesap e-postasına makbuz, 30 gün sayaç.
 *  - Başvurularım: durum, son tarih, yürütme adımları ve hazır paketin indirilmesi.
 */
export function PrivacyCenter() {
  const qc = useQueryClient();
  const [type, setType] = useState<DsrType>('rectification');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ['own-privacy-requests'],
    queryFn: async () => readEnvelope<{ requests: OwnRequest[] }>(await fetch('/api/customer/privacy-request', { cache: 'no-store' })),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/customer/privacy-request/self-export', { method: 'POST', credentials: 'same-origin' });
      await saveDownload(res, 'qratex-verilerim.json');
    },
    onSuccess: () => {
      toast.success('Veri paketiniz indirildi. İndirme, başvurularınız arasına kaydedildi.');
      void qc.invalidateQueries({ queryKey: ['own-privacy-requests'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Veri paketi indirilemedi.'),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/customer/privacy-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ type, message: message.trim() || undefined }),
      });
      return readEnvelope<{ message?: string }>(res);
    },
    onSuccess: (data) => {
      setMessage('');
      setFormError(null);
      toast.success(data.message ?? 'Başvurunuz alındı.');
      void qc.invalidateQueries({ queryKey: ['own-privacy-requests'] });
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Başvuru gönderilemedi.'),
  });

  const download = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/customer/privacy-request/${encodeURIComponent(id)}/export`, { credentials: 'same-origin' });
      await saveDownload(res, 'qratex-verilerim.json');
    },
    onSuccess: () => toast.success('Veri paketiniz indirildi.'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Veri paketi indirilemedi.'),
  });

  const needsMessage = type === 'rectification' || type === 'objection';
  const tooShort = needsMessage && message.trim().length < 10;
  const hint = FORM_TYPES.find((t) => t.value === type)?.hint;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Çerez ve izleme tercihleri"
        description="Analitik ve oturum kaydı yalnız izin verirseniz çalışır. Kararınızı istediğiniz an değiştirebilirsiniz."
        icon={<ShieldCheck className="h-4 w-4" />}
        headingLevel="h3"
      >
        <ConsentSummaryCard surface="settings" />
      </SectionCard>

      <SectionCard
        title="Verilerimi indir"
        description="Hesabınıza bağlı tüm kişisel verilerin (profil, yorumlar, puan hareketleri, QRA sohbetleri, bildirimler, cihazlar ve daha fazlası) makine tarafından okunabilir kopyası."
        icon={<Download className="h-4 w-4" />}
        headingLevel="h3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-muted">Her indirme KVKK erişim başvurusu olarak kayda geçer. Günde en fazla 3 kez indirilebilir.</p>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 shrink-0 gap-2"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {exportMutation.isPending ? 'Hazırlanıyor…' : 'Verilerimi indir'}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="KVKK başvurusu"
        description="6698 sayılı Kanun'un 11. maddesindeki haklarınız için başvurun. Makbuz hesabınızın e-posta adresine gönderilir; en geç 30 gün içinde sonuçlandırılır."
        icon={<FileText className="h-4 w-4" />}
        headingLevel="h3"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooShort) submit.mutate();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Başvuru türü</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORM_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                    type === t.value ? 'border-brand-border bg-brand-subtle text-fg' : 'border-border text-fg-muted hover:bg-surface-muted'
                  )}
                >
                  <input
                    type="radio"
                    name="dsr-type"
                    value={t.value}
                    checked={type === t.value}
                    onChange={() => setType(t.value)}
                    className="accent-[hsl(var(--brand))]"
                  />
                  {DSR_TYPE_LABELS[t.value]}
                </label>
              ))}
            </div>
            {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="dsr-message">{needsMessage ? 'Açıklama (zorunlu)' : 'Açıklama (isteğe bağlı)'}</Label>
            <Textarea
              id="dsr-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={
                type === 'rectification'
                  ? 'Ör. Telefon numaram yanlış kayıtlı; doğrusu …'
                  : type === 'objection'
                    ? 'Ör. Güven puanımın düşük hesaplanmasına itiraz ediyorum, çünkü …'
                    : 'Eklemek istediğiniz bir not varsa yazın.'
              }
              aria-describedby={formError ? 'dsr-form-error' : undefined}
            />
          </div>
          {formError ? <InlineError id="dsr-form-error">{formError}</InlineError> : null}
          <Button type="submit" className="min-h-10 gap-2" disabled={submit.isPending || tooShort}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Başvuruyu gönder
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Başvurularım" icon={<Clock className="h-4 w-4" />} headingLevel="h3" density="flush">
        <QueryState
          query={requests}
          skeleton="list"
          isEmpty={(d) => d.requests.length === 0}
          empty={{ compact: true, title: 'Henüz başvurunuz yok', description: 'Gönderdiğiniz başvurular ve indirmeleriniz burada adım adım görünür.' }}
          error={{ title: 'Başvurular yüklenemedi' }}
        >
          {(d) => (
            <ul className="divide-y divide-border">
              {d.requests.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{r.typeLabel}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[STATUS_TONE[r.status] ?? 'neutral'])}>
                      {r.statusLabel}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {dateFmt.format(new Date(r.createdAt))}
                      {r.status === 'received' || r.status === 'in_review'
                        ? ` · En geç ${dateFmt.format(new Date(r.dueAt))}`
                        : r.processedAt
                          ? ` · Sonuç ${dateFmt.format(new Date(r.processedAt))}`
                          : ''}
                    </span>
                  </div>
                  {r.timeline.length > 0 ? (
                    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
                      {r.timeline.map((e, i) => (
                        <li key={`${e.type}-${i}`} className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
                          {e.label}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {r.downloadable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={download.isPending}
                      onClick={() => download.mutate(r.id)}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Veri paketini indir
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
