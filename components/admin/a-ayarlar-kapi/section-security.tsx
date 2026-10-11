'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { ArrowUpRight, Rocket, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError, SectionCard, StatTile } from '@/components/states';
import { StatusBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import { avatarList, resolveAvatarImage } from '@/lib/avatar-options';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import { changePassword, errorText, formatIstanbul, updateProfile } from './api';

export function SecuritySection({ state }: { state: PlatformSettingsState }) {
  return (
    <div className="space-y-6">
      <GateSummaryCard gate={state.context.gate} />
      <AccountCard />
      <PasswordCard />
    </div>
  );
}

function GateSummaryCard({ gate }: { gate: PlatformSettingsState['context']['gate'] }) {
  return (
    <SectionCard
      title="Gizli Kapı"
      description="ADMIN rolü tek başına yetmez: panel ve bütün yönetici API uçları kapıdan geçmeyi ister. Cevap özetlenmiş saklanır, hiçbir ekrana dönmez."
      icon={<Rocket aria-hidden />}
      tone={gate?.isDefaultAnswer ? 'danger' : undefined}
      stripe={!!gate?.isDefaultAnswer}
      actions={
        <Button asChild size="sm" className="min-h-11 gap-1.5">
          <Link href="/admin/gate-settings">
            Kapıyı yönet <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      {gate === null ? (
        <InlineError variant="banner">Kapı durumu şu anda okunamadı. Kapı ekranında yeniden deneyin.</InlineError>
      ) : (
        <>
          {gate.isDefaultAnswer ? (
            <InlineError variant="banner" tone="danger" className="mb-4">
              Cevap hâlâ varsayılan değerde; kapı fiilen koruma sağlamıyor. Kapı ekranından yeni bir cevap belirleyin.
            </InlineError>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Yanlış deneme (24 sa)" value={gate.failures24h} tone={gate.failures24h > 0 ? 'warning' : 'neutral'} />
            <StatTile label="Kilitlenme (24 sa)" value={gate.locks24h} tone={gate.locks24h > 0 ? 'danger' : 'neutral'} />
            <StatTile label="Yapılandırma sürümü" value={gate.cfgVer} hint="Cevap değişince ya da oturumlar sonlandırılınca artar" />
            <StatTile label="Son değişiklik" value={gate.updatedAt ? formatIstanbul(gate.updatedAt) : 'Hiç'} />
          </div>
          <p className="qx-small mt-4 text-fg-muted">
            Soru: <span className="text-fg">“{gate.question}”</span> · Kilit: 1 saatte 3 yanlış → 1 saat, 24 saatte 5 yanlış → 24 saat.
          </p>
        </>
      )}
    </SectionCard>
  );
}

function AccountCard() {
  const { data: session, update } = useSession();
  const ids = { name: useId(), email: useId() };
  const sessionName = session?.user?.name ?? '';
  const sessionImage = session?.user?.image ?? '';
  const [name, setName] = useState(sessionName);
  const [image, setImage] = useState(sessionImage);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [category, setCategory] = useState<string>(avatarList[0]?.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(sessionName);
    setImage(sessionImage);
  }, [sessionName, sessionImage]);

  const dirty = name.trim() !== sessionName || image !== sessionImage;
  const nameInvalid = name.trim().length < 2;
  const items = useMemo(() => avatarList.find((c) => c.category === category)?.items ?? [], [category]);
  const shown = resolveAvatarImage(image);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || nameInvalid) return;
    setSaving(true);
    setError(null);
    try {
      // Yalnız değişen alanlar gönderilir; görsel seçilmediyse varsayılan avatar YAZILMAZ.
      await updateProfile({ name: name.trim(), ...(image && image !== sessionImage ? { image } : {}) });
      await update({ name: name.trim(), ...(image ? { image } : {}) });
      toast.success('Profil güncellendi.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Hesabım" description="Panelde ve ekip modülünde görünen adınız ve avatarınız." icon={<UserRound aria-hidden />}>
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]" noValidate>
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border border-border bg-surface-muted">
            {shown ? (
              <Image src={shown} alt="Seçili avatarınız" fill sizes="96px" className="object-cover" unoptimized={shown.endsWith('.svg')} />
            ) : (
              <span className="grid h-full w-full place-items-center qx-h3 text-fg-muted" aria-hidden>
                {(name || 'A').charAt(0).toLocaleUpperCase('tr-TR')}
              </span>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setPickerOpen(true)}>
            Avatar seç
          </Button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={ids.name} className="qx-small font-medium text-fg">
              Ad soyad
            </label>
            <Input id={ids.name} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={nameInvalid} autoComplete="name" />
            {nameInvalid ? <InlineError>Ad en az 2 karakter olmalıdır.</InlineError> : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.email} className="qx-small font-medium text-fg">
              E-posta
            </label>
            <Input id={ids.email} value={session?.user?.email ?? ''} readOnly disabled />
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <Button type="submit" loading={saving} disabled={!dirty || nameInvalid || saving} className="min-h-11">
            Profili kaydet
          </Button>
        </div>
      </form>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Avatar seç</DialogTitle>
            <DialogDescription>Seçtiğiniz avatar “Profili kaydet” ile kalıcı olur.</DialogDescription>
          </DialogHeader>
          <div role="tablist" aria-label="Avatar kategorileri" className="flex gap-2 overflow-x-auto pb-1">
            {avatarList.map((c) => (
              <button
                key={c.category}
                type="button"
                role="tab"
                aria-selected={category === c.category}
                onClick={() => setCategory(c.category)}
                className={cn(
                  'qx-small min-h-11 shrink-0 rounded-chip border px-3 font-medium',
                  category === c.category ? 'border-brand bg-brand-subtle text-brand' : 'border-border text-fg-muted hover:bg-surface-muted'
                )}
              >
                {c.category}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label={`${category} avatarları`} className="grid max-h-[50vh] grid-cols-4 gap-3 overflow-y-auto sm:grid-cols-6">
            {items.map((src, i) => {
              const selected = image === src;
              const resolved = resolveAvatarImage(src) ?? src;
              return (
                <button
                  key={src}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${category} avatarı ${i + 1}`}
                  onClick={() => {
                    setImage(src);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    selected ? 'border-brand' : 'border-transparent hover:border-border'
                  )}
                >
                  <Image src={resolved} alt="" fill sizes="80px" className="object-cover" unoptimized={resolved.endsWith('.svg')} />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function passwordScore(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-zçğıöşü]/.test(pw) && /[A-ZÇĞİÖŞÜ]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(pw)) s++;
  const labels = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'] as const;
  return { score: s as 0 | 1 | 2 | 3 | 4, label: labels[s] };
}

function PasswordCard() {
  const ids = { current: useId(), next: useId(), confirm: useId(), meter: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = passwordScore(next);
  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = current.length > 0 && next.length >= 8 && next === confirm && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Şifre güncellendi. Diğer cihazlardaki oturumlarınız kapatıldı.');
    } catch (err) {
      const msg = errorText(err);
      setError(
        /şifre ayarlı değil/i.test(msg)
          ? 'Hesabınız Google ile açıldığı için şifresi yok. Şifre belirlemek için çıkış yapıp “Şifremi unuttum” akışını kullanın.'
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Şifre"
      description="Şifre değişince bu tarayıcı dışındaki bütün oturumlarınız kapanır."
      icon={<ShieldCheck aria-hidden />}
      actions={<StatusBadge size="sm" label="5 dakikada en fazla 8 deneme" tone="neutral" icon={null} />}
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <div className="space-y-1.5">
          <label htmlFor={ids.current} className="qx-small font-medium text-fg">
            Mevcut şifre
          </label>
          <Input id={ids.current} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.next} className="qx-small font-medium text-fg">
            Yeni şifre
          </label>
          <Input
            id={ids.next}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort}
            aria-describedby={ids.meter}
          />
          <div id={ids.meter} className="space-y-1" aria-live="polite">
            <div className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full',
                    i < strength.score ? (strength.score <= 1 ? 'bg-danger' : strength.score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-muted'
                  )}
                />
              ))}
            </div>
            <p className="qx-caption text-fg-muted">
              {next ? `Güç: ${strength.label}` : 'En az 8 karakter; büyük-küçük harf, rakam ve sembol karıştırın.'}
            </p>
          </div>
          {tooShort ? <InlineError>Şifre en az 8 karakter olmalıdır.</InlineError> : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.confirm} className="qx-small font-medium text-fg">
            Yeni şifre (tekrar)
          </label>
          <Input id={ids.confirm} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          {mismatch ? <InlineError>Şifreler aynı değil.</InlineError> : null}
        </div>
        {error ? (
          <div className="sm:col-span-3">
            <InlineError variant="banner">{error}</InlineError>
          </div>
        ) : null}
        <div className="sm:col-span-3">
          <Button type="submit" loading={saving} disabled={!canSave} className="min-h-11">
            Şifreyi değiştir
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
