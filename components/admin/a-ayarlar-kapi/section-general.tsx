'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Globe2, Mail, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError, SectionCard } from '@/components/states';
import { StatusBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import { SETTINGS_KEYS, type BackgroundEffect } from '@/lib/platform-settings/registry';
import { errorText, formatIstanbul, sendTestMail, type MailTestResult } from './api';
import { EFFECT_GROUPS, changeFor, effectName, effectOf, useSaveSettings } from './shared';

const OWNER_LINKS: Array<{ title: string; text: string; href: string; cta: string }> = [
  { title: 'Tema ve renkler', text: 'Açık/koyu tema, marka renkleri ve varsayılan mod Tasarım Sistemi’nde yönetilir.', href: '/admin/design-system', cta: 'Tasarım Sistemi' },
  { title: 'Puan kuralları', text: 'Geri bildirim, davet ve seviye puanlarının tek kaynağı Ekonomi Stüdyosu’dur.', href: '/admin/economy', cta: 'Ekonomi Stüdyosu' },
  { title: 'Yapay zekâ', text: 'Sağlayıcı ve model sunucu ortamından, işletme bazlı AI ayarları AI Ayarları’ndan gelir.', href: '/admin/ai/studio', cta: 'AI Ayarları' },
  { title: 'Modüller', text: 'Modülleri herkese açıp kapatma ve kademeli açılış Özellik ve Deney Kontrolü’ndedir.', href: '/admin/features', cta: 'Özellik Kontrolü' },
];

export function GeneralSection({ state }: { state: PlatformSettingsState }) {
  const { context } = state;
  return (
    <div className="space-y-6">
      <SectionCard
        title="Site kimliği"
        description="Site adı ve adresi SEO Motoru’ndan okunur; burada yalnız özet gösterilir."
        icon={<Globe2 aria-hidden />}
        actions={
          <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5">
            <Link href="/admin/seo">
              SEO Motoru’nda düzenle <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        }
      >
        {context.seo ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="qx-caption text-fg-muted">Site adı</dt>
              <dd className="qx-body font-medium text-fg">{context.seo.siteName || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="qx-caption text-fg-muted">Site adresi</dt>
              <dd className="qx-body truncate font-medium text-fg">{context.seo.siteUrl || '—'}</dd>
            </div>
          </dl>
        ) : (
          <InlineError variant="banner" tone="warning">
            SEO ayarları şu anda okunamadı. Site kimliğini SEO Motoru’ndan kontrol edin.
          </InlineError>
        )}
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {OWNER_LINKS.map((o) => (
            <li key={o.href} className="rounded-card border border-border p-4">
              <p className="qx-body font-medium text-fg">{o.title}</p>
              <p className="qx-small mt-1 text-fg-muted">{o.text}</p>
              <Link href={o.href} className="qx-small mt-2 inline-flex min-h-11 items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
                {o.cta} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <BackgroundEffectCard state={state} />
      <MailCard state={state} />
    </div>
  );
}

function BackgroundEffectCard({ state }: { state: PlatformSettingsState }) {
  const save = useSaveSettings();
  const [pending, setPending] = useState<BackgroundEffect | null>(null);
  const current = state.values[SETTINGS_KEYS.backgroundEffect];
  const seasonal = state.context.seasonal;
  const groupLabelId = useId();

  const choose = (id: BackgroundEffect) => {
    if (id === current || save.isPending) return;
    setPending(id);
    save.mutate([changeFor(state, SETTINGS_KEYS.backgroundEffect, id)], {
      onSuccess: () => toast.success(`Arka plan efekti “${effectName(id)}” olarak kaydedildi.`),
      onSettled: () => setPending(null),
    });
  };

  return (
    <SectionCard
      title="Ana sayfa arka planı"
      description={effectOf(SETTINGS_KEYS.backgroundEffect)}
      icon={<Sparkles aria-hidden />}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1.5">
          <a href="/" target="_blank" rel="noreferrer">
            Ana sayfayı aç <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </Button>
      }
    >
      {seasonal?.backgroundEffect ? (
        <InlineError variant="banner" tone="info" className="mb-4">
          Şu an “{seasonal.name}” dönemsel konsepti etkin ve ana sayfada “{effectName(seasonal.backgroundEffect)}” efektini gösteriyor
          ({formatIstanbul(seasonal.endDate)} tarihine kadar). Buradaki seçim konsept bitince görünür.
        </InlineError>
      ) : null}
      <p className="qx-small mb-4 text-fg-muted">
        Seçili: <span className="font-medium text-fg">{effectName(current)}</span>. Seçim anında kaydedilir; ana sayfa önbelleği hemen tazelenir.
      </p>
      <div className="space-y-5" role="radiogroup" aria-labelledby={groupLabelId}>
        <span id={groupLabelId} className="sr-only">
          Ana sayfa arka plan efekti
        </span>
        {EFFECT_GROUPS.map((g) => (
          <fieldset key={g.title} className="space-y-2">
            <legend className="qx-caption mb-2 font-semibold uppercase tracking-wide text-fg-muted">{g.title}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((e) => {
                const selected = (pending ?? current) === e.id;
                const busy = pending === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={save.isPending && !busy}
                    onClick={() => choose(e.id)}
                    className={cn(
                      'flex min-h-14 items-start gap-3 rounded-control border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                      selected ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-surface-muted',
                      save.isPending && !busy && 'opacity-60'
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        selected ? 'border-brand bg-brand text-brand-fg' : 'border-border'
                      )}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="qx-body block font-medium text-fg">
                        {e.name}
                        {busy ? <span className="qx-caption ml-2 text-fg-muted">kaydediliyor…</span> : null}
                      </span>
                      <span className="qx-small block text-fg-muted">{e.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </SectionCard>
  );
}

function MailCard({ state }: { state: PlatformSettingsState }) {
  const mail = state.context.mail;
  const id = useId();
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: true; data: MailTestResult } | { ok: false; message: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const data = await sendTestMail(to.trim());
      setResult({ ok: true, data });
    } catch (err) {
      setResult({ ok: false, message: errorText(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard
      title="E-posta teşhisi"
      description="Gönderim kanalı sunucu ortam değişkenlerinden gelir (SMTP öncelikli, Resend yedek). Özel e-posta göndermek için Gelen Kutusu’nu kullanın."
      icon={<Mail aria-hidden />}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1.5">
          <Link href="/admin/inbox">
            Gelen Kutusu <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={mail.configured ? 'Gönderim yapılandırılmış' : 'Gönderim yapılandırılmamış'} tone={mail.configured ? 'success' : 'danger'} />
        <StatusBadge label={`SMTP ${mail.smtp ? 'var' : 'yok'}`} tone={mail.smtp ? 'success' : 'neutral'} />
        <StatusBadge label={`Resend ${mail.resend ? 'var' : 'yok'}`} tone={mail.resend ? 'success' : 'neutral'} />
      </div>
      {!mail.configured ? (
        <p className="qx-small mt-3 text-fg-muted">
          SMTP için <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>; Resend için <code>RESEND_API_KEY</code>{' '}
          tanımlayın. E-posta yokken bağlantıyla giriş düğmesi de görünmez.
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={id} className="qx-small font-medium text-fg">
            Test alıcısı
          </label>
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="Boş bırakırsanız kendi adresinize gider"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={!mail.configured}
          />
        </div>
        <Button type="submit" loading={sending} disabled={!mail.configured || sending} className="min-h-11">
          Test e-postası gönder
        </Button>
      </form>
      <div aria-live="polite" className="mt-3">
        {result?.ok ? (
          <p className="qx-small rounded-control border border-success-border bg-success-subtle px-3 py-2 text-fg">
            {result.data.message ?? 'Gönderildi.'}
            {result.data.delivery ? (
              <>
                {' '}Kanal: <strong>{result.data.delivery.channel === 'smtp' ? 'SMTP' : 'Resend'}</strong> · Gönderen: {result.data.delivery.effectiveFrom}
                {result.data.delivery.usedResendAfterSmtpFailure ? ' · SMTP başarısız oldu, Resend ile gönderildi.' : ''}
              </>
            ) : null}
          </p>
        ) : result && !result.ok ? (
          <InlineError variant="banner">{result.message}</InlineError>
        ) : null}
      </div>
    </SectionCard>
  );
}
