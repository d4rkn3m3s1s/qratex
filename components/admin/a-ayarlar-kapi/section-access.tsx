'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction, InlineError, QueryState, SectionCard } from '@/components/states';
import { DirtyBar, StatusBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { AccessState } from '@/lib/platform-settings/server';
import { errorText, fetchAccess, isConflict, saveAccess, settingsKeys } from './api';
import { SettingSwitchRow } from './shared';
import { AdminAyarlarKapiText } from './copy';

type Role = 'dealer' | 'customer';
const ROLE_LABEL: Record<Role, string> = { dealer: 'Bayi', customer: 'Müşteri' };
const SEVERITY_LABEL: Record<string, string> = { critical: 'Kritik', important: 'Önemli', optional: 'İsteğe bağlı' };

export function AccessSection() {
  const query = useQuery({ queryKey: settingsKeys.access, queryFn: ({ signal }) => fetchAccess(signal) });
  return (
    <QueryState query={query} skeleton="list" loadingLabel="Erişim ayarları yükleniyor">
      {(data) => <AccessEditor access={data} />}
    </QueryState>
  );
}

type Draft = Pick<AccessState, 'featureVisibility' | 'menuVisibility'>;

function AccessEditor({ access }: { access: AccessState }) {
  const qc = useQueryClient();
  const base = useMemo<Draft>(
    () => ({ featureVisibility: access.featureVisibility, menuVisibility: access.menuVisibility }),
    [access]
  );
  const [draft, setDraft] = useState<Draft>(base);
  const [role, setRole] = useState<Role>('dealer');
  useEffect(() => setDraft(base), [base]);

  const changed = useMemo(() => {
    let n = 0;
    for (const r of ['dealer', 'customer'] as Role[]) {
      for (const [k, v] of Object.entries(draft.featureVisibility[r])) if (base.featureVisibility[r][k] !== v) n++;
      for (const [k, v] of Object.entries(draft.menuVisibility[r])) if (base.menuVisibility[r][k] !== v) n++;
    }
    return n;
  }, [draft, base]);

  const mutation = useMutation({
    mutationFn: (clearSystemBlocks: boolean) =>
      saveAccess({
        featureVisibility: draft.featureVisibility,
        menuVisibility: draft.menuVisibility,
        clearSystemBlocks,
        baseVersions: { ...access.versions },
      }),
    onSuccess: (next, clearSystemBlocks) => {
      qc.setQueryData(settingsKeys.access, next);
      void qc.invalidateQueries({ queryKey: settingsKeys.history });
      toast.success(clearSystemBlocks ? 'Eski sistem görünürlüğü kapatmaları kaldırıldı.' : 'Görünürlük kaydedildi. Paneller hemen yeni hâli kullanır.');
    },
    onError: (e) => {
      if (isConflict(e)) {
        toast.error('Görünürlük siz düzenlerken değişti. Güncel hâl yüklendi.');
        void qc.invalidateQueries({ queryKey: settingsKeys.access });
      }
    },
  });

  const setFeature = (key: string, v: boolean) =>
    setDraft((d) => ({ ...d, featureVisibility: { ...d.featureVisibility, [role]: { ...d.featureVisibility[role], [key]: v } } }));
  const setMenu = (key: string, v: boolean) =>
    setDraft((d) => ({ ...d, menuVisibility: { ...d.menuVisibility, [role]: { ...d.menuVisibility[role], [key]: v } } }));
  const setAll = (kind: 'feature' | 'menu', v: boolean) =>
    setDraft((d) => {
      if (kind === 'feature') {
        const map = Object.fromEntries(Object.keys(d.featureVisibility[role]).map((k) => [k, v]));
        return { ...d, featureVisibility: { ...d.featureVisibility, [role]: map } };
      }
      const map = Object.fromEntries(Object.keys(d.menuVisibility[role]).map((k) => [k, v]));
      return { ...d, menuVisibility: { ...d.menuVisibility, [role]: map } };
    });

  const conflict = mutation.error && isConflict(mutation.error);

  return (
    <div className="space-y-6">
      <InlineError variant="banner" tone="info">
        Bir modülü herkes için açıp kapatmak, kademeli açılış ve deneyler{' '}
        <Link href="/admin/features" className="font-medium underline underline-offset-4">
          Özellik ve Deney Kontrolü
        </Link>
        ’ndedir. Burada yalnız açık bir modülün belirli bir rolden gizlenmesi yönetilir; ikisi birlikte uygulanır.
      </InlineError>

      {access.systemBlocked.length > 0 ? (
        <InlineError variant="banner" tone="warning">
          <span className="block">
            Eski “sistem görünürlüğü” katmanında kapalı kalmış {access.systemBlocked.length} yönetici modülü var (
            {access.systemBlocked.map((s) => s.label).join(', ')}). Bu katman Özellik Kontrolü ile çakışıyordu ve artık düzenlenmiyor.
          </span>
          <ConfirmAction
            trigger={
              <Button variant="outline" size="sm" className="mt-2 min-h-11">
                Bu kapatmaları kaldır
              </Button>
            }
            tone="warning"
            title="Eski sistem görünürlüğü kapatmaları kaldırılsın mı?"
            description="Bu modüllerin açık/kapalı durumu bundan sonra yalnız Özellik Kontrolü’nden belirlenir."
            impact={access.systemBlocked.map((s) => ({ label: s.label, value: 'Rol engeli kalkar' }))}
            irreversibleNote={false}
            confirmLabel="Kaldır"
            disabled={changed > 0}
            onConfirm={() => mutation.mutateAsync(true)}
          />
          {changed > 0 ? <span className="qx-caption mt-1 block"><AdminAyarlarKapiText k="saveFirst" /></span> : null}
        </InlineError>
      ) : null}

      <div role="tablist" aria-label="Rol" className="inline-flex rounded-control border border-border p-1">
        {(['dealer', 'customer'] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => setRole(r)}
            className={cn('qx-small min-h-11 rounded-chip px-4 font-medium', role === r ? 'bg-brand-subtle text-brand' : 'text-fg-muted hover:bg-surface-muted')}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      <SectionCard
        title={`${ROLE_LABEL[role]} özellikleri`}
        description="Kapalı özellik bu rolde menüden kalkar ve uçları 403 döner."
        icon={<Eye aria-hidden />}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll('feature', true)}>
              Tümünü aç
            </Button>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll('feature', false)}>
              Tümünü kapat
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border">
          {access.features[role].map((f) => (
            <SettingSwitchRow
              key={f.key}
              label={f.label}
              description={f.description}
              checked={draft.featureVisibility[role][f.key] !== false}
              onChange={(v) => setFeature(f.key, v)}
              dirty={draft.featureVisibility[role][f.key] !== base.featureVisibility[role][f.key]}
              badge={
                <>
                  {f.severity === 'critical' ? <StatusBadge size="sm" label={SEVERITY_LABEL[f.severity]} tone="danger" icon={null} /> : null}
                  {!f.globallyEnabled ? (
                    <Link href="/admin/features" className="qx-caption inline-flex min-h-6 items-center gap-0.5 rounded-chip bg-warning-subtle px-1.5 text-warning underline-offset-2 hover:underline">
                      Herkese kapalı <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={`${ROLE_LABEL[role]} menüsü`}
        description="Kapalı menü öğesi bu rolün kenar çubuğunda ve mobil menüsünde görünmez, sayfası açılmaz."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll('menu', true)}>
              Tümünü aç
            </Button>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll('menu', false)}>
              Tümünü kapat
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border">
          {access.menu[role].map((m) => (
            <SettingSwitchRow
              key={m.key}
              label={m.label}
              description={m.href}
              checked={draft.menuVisibility[role][m.key] !== false}
              onChange={(v) => setMenu(m.key, v)}
              dirty={draft.menuVisibility[role][m.key] !== base.menuVisibility[role][m.key]}
            />
          ))}
        </div>
      </SectionCard>

      {mutation.error && !conflict ? <InlineError variant="banner">{errorText(mutation.error)}</InlineError> : null}

      <DirtyBar
        dirty={changed > 0}
        saving={mutation.isPending}
        onSave={() => mutation.mutate(false)}
        onDiscard={() => {
          setDraft(base);
          mutation.reset();
        }}
        message={`${changed} görünürlük değişikliği`}
        conflict={conflict ? true : null}
        onReloadLatest={() => setDraft(base)}
      />
    </div>
  );
}
