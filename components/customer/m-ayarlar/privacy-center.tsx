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
import { DSR_EVENT_LABELS, DSR_STATUS_LABELS, DSR_TYPE_LABELS, type DsrType } from '@/lib/dsr-workflow';
import { useFormatters, useLocaleSafe } from '@/lib/app-locale';

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

async function readEnvelope<T>(res: Response, fallback: string): Promise<T> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.ok === false) {
    // Sunucu (zarf v2) hata metnini dil çerezine göre seçer (lib/http/error-locale).
    const msg = (json && typeof json.error === 'string' && json.error) || fallback;
    throw new RequestError(msg, res.status);
  }
  return (json.data ?? json) as T;
}

async function saveDownload(res: Response, fallbackName: string, errorFallback: string) {
  if (!res.ok) {
    await readEnvelope(res, errorFallback);
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

const FORM_ORDER: DsrType[] = ['rectification', 'objection', 'access', 'deletion'];

/**
 * Metinler (TR/EN — mobil-erisilebilirlik-i18n B1). Tür/durum/adım etiketleri sunucunun Türkçe
 * etiketi yerine KODDAN seçilir; İngilizce arayüzde karışık dil kalmaz.
 */
const COPY = {
  tr: {
    hints: {
      rectification: 'Yanlış ya da eksik bir bilginizi düzeltmemizi isteyin.',
      objection: 'Verilerinizin işlenmesine ya da otomatik bir değerlendirmeye (ör. güven puanı) itiraz edin.',
      access: 'Verilerinizin nasıl işlendiğine dair resmî yanıt isteyin. Kopyanız için “Verilerimi indir” anında çalışır.',
      deletion: 'Hesabınızı ve kişisel verilerinizi silmemizi isteyin. Hesap hemen silinmek istenirse aşağıdaki “Hesabı sil” kullanılabilir.',
    } as Record<DsrType, string>,
    typeLabels: DSR_TYPE_LABELS as Record<string, string>,
    statusLabels: DSR_STATUS_LABELS as Record<string, string>,
    eventLabels: DSR_EVENT_LABELS as Record<string, string>,
    genericError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    exportFile: 'qratex-verilerim.json',
    exported: 'Veri paketiniz indirildi. İndirme, başvurularınız arasına kaydedildi.',
    exportFailed: 'Veri paketi indirilemedi.',
    received: 'Başvurunuz alındı.',
    submitFailed: 'Başvuru gönderilemedi.',
    downloaded: 'Veri paketiniz indirildi.',
    consentTitle: 'Çerez ve izleme tercihleri',
    consentDesc: 'Analitik ve oturum kaydı yalnız izin verirseniz çalışır. Kararınızı istediğiniz an değiştirebilirsiniz.',
    exportTitle: 'Verilerimi indir',
    exportDesc:
      'Hesabınıza bağlı tüm kişisel verilerin (profil, yorumlar, puan hareketleri, QRA sohbetleri, bildirimler, cihazlar ve daha fazlası) makine tarafından okunabilir kopyası.',
    exportNote: 'Her indirme KVKK erişim başvurusu olarak kayda geçer. Günde en fazla 3 kez indirilebilir.',
    preparing: 'Hazırlanıyor…',
    dsrTitle: 'KVKK başvurusu',
    dsrDesc:
      "6698 sayılı Kanun'un 11. maddesindeki haklarınız için başvurun. Makbuz hesabınızın e-posta adresine gönderilir; en geç 30 gün içinde sonuçlandırılır.",
    typeLegend: 'Başvuru türü',
    messageRequired: 'Açıklama (zorunlu)',
    messageOptional: 'Açıklama (isteğe bağlı)',
    phRectification: 'Ör. Telefon numaram yanlış kayıtlı; doğrusu …',
    phObjection: 'Ör. Güven puanımın düşük hesaplanmasına itiraz ediyorum, çünkü …',
    phOther: 'Eklemek istediğiniz bir not varsa yazın.',
    minLength: 'Açıklama en az 10 karakter olmalı.',
    submit: 'Başvuruyu gönder',
    listTitle: 'Başvurularım',
    emptyTitle: 'Henüz başvurunuz yok',
    emptyDesc: 'Gönderdiğiniz başvurular ve indirmeleriniz burada adım adım görünür.',
    listError: 'Başvurular yüklenemedi',
    dueBy: (d: string) => ` · En geç ${d}`,
    resultAt: (d: string) => ` · Sonuç ${d}`,
    downloadPackage: 'Veri paketini indir',
  },
  en: {
    hints: {
      rectification: 'Ask us to correct information about you that is wrong or incomplete.',
      objection: 'Object to the processing of your data or to an automated assessment (e.g. trust score).',
      access: 'Request an official answer on how your data is processed. For your copy, “Download my data” works instantly.',
      deletion: 'Ask us to delete your account and personal data. To delete the account right away, use “Delete account” below.',
    } as Record<DsrType, string>,
    typeLabels: {
      access: 'Access to my data (copy)',
      deletion: 'Deletion of my data',
      rectification: 'Correction of my data',
      objection: 'Objection to processing / automated decision',
    } as Record<string, string>,
    statusLabels: { received: 'Received', in_review: 'In review', completed: 'Completed', rejected: 'Rejected' } as Record<string, string>,
    eventLabels: {
      received: 'Request received',
      verified: 'Identity verified',
      in_review: 'Taken into review',
      export_generated: 'Data package generated',
      export_downloaded: 'Data package downloaded',
      erasure_executed: 'Deletion / anonymisation carried out',
      rectified: 'Correction made',
      objection_resolved: 'Objection resolved',
      notified: 'Requester notified',
      notify_failed: 'Notification could not be sent',
      rejected: 'Rejected',
      reopened: 'Reopened',
      completed: 'Completed',
      note: 'Note',
    } as Record<string, string>,
    genericError: 'The action could not be completed. Please try again.',
    exportFile: 'qratex-my-data.json',
    exported: 'Your data package was downloaded. The download was recorded among your requests.',
    exportFailed: 'The data package could not be downloaded.',
    received: 'Your request was received.',
    submitFailed: 'The request could not be sent.',
    downloaded: 'Your data package was downloaded.',
    consentTitle: 'Cookie and tracking preferences',
    consentDesc: 'Analytics and session recording only run if you allow them. You can change your choice at any time.',
    exportTitle: 'Download my data',
    exportDesc:
      'A machine-readable copy of all personal data linked to your account (profile, reviews, point history, QRA chats, notifications, devices and more).',
    exportNote: 'Each download is recorded as a KVKK access request. You can download up to 3 times a day.',
    preparing: 'Preparing…',
    dsrTitle: 'KVKK request',
    dsrDesc:
      'Apply for your rights under Article 11 of Law No. 6698 (KVKK). A receipt is sent to your account email; requests are concluded within 30 days at the latest.',
    typeLegend: 'Request type',
    messageRequired: 'Details (required)',
    messageOptional: 'Details (optional)',
    phRectification: 'E.g. My phone number is recorded incorrectly; the correct one is …',
    phObjection: 'E.g. I object to my trust score being calculated low, because …',
    phOther: 'Add a note if you like.',
    minLength: 'Details must be at least 10 characters.',
    submit: 'Send request',
    listTitle: 'My requests',
    emptyTitle: 'No requests yet',
    emptyDesc: 'Requests you send and your downloads appear here step by step.',
    listError: 'Requests could not be loaded',
    dueBy: (d: string) => ` · Due by ${d}`,
    resultAt: (d: string) => ` · Concluded ${d}`,
    downloadPackage: 'Download data package',
  },
};

/**
 * Ayarlar › Gizlilik: KVKK haklarının GERÇEKTEN kullanıldığı yer (P0-31, P0-34).
 *  - Çerez/izleme tercihinin özeti ve tercih merkezi.
 *  - "Verilerimi indir": tam envanter paketi; her indirme kanıtlı bir erişim başvurusu olur.
 *  - Düzeltme / itiraz / erişim / silme başvurusu: hesap e-postasına makbuz, 30 gün sayaç.
 *  - Başvurularım: durum, son tarih, yürütme adımları ve hazır paketin indirilmesi.
 */
export function PrivacyCenter() {
  const qc = useQueryClient();
  const locale = useLocaleSafe() === 'en' ? 'en' : 'tr';
  const copy = COPY[locale];
  const fmt = useFormatters();
  const [type, setType] = useState<DsrType>('rectification');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ['own-privacy-requests'],
    queryFn: async () =>
      readEnvelope<{ requests: OwnRequest[] }>(await fetch('/api/customer/privacy-request', { cache: 'no-store' }), copy.genericError),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/customer/privacy-request/self-export', { method: 'POST', credentials: 'same-origin' });
      await saveDownload(res, copy.exportFile, copy.exportFailed);
    },
    onSuccess: () => {
      toast.success(copy.exported);
      void qc.invalidateQueries({ queryKey: ['own-privacy-requests'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : copy.exportFailed),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/customer/privacy-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ type, message: message.trim() || undefined }),
      });
      return readEnvelope<{ message?: string }>(res, copy.submitFailed);
    },
    onSuccess: (data) => {
      setMessage('');
      setFormError(null);
      // Sunucunun onay metni Türkçe; İngilizce arayüzde yerel metin gösterilir.
      toast.success((locale === 'tr' ? data.message : undefined) ?? copy.received);
      void qc.invalidateQueries({ queryKey: ['own-privacy-requests'] });
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : copy.submitFailed),
  });

  const download = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/customer/privacy-request/${encodeURIComponent(id)}/export`, { credentials: 'same-origin' });
      await saveDownload(res, copy.exportFile, copy.exportFailed);
    },
    onSuccess: () => toast.success(copy.downloaded),
    onError: (e) => toast.error(e instanceof Error ? e.message : copy.exportFailed),
  });

  const needsMessage = type === 'rectification' || type === 'objection';
  const tooShort = needsMessage && message.trim().length < 10;
  const hint = copy.hints[type];
  const dateText = (iso: string) => fmt.date(iso);
  const describedBy = [needsMessage ? 'dsr-message-rule' : null, formError ? 'dsr-form-error' : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <SectionCard
        title={copy.consentTitle}
        description={copy.consentDesc}
        icon={<ShieldCheck className="h-4 w-4" />}
        headingLevel="h3"
      >
        <ConsentSummaryCard surface="settings" />
      </SectionCard>

      <SectionCard
        title={copy.exportTitle}
        description={copy.exportDesc}
        icon={<Download className="h-4 w-4" />}
        headingLevel="h3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-muted">{copy.exportNote}</p>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 shrink-0 gap-2"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {exportMutation.isPending ? copy.preparing : copy.exportTitle}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title={copy.dsrTitle}
        description={copy.dsrDesc}
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
            <legend className="text-sm font-medium text-fg">{copy.typeLegend}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORM_ORDER.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                    type === value ? 'border-brand-border bg-brand-subtle text-fg' : 'border-border text-fg-muted hover:bg-surface-muted'
                  )}
                >
                  <input
                    type="radio"
                    name="dsr-type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="accent-[hsl(var(--brand))]"
                  />
                  {copy.typeLabels[value]}
                </label>
              ))}
            </div>
            {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="dsr-message">{needsMessage ? copy.messageRequired : copy.messageOptional}</Label>
            <Textarea
              id="dsr-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={type === 'rectification' ? copy.phRectification : type === 'objection' ? copy.phObjection : copy.phOther}
              aria-required={needsMessage || undefined}
              aria-invalid={formError ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {/* Gönder neden pasif: kural görünür ve alana bağlı (eskiden yalnız devre dışı düğme vardı). */}
            {needsMessage ? (
              <p id="dsr-message-rule" className="text-xs text-fg-muted">
                {copy.minLength}
              </p>
            ) : null}
          </div>
          {formError ? <InlineError id="dsr-form-error">{formError}</InlineError> : null}
          <Button type="submit" className="min-h-10 gap-2" disabled={submit.isPending || tooShort}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {copy.submit}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title={copy.listTitle} icon={<Clock className="h-4 w-4" />} headingLevel="h3" density="flush">
        <QueryState
          query={requests}
          skeleton="list"
          isEmpty={(d) => d.requests.length === 0}
          empty={{ compact: true, title: copy.emptyTitle, description: copy.emptyDesc }}
          error={{ title: copy.listError }}
        >
          {(d) => (
            <ul className="divide-y divide-border">
              {d.requests.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{copy.typeLabels[r.type] ?? r.typeLabel}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[STATUS_TONE[r.status] ?? 'neutral'])}>
                      {copy.statusLabels[r.status] ?? r.statusLabel}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {dateText(r.createdAt)}
                      {r.status === 'received' || r.status === 'in_review'
                        ? copy.dueBy(dateText(r.dueAt))
                        : r.processedAt
                          ? copy.resultAt(dateText(r.processedAt))
                          : ''}
                    </span>
                  </div>
                  {r.timeline.length > 0 ? (
                    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
                      {r.timeline.map((e, i) => (
                        <li key={`${e.type}-${i}`} className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
                          {copy.eventLabels[e.type] ?? e.label}
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
                      {copy.downloadPackage}
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
