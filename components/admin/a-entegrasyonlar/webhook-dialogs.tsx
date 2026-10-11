'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InlineError } from '@/components/states';
import { WEBHOOK_EVENTS, type WebhookEventKey, type WebhookItem } from '@/lib/integrations/contract';
import { createWebhook, errorText, fetchPartners, fieldErrors, intKeys, rotateSecret, updateWebhook } from './api';
import { CodeBlock, SecretReveal } from './secret-reveal';
import { TestPanel } from './test-panel';

export const VERIFY_SNIPPET = `// Node.js — X-Qratex-Signature-V2 doğrulama (Express, ham gövde)
import crypto from 'node:crypto';

function verify(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 ?? ''));
}
// Aynı X-Qratex-Delivery kimliğini ikinci kez işlemeyin (idempotency).`;

function EventChecklist({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-fg">Olaylar</legend>
      <p className="text-xs text-fg-muted">Yalnız platformda gerçekten tetiklenen olaylar listelenir.</p>
      <ul className="space-y-2">
        {WEBHOOK_EVENTS.map((ev) => (
          <li key={ev.key} className="flex items-start gap-3 rounded-control border border-border p-3">
            <Checkbox
              id={`${id}-${ev.key}`}
              checked={value.includes(ev.key)}
              onCheckedChange={(v) => onChange(v === true ? [...new Set([...value, ev.key])] : value.filter((x) => x !== ev.key))}
              className="mt-0.5"
            />
            <Label htmlFor={`${id}-${ev.key}`} className="cursor-pointer space-y-0.5 leading-snug">
              <span className="block text-sm font-medium">{ev.label}</span>
              <span className="block font-mono text-xs text-fg-muted">{ev.key}</span>
              <span className="block text-xs font-normal text-fg-muted">{ev.description}</span>
            </Label>
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}

function PartnerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const partners = useQuery({ queryKey: intKeys.partners('status=active'), queryFn: ({ signal }) => fetchPartners('status=active', signal), staleTime: 60_000 });
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Partner (isteğe bağlı)</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11">
          <SelectValue placeholder="Partnersiz" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Partnersiz (iç kullanım)</SelectItem>
          {partners.data?.items.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {partners.isError ? <p className="text-xs text-danger">Partnerler yüklenemedi: {errorText(partners.error)}</p> : null}
    </div>
  );
}

/**
 * Webhook oluştur / düzenle. Oluşturmada sır sunucuda üretilir, bir kez gösterilir ve
 * "Test olayı gönder" ile kurulum doğrulanır (yeşil tik görmeden çıkmayın).
 */
export function WebhookFormDialog({
  open,
  onOpenChange,
  item,
  presetPartnerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: WebhookItem | null;
  presetPartnerId?: string | null;
}) {
  const qc = useQueryClient();
  const id = useId();
  const editing = Boolean(item);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>(['feedback.created']);
  const [partnerId, setPartnerId] = useState('none');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const [secretDone, setSecretDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(item?.url ?? '');
    setDescription(item?.description ?? '');
    setEvents(item ? item.events : ['feedback.created']);
    setPartnerId(item?.partner?.id ?? presetPartnerId ?? 'none');
    setErrs({});
  }, [open, item, presetPartnerId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        url: url.trim(),
        events: events as WebhookEventKey[],
        description: description.trim() || undefined,
        partnerId: partnerId === 'none' ? null : partnerId,
      };
      if (item) return { kind: 'edit' as const, w: await updateWebhook(item.id, { ...payload, description: description.trim() || null }) };
      return { kind: 'create' as const, r: await createWebhook(payload) };
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: intKeys.all });
      if (res.kind === 'create') {
        setCreated({ id: res.r.webhook.id, secret: res.r.secret });
      } else {
        toast.success('Webhook güncellendi.');
        onOpenChange(false);
      }
    },
    onError: (e) => setErrs(fieldErrors(e)),
  });

  const close = () => {
    setCreated(null);
    setSecretDone(false);
    save.reset();
    onOpenChange(false);
  };
  const locked = Boolean(created) && !secretDone;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : locked ? undefined : close())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl" onInteractOutside={(e) => locked && e.preventDefault()} onEscapeKeyDown={(e) => locked && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{created ? (secretDone ? 'Bağlantıyı test edin' : 'İmza sırrınız') : editing ? 'Webhook’u düzenle' : 'Yeni webhook'}</DialogTitle>
          <DialogDescription>
            {created
              ? secretDone
                ? 'Örnek bir olay yalnız bu uca gönderilir; yanıt kodu ve süresi burada görünür.'
                : 'Alıcı tarafta imzayı doğrulamak için bu sırrı kullanın.'
              : 'Seçtiğiniz olaylar gerçekleştiğinde bu adrese imzalı JSON POST gönderilir. Yalnız herkese açık https:// adresler kabul edilir.'}
          </DialogDescription>
        </DialogHeader>

        {created && !secretDone ? (
          <SecretReveal
            label="İmza sırrı (whsec_…)"
            value={created.secret}
            doneLabel="Kaydettim, test adımına geç"
            onDone={() => setSecretDone(true)}
            example={<CodeBlock title="İmza doğrulama (Node.js)" code={VERIFY_SNIPPET} />}
          />
        ) : created ? (
          <div className="space-y-4">
            <TestPanel webhookId={created.id} />
            <div className="flex justify-end">
              <Button className="min-h-11" onClick={close}>
                Bitir
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setErrs({});
              if (!url.trim()) return setErrs({ url: 'URL gerekli.' });
              if (events.length === 0) return setErrs({ events: 'En az bir olay seçin.' });
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-url`}>Uç nokta adresi</Label>
              <Input
                id={`${id}-url`}
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ornek.com/qratex/webhook"
                className="min-h-11 font-mono text-sm"
                aria-invalid={Boolean(errs.url)}
                aria-describedby={errs.url ? `${id}-url-err` : undefined}
                autoFocus
              />
              {errs.url ? (
                <p id={`${id}-url-err`} className="text-xs text-danger">
                  {errs.url}
                </p>
              ) : url && !/^https:\/\//i.test(url.trim()) ? (
                <p className="text-xs text-warning">Adres https:// ile başlamalı.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-desc`}>Açıklama (isteğe bağlı)</Label>
              <Input id={`${id}-desc`} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="ör. CRM — yeni geri bildirim akışı" className="min-h-11" />
            </div>
            <EventChecklist value={events} onChange={setEvents} error={errs.events} />
            <PartnerField value={partnerId} onChange={setPartnerId} />
            {item?.deadEvents.length ? (
              <p className="text-xs text-warning">Kaydedince hiç tetiklenmeyen eski abonelikler kaldırılır: {item.deadEvents.join(', ')}</p>
            ) : null}
            {save.isError && Object.keys(fieldErrors(save.error)).length === 0 ? <InlineError>{errorText(save.error)}</InlineError> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                Vazgeç
              </Button>
              <Button type="submit" className="min-h-11" disabled={save.isPending} aria-busy={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {editing ? 'Kaydet' : 'Oluştur'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Sır döndürme: yeni sır bir kez gösterilir; eski sır hemen geçersiz olur. */
export function RotateSecretDialog({ item, open, onOpenChange }: { item: WebhookItem; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const rotate = useMutation({
    mutationFn: () => rotateSecret(item.id),
    onSuccess: (r) => {
      setSecret(r.secret);
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
  });
  const close = () => {
    setSecret(null);
    rotate.reset();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : secret ? undefined : close())}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => secret && e.preventDefault()} onEscapeKeyDown={(e) => secret && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{secret ? 'Yeni imza sırrı' : 'İmza sırrını döndür'}</DialogTitle>
          <DialogDescription>
            {secret ? 'Alıcı sistemi bu sırla güncelleyin.' : `${item.host} için yeni sır üretilir. Eski sır HEMEN geçersiz olur; alıcıyı güncelleyene kadar imza doğrulaması başarısız olur.`}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <SecretReveal label="İmza sırrı (whsec_…)" value={secret} onDone={close} />
        ) : (
          <div className="space-y-3">
            {rotate.isError ? <InlineError>{errorText(rotate.error)}</InlineError> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11" onClick={close}>
                Vazgeç
              </Button>
              <Button variant="destructive" className="min-h-11" onClick={() => rotate.mutate()} disabled={rotate.isPending} aria-busy={rotate.isPending}>
                {rotate.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
                Sırrı döndür
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
