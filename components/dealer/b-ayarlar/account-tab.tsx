'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { useController, type Control } from 'react-hook-form';
import { Camera, Check, Download, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { DirtyBar, Form, FormRootError, SelectField, TextField, useZodForm } from '@/components/ds/form';
import { AccessibilityToggles } from '@/components/settings/accessibility-toggles';
import { avatarList, resolveAvatarImage } from '@/lib/avatar-options';
import { useAppLocale } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { accountFormSchema, type AccountFormValues, type AccountSettings, type DealerSettingsSnapshot } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, fetchSettings, patchAccount } from './api';
import { fmtDate } from './format';
import { KeyValue } from './ui';

function toForm(a: AccountSettings): AccountFormValues {
  return { name: a.name, phone: a.phone, image: a.image, preferredLanguage: a.preferredLanguage };
}

export function AccountTab({ data }: { data: AccountSettings }) {
  const queryClient = useQueryClient();
  const { update } = useSession();
  const { setLocale } = useAppLocale();
  const form = useZodForm(accountFormSchema, { defaultValues: toForm(data) });
  const baseRef = useRef<AccountFormValues>(toForm(data));
  const versionRef = useRef(data.version);

  useEffect(() => {
    if (data.version === versionRef.current) return;
    versionRef.current = data.version;
    if (!form.formState.isDirty) {
      baseRef.current = toForm(data);
      form.reset(baseRef.current);
    }
  }, [data, form]);

  const reloadLatest = async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchSettings(), staleTime: 0 });
    versionRef.current = fresh.account.version;
    baseRef.current = toForm(fresh.account);
    form.reset(baseRef.current);
  };

  const onSubmit = async (values: AccountFormValues) => {
    const base = baseRef.current;
    const changes: Partial<AccountFormValues> = {};
    (Object.keys(values) as Array<keyof AccountFormValues>).forEach((k) => {
      if ((values[k] ?? null) !== (base[k] ?? null)) (changes as Record<string, unknown>)[k] = values[k];
    });
    if (Object.keys(changes).length === 0) return values;

    const res = await patchAccount({ ...changes, baseVersion: versionRef.current } as Parameters<typeof patchAccount>[0]);
    versionRef.current = res.version;
    baseRef.current = values;
    queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) =>
      old ? { ...old, account: { ...old.account, ...values, phone: values.phone ?? null, version: res.version } as AccountSettings } : old
    );
    // Oturum başlığı (ad/avatar) ve panel dili anında güncellenir (B6).
    await update({ name: res.name, image: res.image, preferredLanguage: res.preferredLanguage }).catch(() => undefined);
    if (changes.preferredLanguage) setLocale(res.preferredLanguage);
    toast.success('Hesap bilgileri kaydedildi.');
    return values;
  };

  return (
    <div className="space-y-6 pb-24">
      <Form form={form} onSubmit={onSubmit} resetOnSuccess={(_r, submitted) => submitted} className="space-y-6">
        <FormRootError />
        <SectionCard title="Kişisel bilgiler" description="Panelde ve ekip içinde görünen hesabınız. İşletme bilgileri “İşletme” sekmesinde.">
          <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
            <AvatarField control={form.control} name={data.name} />
            <div className="min-w-0 space-y-4">
              <TextField control={form.control} name="name" label="Ad soyad" required maxLength={80} autoComplete="name" />
              <TextField
                control={form.control}
                name="phone"
                label="Telefon"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+90 532 000 00 00"
                maxLength={30}
                optional
                emptyAsNull
              />
              <dl className="divide-y divide-subtle rounded-control border border-subtle px-3">
                <KeyValue label="E-posta">
                  <span className="inline-flex items-center gap-1.5 break-all">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
                    {data.email}
                  </span>
                </KeyValue>
                <KeyValue label="Üyelik başlangıcı">{fmtDate(data.memberSince)}</KeyValue>
              </dl>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Panel dili" description="Menüler ve e-postalar bu dilde gelir. Değişiklik kaydedince hemen uygulanır.">
          <SelectField
            control={form.control}
            name="preferredLanguage"
            label="Dil"
            options={[
              { value: 'tr', label: 'Türkçe' },
              { value: 'en', label: 'English' },
            ]}
          />
        </SectionCard>
        <DirtyBar onReloadLatest={reloadLatest} bottomOffset="var(--qx-tabbar-h, 0px)" message="Hesap bilgilerinde kaydedilmemiş değişiklikler var" />
      </Form>

      <SectionCard title="Erişilebilirlik" description="Bu cihazda hemen uygulanır (cihaz bazlı tercih).">
        <AccessibilityToggles />
      </SectionCard>

      <SectionCard title="Verileriniz" description="KVKK kapsamında hesabınıza ait verilerin bir kopyasını JSON dosyası olarak indirebilirsiniz.">
        <Button asChild variant="outline">
          <a href="/api/user/data-export" download>
            <Download className="h-4 w-4" aria-hidden />
            Verilerimi indir
          </a>
        </Button>
      </SectionCard>
    </div>
  );
}

const CATEGORIES = avatarList.map((c) => ({ category: c.category as string, items: c.items as readonly string[] }));

function AvatarField({ control, name }: { control: Control<AccountFormValues>; name: string }) {
  const { field } = useController({ control, name: 'image' });
  const current = field.value ?? null;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(() => CATEGORIES.find((c) => current && c.items.includes(current))?.category ?? CATEGORIES[0].category);
  const [selected, setSelected] = useState<string | null>(current);
  const initial = (name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  const items = CATEGORIES.find((c) => c.category === category)?.items ?? [];
  const src = resolveAvatarImage(current);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => {
          setSelected(current);
          setOpen(true);
        }}
        className="group relative h-24 w-24 overflow-hidden rounded-full border border-subtle bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Avatarı değiştir"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="flex h-full w-full items-center justify-center text-2xl font-semibold text-fg-muted">
            {initial}
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Camera className="h-6 w-6" />
        </span>
      </button>
      <div className="flex flex-wrap justify-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Değiştir
        </Button>
        {current && (
          <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(null)}>
            Kaldır
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Avatar seçin</DialogTitle>
            <DialogDescription>Seçiminiz forma işlenir; “Kaydet” ile kalıcı olur.</DialogDescription>
          </DialogHeader>
          <ChoiceChips
            aria-label="Avatar kategorisi"
            options={CATEGORIES.map((c) => ({ value: c.category, label: c.category }))}
            value={category}
            onChange={(v) => v && setCategory(v)}
            size="sm"
            scroll
          />
          <div role="radiogroup" aria-label={`${category} avatarları`} className="grid max-h-72 grid-cols-4 gap-3 overflow-y-auto p-1 sm:grid-cols-5">
            {items.map((item, i) => {
              const isSel = selected === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  aria-label={`${category} avatarı ${i + 1}`}
                  onClick={() => setSelected(item)}
                  className={cn(
                    'relative aspect-square min-h-11 overflow-hidden rounded-full border-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSel ? 'border-brand' : 'border-transparent hover:border-strong'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveAvatarImage(item) ?? item} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {isSel && (
                    <span aria-hidden className="absolute bottom-0 right-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-fg">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (selected !== current) field.onChange(selected);
                setOpen(false);
              }}
            >
              Seç
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
