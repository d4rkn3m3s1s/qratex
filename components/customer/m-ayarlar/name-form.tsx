'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import { patchProfile, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { useSettingsCache } from './use-settings';

/**
 * Ad + e-posta. Form yalnız sunucu değeri değişince ve kullanıcı yazmıyorken (kirli değilken)
 * senkronlanır — oturum yenilemesi yazılanı silmez (denetim B5). Kirliyken sayfadan ayrılma
 * uyarısı verilir.
 */
export function NameForm({ name, email }: { name: string; email: string }) {
  const { copy } = useSettingsCopy();
  const { update } = useSession();
  const cache = useSettingsCache();
  const nameId = useId();
  const hintId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const [value, setValue] = useState(name);
  const [base, setBase] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value.trim() !== base.trim();

  // Sunucu değeri değişti (başka sekme/cihaz) ve kullanıcı yazmıyor → senkronla.
  useEffect(() => {
    if (!dirty && name !== base) {
      setBase(name);
      setValue(name);
    }
  }, [name, base, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const trimmed = value.replace(/\s+/g, ' ').trim();
  const invalid = trimmed.length < 2 || trimmed.length > 80;

  const submit = async () => {
    if (invalid || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const out = await patchProfile({ name: trimmed });
      setBase(out.name);
      setValue(out.name);
      cache.patch((prev) => ({ ...prev, profile: { ...prev.profile, name: out.name } }));
      await update({ name: out.name }).catch(() => undefined);
      toast.success(copy.nameSaved);
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={nameId} className="text-sm font-medium text-fg">
          {copy.nameLabel}
        </label>
        <Input
          id={nameId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="name"
          maxLength={80}
          aria-invalid={dirty && invalid}
          aria-describedby={`${hintId}${error ? ` ${nameId}-err` : ''}`}
          className="text-base"
        />
        <p id={hintId} className="qx-small text-fg-muted">
          {copy.nameHint}
        </p>
        {error ? <InlineError id={`${nameId}-err`}>{error}</InlineError> : null}
      </div>
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-brand-border bg-brand-subtle px-3 py-2">
          <p className="qx-small flex-1 text-fg" role="status">
            {copy.nameUnsaved}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setValue(base)} disabled={saving}>
            {copy.nameDiscard}
          </Button>
          <Button type="submit" size="sm" loading={saving} disabled={invalid || saving}>
            {copy.nameSave}
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor={emailId} className="text-sm font-medium text-fg">
          {copy.emailLabel}
        </label>
        <Input id={emailId} value={email} readOnly aria-describedby={emailHintId} className="text-base" autoComplete="email" />
        <p id={emailHintId} className="qx-small text-fg-muted">
          {copy.emailHint}{' '}
          <Link href="/customer/me/settings?tab=privacy" className="font-medium text-brand underline underline-offset-4">
            {copy.emailRequestChange}
          </Link>
        </p>
      </div>
    </form>
  );
}
