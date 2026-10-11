'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InlineError, TONE_CALLOUT } from '@/components/states';
import { API_SCOPES, FULL_ACCESS_SCOPE, type ApiKeyItem, type DealerOption } from '@/lib/integrations/contract';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { createKey, errorText, fetchPartners, fieldErrors, intKeys, rollKey, updateKey } from './api';
import { DealerPicker } from './dealer-picker';
import { CodeBlock, SecretReveal } from './secret-reveal';
import { origin } from './format';

type Expiry = '30' | '90' | '365' | 'none';

function parseIps(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function curlExample(raw: string) {
  return `curl -H "Authorization: Bearer ${raw}" \\\n  "${origin()}/api/partner/v1/digest"`;
}

/** Kapsam seçimi: katalogdaki kapsamlar + ayrı onaylı tam erişim. */
function ScopeFields({
  scopes,
  setScopes,
  confirmFull,
  setConfirmFull,
  error,
}: {
  scopes: string[];
  setScopes: (s: string[]) => void;
  confirmFull: boolean;
  setConfirmFull: (v: boolean) => void;
  error?: string;
}) {
  const id = useId();
  const toggle = (k: string, on: boolean) => setScopes(on ? [...new Set([...scopes, k])] : scopes.filter((s) => s !== k));
  const full = scopes.includes(FULL_ACCESS_SCOPE);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-fg">Kapsam (en az yetki)</legend>
      <ul className="space-y-2">
        {API_SCOPES.map((s) => (
          <li key={s.key} className="flex items-start gap-3 rounded-control border border-border p-3">
            <Checkbox id={`${id}-${s.key}`} checked={scopes.includes(s.key)} onCheckedChange={(v) => toggle(s.key, v === true)} className="mt-0.5" />
            <Label htmlFor={`${id}-${s.key}`} className="cursor-pointer space-y-0.5 leading-snug">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="block font-mono text-xs text-fg-muted">{s.key}</span>
              <span className="block text-xs font-normal text-fg-muted">{s.description}</span>
            </Label>
          </li>
        ))}
        <li className={cn('flex items-start gap-3 rounded-control border p-3', full ? TONE_CALLOUT.danger : 'border-border')}>
          <Checkbox id={`${id}-full`} checked={full} onCheckedChange={(v) => toggle(FULL_ACCESS_SCOPE, v === true)} className="mt-0.5" />
          <Label htmlFor={`${id}-full`} className="cursor-pointer space-y-0.5 leading-snug">
            <span className="block text-sm font-medium">Tam erişim (*)</span>
            <span className="block text-xs font-normal">İleride eklenecek uçlar dahil tüm partner API'si. Yalnız güvendiğiniz iç sistemler için.</span>
          </Label>
        </li>
      </ul>
      {full ? (
        <div className="flex items-start gap-3 pl-1">
          <Checkbox id={`${id}-confirm`} checked={confirmFull} onCheckedChange={(v) => setConfirmFull(v === true)} className="mt-0.5" />
          <Label htmlFor={`${id}-confirm`} className="cursor-pointer text-sm">
            Tam erişimin riskini anladım ve onaylıyorum.
          </Label>
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}

function PartnerSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const partners = useQuery({ queryKey: intKeys.partners('status=active'), queryFn: ({ signal }) => fetchPartners('status=active', signal), staleTime: 60_000 });
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Partner (isteğe bağlı)</Label>
      <Select value={value} onValueChange={onChange} disabled={partners.isLoading}>
        <SelectTrigger id={id} className="min-h-11">
          <SelectValue placeholder={partners.isLoading ? 'Yükleniyor…' : 'Partnersiz (iç kullanım)'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Partnersiz (iç kullanım)</SelectItem>
          {partners.data?.items.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} · {p.typeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {partners.isError ? <p className="text-xs text-danger">Partnerler yüklenemedi: {errorText(partners.error)}</p> : null}
      <p className="text-xs text-fg-muted">Partner pasifleştirilirse bu anahtar otomatik reddedilir.</p>
    </div>
  );
}

/**
 * Yeni API anahtarı: 1) ad + erişim alanı + kapsam + süre + IP → 2) tek seferlik anahtar.
 * Anahtar adımında diyalog dışarı tıklama / Esc ile kapanmaz.
 */
export function CreateKeyDialog({
  open,
  onOpenChange,
  presetPartnerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetPartnerId?: string | null;
}) {
  const qc = useQueryClient();
  const reduce = useReducedMotionPref();
  const id = useId();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([API_SCOPES[0].key]);
  const [confirmFull, setConfirmFull] = useState(false);
  const [dealer, setDealer] = useState<DealerOption[]>([]);
  const [partnerId, setPartnerId] = useState(presetPartnerId ?? 'none');
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [ips, setIps] = useState('');
  const [raw, setRaw] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setPartnerId(presetPartnerId ?? 'none');
  }, [open, presetPartnerId]);

  const reset = () => {
    setName('');
    setScopes([API_SCOPES[0].key]);
    setConfirmFull(false);
    setDealer([]);
    setExpiry('90');
    setIps('');
    setRaw(null);
    setErrs({});
  };

  const create = useMutation({
    mutationFn: createKey,
    onSuccess: (r) => {
      setRaw(r.rawKey);
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
    onError: (e) => setErrs(fieldErrors(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrs({});
    if (name.trim().length < 2) return setErrs({ name: 'Ad en az 2 karakter olmalı.' });
    if (scopes.length === 0) return setErrs({ scopes: 'En az bir kapsam seçin.' });
    create.mutate({
      name: name.trim(),
      scopes: scopes as ('read:partner_digest' | '*')[],
      confirmFullAccess: confirmFull,
      dealerId: dealer[0]?.id ?? null,
      partnerId: partnerId === 'none' ? null : partnerId,
      expiresInDays: expiry === 'none' ? null : (Number(expiry) as 30 | 90 | 365),
      ipAllowlist: parseIps(ips),
    });
  };

  const close = () => {
    reset();
    create.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : raw ? undefined : close())}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"
        onInteractOutside={(e) => raw && e.preventDefault()}
        onEscapeKeyDown={(e) => raw && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{raw ? 'Anahtarınız hazır' : 'Yeni API anahtarı'}</DialogTitle>
          <DialogDescription>
            {raw ? 'Anahtarı şimdi kopyalayıp entegrasyona teslim edin.' : 'Anahtar yalnız seçtiğiniz kapsamlarla ve erişim alanıyla çalışır. Sunucuda yalnız özeti (SHA-256) saklanır.'}
          </DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          {raw ? (
            <Motion.div key="reveal" initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: DURATION.base, ease: EASE.emphasized }}>
              <SecretReveal label="API anahtarı" value={raw} onDone={close} example={<CodeBlock title="Örnek istek (cURL)" code={curlExample(raw)} />} />
            </Motion.div>
          ) : (
            <Motion.form key="form" onSubmit={submit} className="space-y-5" exit={reduce ? undefined : { opacity: 0, x: -16 }} transition={{ duration: DURATION.fast }} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`}>Ad</Label>
                <Input
                  id={`${id}-name`}
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ör. Kadıköy şubesi POS"
                  className="min-h-11"
                  aria-invalid={Boolean(errs.name)}
                  aria-describedby={errs.name ? `${id}-name-err` : undefined}
                  autoFocus
                />
                {errs.name ? (
                  <p id={`${id}-name-err`} className="text-xs text-danger">
                    {errs.name}
                  </p>
                ) : null}
              </div>

              <ScopeFields scopes={scopes} setScopes={setScopes} confirmFull={confirmFull} setConfirmFull={setConfirmFull} error={errs.scopes ?? errs.confirmFullAccess} />

              <DealerPicker
                label="Erişim alanı: tek bayi (isteğe bağlı)"
                description="Seçilirse anahtar yalnız bu bayinin verisini okur; boş bırakılırsa platform geneli (yalnız iç sistemler için)."
                value={dealer}
                onChange={setDealer}
              />
              {errs.dealerId ? <p className="text-xs text-danger">{errs.dealerId}</p> : null}

              <PartnerSelect id={`${id}-partner`} value={partnerId} onChange={setPartnerId} />

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-exp`}>Geçerlilik süresi</Label>
                <Select value={expiry} onValueChange={(v) => setExpiry(v as Expiry)}>
                  <SelectTrigger id={`${id}-exp`} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 gün</SelectItem>
                    <SelectItem value="90">90 gün (önerilen)</SelectItem>
                    <SelectItem value="365">1 yıl</SelectItem>
                    <SelectItem value="none">Süresiz</SelectItem>
                  </SelectContent>
                </Select>
                {expiry === 'none' ? <p className="text-xs text-warning">Süresiz anahtarlar zamanla birikip saldırı yüzeyi oluşturur; düzenli döndürmeyi unutmayın.</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-ips`}>IP izin listesi (isteğe bağlı)</Label>
                <Textarea id={`${id}-ips`} value={ips} onChange={(e) => setIps(e.target.value)} rows={2} placeholder="ör. 203.0.113.10, 198.51.100.0/24" className="font-mono text-sm" />
                <p className="text-xs text-fg-muted">Doluysa yalnız bu adreslerden gelen istekler kabul edilir.</p>
                {errs.ipAllowlist ? <p className="text-xs text-danger">{errs.ipAllowlist}</p> : null}
              </div>

              {create.isError && Object.keys(fieldErrors(create.error)).length === 0 ? <InlineError>{errorText(create.error)}</InlineError> : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                  Vazgeç
                </Button>
                <Button type="submit" className="min-h-11" disabled={create.isPending} aria-busy={create.isPending}>
                  {create.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
                  Anahtarı oluştur
                </Button>
              </div>
            </Motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

/** Anahtar düzenleme: ad, kapsam, erişim alanı, partner, süre, IP. */
export function EditKeyDialog({ item, open, onOpenChange }: { item: ApiKeyItem; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState(item.name);
  const [scopes, setScopes] = useState<string[]>(item.scopes);
  const [confirmFull, setConfirmFull] = useState(false);
  const [dealer, setDealer] = useState<DealerOption[]>(item.dealer ? [item.dealer] : []);
  const [partnerId, setPartnerId] = useState(item.partner?.id ?? 'none');
  const [expiresAt, setExpiresAt] = useState(item.expiresAt ? item.expiresAt.slice(0, 10) : '');
  const [ips, setIps] = useState(item.ipAllowlist.join(', '));
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(item.name);
    setScopes(item.scopes);
    setConfirmFull(false);
    setDealer(item.dealer ? [item.dealer] : []);
    setPartnerId(item.partner?.id ?? 'none');
    setExpiresAt(item.expiresAt ? item.expiresAt.slice(0, 10) : '');
    setIps(item.ipAllowlist.join(', '));
    setErrs({});
  }, [open, item]);

  const save = useMutation({
    mutationFn: () =>
      updateKey(item.id, {
        name: name.trim(),
        scopes: scopes as ('read:partner_digest' | '*')[],
        confirmFullAccess: confirmFull,
        dealerId: dealer[0]?.id ?? null,
        partnerId: partnerId === 'none' ? null : partnerId,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59+03:00`).toISOString() : null,
        ipAllowlist: parseIps(ips),
      }),
    onSuccess: () => {
      toast.success('Anahtar güncellendi.');
      void qc.invalidateQueries({ queryKey: intKeys.all });
      onOpenChange(false);
    },
    onError: (e) => setErrs(fieldErrors(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Anahtarı düzenle</DialogTitle>
          <DialogDescription>Değişiklikler bir sonraki istekte geçerli olur ve denetim kaydına yazılır. Ham anahtar değişmez.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErrs({});
            if (scopes.length === 0) return setErrs({ scopes: 'En az bir kapsam seçin.' });
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Ad</Label>
            <Input id={`${id}-name`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="min-h-11" aria-invalid={Boolean(errs.name)} />
            {errs.name ? <p className="text-xs text-danger">{errs.name}</p> : null}
          </div>
          <ScopeFields scopes={scopes} setScopes={setScopes} confirmFull={confirmFull} setConfirmFull={setConfirmFull} error={errs.scopes ?? errs.confirmFullAccess} />
          <DealerPicker label="Erişim alanı: tek bayi" value={dealer} onChange={setDealer} />
          <PartnerSelect id={`${id}-partner`} value={partnerId} onChange={setPartnerId} />
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-exp`}>Son geçerlilik günü (boş = süresiz)</Label>
            <Input id={`${id}-exp`} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ips`}>IP izin listesi</Label>
            <Textarea id={`${id}-ips`} value={ips} onChange={(e) => setIps(e.target.value)} rows={2} className="font-mono text-sm" />
            {errs.ipAllowlist ? <p className="text-xs text-danger">{errs.ipAllowlist}</p> : null}
          </div>
          {save.isError && Object.keys(fieldErrors(save.error)).length === 0 ? <InlineError>{errorText(save.error)}</InlineError> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Rotasyon: yeni anahtar + eskisine ek süre. Yeni anahtar bir kez gösterilir. */
export function RollKeyDialog({ item, open, onOpenChange }: { item: ApiKeyItem; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const id = useId();
  const [grace, setGrace] = useState<'0' | '1' | '24' | '72'>('24');
  const [raw, setRaw] = useState<string | null>(null);
  const roll = useMutation({
    mutationFn: () => rollKey(item.id, Number(grace) as 0 | 1 | 24 | 72),
    onSuccess: (r) => {
      setRaw(r.rawKey);
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
  });
  const close = () => {
    setRaw(null);
    roll.reset();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : raw ? undefined : close())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => raw && e.preventDefault()} onEscapeKeyDown={(e) => raw && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{raw ? 'Yeni anahtar hazır' : `“${item.name}” anahtarını döndür`}</DialogTitle>
          <DialogDescription>
            {raw
              ? 'Entegrasyonu yeni anahtara geçirin; eski anahtar seçtiğiniz ek süre sonunda çalışmayı bırakır.'
              : 'Aynı kapsam ve erişim alanıyla yeni bir anahtar üretilir. Kesintisiz geçiş için eskisine ek süre tanıyın.'}
          </DialogDescription>
        </DialogHeader>
        {raw ? (
          <SecretReveal label="Yeni API anahtarı" value={raw} onDone={close} example={<CodeBlock title="Örnek istek (cURL)" code={curlExample(raw)} />} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              roll.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-grace`}>Eski anahtar ne kadar daha çalışsın?</Label>
              <Select value={grace} onValueChange={(v) => setGrace(v as typeof grace)}>
                <SelectTrigger id={`${id}-grace`} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Hemen geçersiz (sızıntı şüphesi)</SelectItem>
                  <SelectItem value="1">1 saat</SelectItem>
                  <SelectItem value="24">24 saat (önerilen)</SelectItem>
                  <SelectItem value="72">72 saat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {roll.isError ? <InlineError>{errorText(roll.error)}</InlineError> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" onClick={close}>
                Vazgeç
              </Button>
              <Button type="submit" className="min-h-11" disabled={roll.isPending} aria-busy={roll.isPending}>
                {roll.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
                Döndür
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
