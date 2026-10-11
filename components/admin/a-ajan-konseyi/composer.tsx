'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import {
  AGENT_PROFILES,
  TOPIC_MAX,
  TOPIC_MIN,
  plannedCalls,
  scopeLabel,
  type CouncilSettingsPayload,
  type DealerOption,
  type SessionDetail,
  type SessionPage,
} from '@/lib/council/contract';
import { councilKeys, createSession, errorText, fetchSessions, fetchSettings } from './api';
import { DealerPicker, RelativeTime, SessionStatusBadge } from './parts';
import { requestAutoRun, takeComposerPrefill } from './session-store';

const EXAMPLES = [
  'Negatif geri bildirim oranı yükselen bayiler için önümüzdeki iki haftada ne yapmalıyız?',
  'Açık aksiyon maddeleri birikiyor; bayilerin bunları kapatmasını nasıl hızlandırırız?',
  'Şüpheli kayıtların incelenmesini önceliklendirmek için hangi kuralı koymalıyız?',
];

export function Composer({
  settings: settingsInitial,
  recentInitial,
  onOpenSession,
  onOpenSettings,
  onOpenHistory,
}: {
  settings: CouncilSettingsPayload | null;
  recentInitial: SessionPage | null;
  onOpenSession: (id: string, created?: SessionDetail) => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}) {
  const topicId = useId();
  const counterId = useId();
  const [topic, setTopic] = useState('');
  const [scopeKind, setScopeKind] = useState<'platform' | 'dealer'>('platform');
  const [dealer, setDealer] = useState<DealerOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = takeComposerPrefill();
    if (!p) return;
    setTopic(p.topic);
    if (p.scope.kind === 'dealer') {
      setScopeKind('dealer');
      setDealer(p.scope.dealer);
    }
  }, []);

  const settingsQ = useQuery({
    queryKey: councilKeys.settings(),
    queryFn: fetchSettings,
    initialData: settingsInitial ?? undefined,
    staleTime: 30_000,
  });
  const settings = settingsQ.data ?? null;
  const recent = useQuery({
    queryKey: councilKeys.recent(),
    queryFn: () => fetchSessions('limit=5'),
    initialData: recentInitial ?? undefined,
    staleTime: 15_000,
  });

  const len = topic.trim().length;
  const tooShort = len > 0 && len < TOPIC_MIN;
  const aiReady = settings?.ai.configured ?? false;
  const cfg = settings?.config;

  const submit = async () => {
    setError(null);
    if (len < TOPIC_MIN) return setError(`Soru en az ${TOPIC_MIN} karakter olmalı.`);
    if (scopeKind === 'dealer' && !dealer) return setError('Bayi kapsamı için bir bayi seçin.');
    setBusy(true);
    try {
      const s = await createSession({ topic: topic.trim(), scope: scopeKind === 'dealer' && dealer ? { kind: 'dealer', dealerId: dealer.id } : { kind: 'platform' } });
      requestAutoRun(s.id);
      onOpenSession(s.id, s);
    } catch (e) {
      setError(errorText(e, 'Oturum başlatılamadı.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <SectionCard title="Konseye soru sor" headingLevel="h2" icon={<Sparkles aria-hidden />} description="Uzmanlar soruyu tur tur tartışır, Kaptan tek bir karar ve aksiyon paketi çıkarır. Her oturum kaydedilir.">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {(settings && !aiReady) || settingsQ.isError ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-fg">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              {settings
                ? 'Yapay zekâ sağlayıcısı yapılandırılmamış. Konsey gerçek model olmadan çalışmaz (şablon yanıt üretilmez).'
                : 'Ayarlar yüklenemedi; yapay zekâ durumu bilinmiyor. Sayfayı yenileyin.'}
            </p>
          ) : null}

          <div className="space-y-2">
            <label htmlFor={topicId} className="text-sm font-medium text-fg">
              Soru ya da hedef
            </label>
            <textarea
              id={topicId}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={4}
              maxLength={TOPIC_MAX}
              aria-describedby={counterId}
              aria-invalid={tooShort || undefined}
              placeholder="Örn. Bu ay kayıp riski yüksek bayilerde memnuniyeti artırmak için önceliğimiz ne olmalı?"
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-base text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:text-sm"
            />
            <div id={counterId} className="flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
              <span className={tooShort ? 'text-danger' : undefined}>
                {tooShort ? `En az ${TOPIC_MIN} karakter.` : 'Gönder: Ctrl/⌘ + Enter'}
              </span>
              <span className="tabular-nums">
                {len}/{TOPIC_MAX}
              </span>
            </div>
            {len === 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {EXAMPLES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setTopic(x)}
                    className="min-h-11 rounded-chip border border-border px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0"
                  >
                    {x}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Kapsam</legend>
            <ChoiceChips
              aria-label="Kapsam"
              options={[
                { value: 'platform', label: 'Tüm platform' },
                { value: 'dealer', label: 'Tek bayi' },
              ]}
              value={scopeKind}
              onChange={(v) => v && setScopeKind(v as 'platform' | 'dealer')}
            />
            <p className="text-xs text-fg-muted">Kapsam, konseye verilen veri paketini belirler (bayi seçilirse yalnız o bayinin verisi).</p>
            {scopeKind === 'dealer' ? <DealerPicker value={dealer} onChange={setDealer} invalid={!!error && !dealer} /> : null}
          </fieldset>

          {cfg ? (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-fg-muted">
              {cfg.rounds} tur · {cfg.specialists.map((a) => AGENT_PROFILES[a].name).join(', ')} + Kaptan · veri paketi{' '}
              {cfg.includeData ? 'açık' : 'kapalı'} · en fazla {plannedCalls(cfg)} LLM çağrısı
              {settings?.ai.model ? ` · ${settings.ai.model}` : ''}.{' '}
              <button type="button" onClick={onOpenSettings} className="font-medium text-brand underline-offset-4 hover:underline">
                Ayarları değiştir
              </button>
            </p>
          ) : null}

          {error ? <InlineError variant="banner">{error}</InlineError> : null}

          <Button type="submit" disabled={busy || !aiReady || len < TOPIC_MIN} className="w-full sm:w-auto">
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden className="h-4 w-4" />}
            Konseyi topla
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        title="Son oturumlar"
        headingLevel="h2"
        density="compact"
        actions={
          <button type="button" onClick={onOpenHistory} className="min-h-11 rounded-md px-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0">
            Tümü
          </button>
        }
      >
        <QueryState
          query={recent}
          skeleton="list"
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState compact variant="first-use" title="Henüz oturum yok" description="İlk sorunuzla konseyi toplayın; her oturum burada kalır." headingLevel="p" />}
        >
          {(d) => (
            <ul className="divide-y divide-border">
              {d.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    className="group flex w-full min-h-11 flex-col gap-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="line-clamp-2 text-sm font-medium text-fg group-hover:underline">{s.topic}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <SessionStatusBadge status={s.status} />
                      {scopeLabel(s.scope)} · <RelativeTime iso={s.createdAt} />
                      <ArrowRight aria-hidden className="ml-auto h-3 w-3" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
