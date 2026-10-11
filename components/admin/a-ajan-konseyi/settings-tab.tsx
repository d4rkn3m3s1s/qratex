'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Cpu, History, Loader2, RotateCcw, Save, Settings2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError, QueryState } from '@/components/states';
import {
  AGENT_PROFILES,
  DEFAULT_COUNCIL_CONFIG,
  SPECIALISTS,
  agentLabel,
  councilConfigSchema,
  plannedCalls,
  type CouncilConfig,
  type CouncilSettingsPayload,
  type Specialist,
} from '@/lib/council/contract';
import { CouncilApiError, councilKeys, errorText, fetchSettings, saveSettings } from './api';
import { AgentAvatar, RelativeTime } from './parts';
import { AdminAjanKonseyiText } from './copy';

/**
 * Ayarlar — yalnız motorun gerçekten okuduğu parametreler. Kaydedilen değer sonraki oturumların
 * anlık görüntüsüne girer; süren/geçmiş oturumlar kendi ayarıyla kalır.
 */
export function SettingsTab({ initial }: { initial: CouncilSettingsPayload | null }) {
  const query = useQuery({ queryKey: councilKeys.settings(), queryFn: fetchSettings, initialData: initial ?? undefined, staleTime: 30_000 });
  return (
    <QueryState query={query} skeleton="form">
      {(data) => <SettingsBody data={data} />}
    </QueryState>
  );
}

function sameConfig(a: CouncilConfig, b: CouncilConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SettingsBody({ data }: { data: CouncilSettingsPayload }) {
  const qc = useQueryClient();
  const guidanceId = useId();
  const dataSwitchId = useId();
  const [draft, setDraft] = useState<CouncilConfig>(data.config);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(data.config), [data.config]);

  const dirty = !sameConfig(draft, data.config);
  const valid = councilConfigSchema.safeParse(draft);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = async () => {
    setError(null);
    setConflict(false);
    if (!valid.success) return setError(valid.error.issues[0]?.message ?? 'Ayarlar geçersiz.');
    setBusy(true);
    try {
      const next = await saveSettings(valid.data, data.updatedAt);
      qc.setQueryData(councilKeys.settings(), next);
      toast.success('Konsey ayarları kaydedildi; sonraki oturumlar bu ayarla çalışır.');
    } catch (e) {
      if (e instanceof CouncilApiError && e.status === 409) setConflict(true);
      setError(errorText(e, 'Ayarlar kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const maxWin = useMemo(() => Math.max(1, ...data.winners.map((w) => w.count)), [data.winners]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <SectionCard title="Konsey yapılandırması" headingLevel="h2" icon={<Settings2 aria-hidden />} description="Yalnız oturumları gerçekten değiştiren ayarlar. Her kayıt denetim izine yazılır.">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {data.recovered ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-fg">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Kayıtlı ayar okunamadı; varsayılanlar gösteriliyor. Kaydederseniz düzelir.
            </p>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg"><AdminAjanKonseyiText k="rounds" /></legend>
            <ChoiceChips
              aria-label="Tartışma turu sayısı"
              options={[
                { value: '1', label: '1 tur' },
                { value: '2', label: '2 tur' },
                { value: '3', label: '3 tur' },
              ]}
              value={String(draft.rounds)}
              onChange={(v) => v && setDraft((d) => ({ ...d, rounds: Number(v) }))}
            />
            <p className="text-xs text-fg-muted"><AdminAjanKonseyiText k="roundsHint" /></p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg"><AdminAjanKonseyiText k="speakers" /></legend>
            <ChoiceChips
              mode="multiple"
              aria-label="Konuşan uzmanlar"
              options={SPECIALISTS.map((a) => ({ value: a, label: `${AGENT_PROFILES[a].name} · ${AGENT_PROFILES[a].role}`, icon: <AgentAvatar agent={a} size="sm" /> }))}
              value={draft.specialists}
              onChange={(v) => setDraft((d) => ({ ...d, specialists: SPECIALISTS.filter((s) => (v as Specialist[]).includes(s)) }))}
            />
            <p className="text-xs text-fg-muted"><AdminAjanKonseyiText k="speakersHint" /></p>
            <ul className="mt-2 space-y-1 text-xs text-fg-muted">
              {SPECIALISTS.map((a) => (
                <li key={a}>
                  <span className="font-medium text-fg">{AGENT_PROFILES[a].name}:</span> {AGENT_PROFILES[a].focus}
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor={dataSwitchId} className="text-sm font-medium text-fg">
                Veri paketi
              </label>
              <p className="text-xs text-fg-muted">
                Açıkken oturum başında son 30 günün geri bildirim, duygu, kayıp riski, açık aksiyon ve şüpheli kayıt sayıları toplanır ve uzmanlara verilir. Kapalıyken konsey sayı kullanmaz.
              </p>
            </div>
            <Switch id={dataSwitchId} checked={draft.includeData} onCheckedChange={(c) => setDraft((d) => ({ ...d, includeData: c }))} />
          </div>

          <div className="space-y-2">
            <label htmlFor={guidanceId} className="text-sm font-medium text-fg">
              Kurum talimatı <span className="font-normal text-fg-muted"><AdminAjanKonseyiText k="optional" /></span>
            </label>
            <textarea
              id={guidanceId}
              value={draft.guidance}
              maxLength={500}
              rows={3}
              onChange={(e) => setDraft((d) => ({ ...d, guidance: e.target.value }))}
              placeholder="Örn. Önerilerde bayinin ek maliyetini en aza indir; müşteri verisini paylaşma."
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            <p className="text-xs text-fg-muted">Her ajanın istemine eklenir. {draft.guidance.length}/500</p>
          </div>

          <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-fg-muted">Bu ayarla bir oturum en fazla {plannedCalls(draft)} LLM çağrısı yapar.</p>

          {error ? (
            <InlineError variant="banner" onRetry={conflict ? () => qc.invalidateQueries({ queryKey: councilKeys.settings() }) : undefined}>
              {error}
            </InlineError>
          ) : null}

          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 bg-surface-1 px-1 py-2">
            <Button type="submit" disabled={!dirty || busy || !valid.success}>
              {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden className="h-4 w-4" />}
              Kaydet
            </Button>
            <Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => setDraft(data.config)}>
              Vazgeç
            </Button>
            <Button type="button" variant="ghost" disabled={busy || sameConfig(draft, DEFAULT_COUNCIL_CONFIG)} onClick={() => setDraft(DEFAULT_COUNCIL_CONFIG)}>
              <RotateCcw aria-hidden className="h-4 w-4" /> Varsayılanlar
            </Button>
            <span role="status" className="text-xs text-fg-muted">
              {dirty ? 'Kaydedilmemiş değişiklik var.' : data.updatedAt ? <><AdminAjanKonseyiText k="lastSaved" /> <RelativeTime iso={data.updatedAt} /></> : 'Varsayılan ayarlar kullanılıyor.'}
            </span>
          </div>
        </form>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="Yapay zekâ sağlayıcısı" headingLevel="h2" density="compact" icon={<Cpu aria-hidden />}>
          {data.ai.configured ? (
            <p className="text-sm text-fg">
              {data.ai.provider} · <span className="font-medium">{data.ai.model}</span>
            </p>
          ) : (
            <p className="text-sm text-danger"><AdminAjanKonseyiText k="notConfigured" /></p>
          )}
          <p className="mt-1 text-xs text-fg-muted">
            Model platform genelinde ayarlanır.{' '}
            <Link href="/admin/ai/studio" className="font-medium text-brand underline-offset-4 hover:underline">
              Prompt ve Model Stüdyosu
            </Link>
          </p>
        </SectionCard>

        <SectionCard title="Son 90 günde öne çıkanlar" headingLevel="h2" density="compact" icon={<Trophy aria-hidden />} description={`${data.completed90d} tamamlanan oturum`}>
          {data.winners.length === 0 ? (
            <p className="text-sm text-fg-muted"><AdminAjanKonseyiText k="noSessions" /></p>
          ) : (
            <ul className="space-y-2">
              {data.winners.map((w) => (
                <li key={w.agent} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-fg">{agentLabel(w.agent)}</span>
                    <span className="tabular-nums text-fg-muted">{w.count}</span>
                  </div>
                  <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(w.count / maxWin) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Değişiklik geçmişi" headingLevel="h2" density="compact" icon={<History aria-hidden />}>
          {data.history.length === 0 ? (
            <p className="text-sm text-fg-muted"><AdminAjanKonseyiText k="noChanges" /></p>
          ) : (
            <ol className="space-y-3 text-sm">
              {data.history.map((h) => (
                <li key={h.id}>
                  <p className="text-fg">
                    {h.actorName ?? 'Bilinmeyen yönetici'} · <RelativeTime iso={h.at} className="text-fg-muted" />
                  </p>
                  {h.after ? (
                    <p className="text-xs text-fg-muted">
                      {h.after.rounds} tur · {h.after.specialists.map((a) => AGENT_PROFILES[a].name).join(', ')} · veri {h.after.includeData ? 'açık' : 'kapalı'}
                      {h.after.guidance ? ' · talimat var' : ''}
                    </p>
                  ) : null}
                  {h.after ? (
                    <button type="button" className="mt-1 min-h-11 text-xs font-medium text-brand hover:underline sm:min-h-0" onClick={() => setDraft(h.after!)}>
                      Bu sürümü forma yükle
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
