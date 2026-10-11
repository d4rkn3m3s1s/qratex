'use client';

import { useEffect, useMemo, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmAction, InlineError, SectionCard } from '@/components/states';
import { DirtyBar, StatusBadge } from '@/components/ds';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import { PLATFORM_SETTINGS, SETTINGS_KEYS } from '@/lib/platform-settings/registry';
import { errorText, isConflict } from './api';
import { SettingSwitchRow, changeFor, useSaveSettings } from './shared';

type Draft = { registration: boolean; google: boolean; magic: boolean };

function fromState(s: PlatformSettingsState): Draft {
  return {
    registration: s.values[SETTINGS_KEYS.registrationOpen],
    google: s.values[SETTINGS_KEYS.googleAuth],
    magic: s.values[SETTINGS_KEYS.magicLink],
  };
}

export function IdentitySection({ state }: { state: PlatformSettingsState }) {
  const base = useMemo(() => fromState(state), [state]);
  const [draft, setDraft] = useState<Draft>(base);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useSaveSettings();
  const { context } = state;

  // Sunucudan yeni sürüm geldiğinde (kayıt / çakışma sonrası) taslağı tazele.
  useEffect(() => setDraft(base), [base]);

  const dirtyKeys = (Object.keys(draft) as Array<keyof Draft>).filter((k) => draft[k] !== base[k]);
  const dirty = dirtyKeys.length > 0;
  const risky = (base.registration && !draft.registration) || (base.google && !draft.google);

  const doSave = async () => {
    const changes = [];
    if (draft.registration !== base.registration) changes.push(changeFor(state, SETTINGS_KEYS.registrationOpen, draft.registration));
    if (draft.google !== base.google) changes.push(changeFor(state, SETTINGS_KEYS.googleAuth, draft.google));
    if (draft.magic !== base.magic) changes.push(changeFor(state, SETTINGS_KEYS.magicLink, draft.magic));
    if (changes.length === 0) return;
    await save.mutateAsync(changes);
    toast.success('Kimlik ayarları kaydedildi. Giriş ve kayıt ekranları hemen yeni hâli kullanır.');
  };

  const onSave = () => {
    if (risky) setConfirmOpen(true);
    else void doSave().catch(() => undefined);
  };

  const conflict = save.error && isConflict(save.error);

  return (
    <SectionCard
      title="Kimlik doğrulama"
      description="Bu anahtarlar gerçek kimlik akışlarını yönetir; her birinin yanında etkisi yazılıdır."
      icon={<KeyRound aria-hidden />}
    >
      <div className="divide-y divide-border">
        <SettingSwitchRow
          label={PLATFORM_SETTINGS[SETTINGS_KEYS.registrationOpen].label}
          description={PLATFORM_SETTINGS[SETTINGS_KEYS.registrationOpen].effect}
          checked={draft.registration}
          onChange={(v) => setDraft((d) => ({ ...d, registration: v }))}
          dirty={draft.registration !== base.registration}
          badge={<StatusBadge size="sm" label={base.registration ? 'Açık' : 'Kapalı'} tone={base.registration ? 'success' : 'warning'} />}
        />
        <SettingSwitchRow
          label={PLATFORM_SETTINGS[SETTINGS_KEYS.googleAuth].label}
          description={
            <>
              {PLATFORM_SETTINGS[SETTINGS_KEYS.googleAuth].effect}
              {!context.googleEnvConfigured ? ' Bu ortamda Google kimlik bilgileri (GOOGLE_CLIENT_ID/SECRET) tanımlı olmadığı için düğme zaten görünmüyor.' : ''}
            </>
          }
          checked={draft.google}
          onChange={(v) => setDraft((d) => ({ ...d, google: v }))}
          dirty={draft.google !== base.google}
          badge={
            <StatusBadge
              size="sm"
              label={!context.googleEnvConfigured ? 'Ortamda yok' : base.google ? 'Açık' : 'Kapalı'}
              tone={!context.googleEnvConfigured ? 'neutral' : base.google ? 'success' : 'warning'}
            />
          }
        />
        <SettingSwitchRow
          label={PLATFORM_SETTINGS[SETTINGS_KEYS.magicLink].label}
          description={
            <>
              {PLATFORM_SETTINGS[SETTINGS_KEYS.magicLink].effect}
              {!context.mail.configured ? ' Şu an e-posta gönderimi yapılandırılmamış.' : ''}
            </>
          }
          checked={draft.magic}
          onChange={(v) => setDraft((d) => ({ ...d, magic: v }))}
          dirty={draft.magic !== base.magic}
          badge={
            <StatusBadge
              size="sm"
              label={base.magic ? (context.mail.configured ? 'Açık' : 'Açık · e-posta yok') : 'Kapalı'}
              tone={base.magic ? (context.mail.configured ? 'success' : 'warning') : 'neutral'}
            />
          }
        />
      </div>

      {save.error && !conflict ? (
        <InlineError variant="banner" className="mt-4">
          {errorText(save.error)}
        </InlineError>
      ) : null}

      <DirtyBar
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onDiscard={() => {
          setDraft(base);
          save.reset();
        }}
        message={`${dirtyKeys.length} kimlik ayarı değişti`}
        conflict={conflict ? true : null}
        onReloadLatest={() => setDraft(base)}
      />

      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="warning"
        title="Giriş yollarını kısıtlamak istiyor musunuz?"
        description="Kaydedildiği anda giriş ve kayıt ekranları değişir."
        impact={[
          ...(base.registration && !draft.registration
            ? [{ label: 'Yeni kayıt', value: 'E-posta ve Google ile yeni hesap açılamaz', emphasis: true }]
            : []),
          ...(base.google && !draft.google
            ? [
                {
                  label: 'Google ile giriş',
                  value:
                    context.googleLinkedUsers === null
                      ? 'Google hesabı bağlı kullanıcılar (sayı okunamadı) Google ile giremez'
                      : `Google hesabı bağlı ${context.googleLinkedUsers.toLocaleString('tr-TR')} kullanıcı Google ile giremez`,
                  emphasis: true,
                },
              ]
            : []),
        ]}
        irreversibleNote="İstediğiniz an yeniden açabilirsiniz. Şifresi olan kullanıcılar e-posta ve şifreyle girmeye devam eder."
        confirmLabel="Kaydet"
        onConfirm={doSave}
      />
    </SectionCard>
  );
}
