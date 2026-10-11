'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  Ban,
  Check,
  ClipboardCopy,
  Database,
  Download,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, ErrorState, QueryState, TONE_CHIP } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  AGENT_PROFILES,
  PRIORITY_LABEL,
  agentLabel,
  plannedCalls,
  scopeLabel,
  sessionToMarkdown,
  type CouncilAgent,
  type SessionDetail,
  type SessionMessage,
} from '@/lib/council/contract';
import { CouncilApiError, councilKeys, errorText, fetchSession, sessionAction, stepSession } from './api';
import { AgentAvatar, RelativeTime, SessionStatusBadge } from './parts';
import { PublishDialog } from './publish-dialog';
import { autoRunRequested, clearAutoRun, setComposerPrefill } from './session-store';

const ACTION_STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  assigned: 'Atandı',
  in_progress: 'Sürüyor',
  done: 'Tamamlandı',
  cancelled: 'İptal',
};

export function SessionView({
  id,
  initial,
  onBack,
  onOpenSettings,
}: {
  id: string;
  initial: SessionDetail | null;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: councilKeys.session(id),
    queryFn: () => fetchSession(id),
    initialData: initial ?? undefined,
    staleTime: 10_000,
    // Başka sekmede/oturumda bir adım sürüyorsa kendiliğinden tazelen.
    refetchInterval: (q) => (q.state.data?.stepInFlight ? 5_000 : false),
  });

  return (
    <QueryState
      query={query}
      skeleton="detail"
      error={{ title: 'Oturum açılamadı', action: <Button variant="outline" onClick={onBack}>Yeni oturuma dön</Button> }}
    >
      {(s) => (
        <SessionBody
          session={s}
          onBack={onBack}
          onOpenSettings={onOpenSettings}
          onUpdate={(next) => {
            qc.setQueryData(councilKeys.session(id), next);
            void qc.invalidateQueries({ queryKey: ['admin-council', 'sessions'] });
          }}
          onRefetch={() => query.refetch()}
        />
      )}
    </QueryState>
  );
}

type RunnerState = { mode: 'idle' } | { mode: 'stepping'; label: string } | { mode: 'paused' } | { mode: 'error'; message: string };

function stepLabel(s: SessionDetail): string {
  if (s.nextStep === 'synthesis') return 'Kaptan kararı yazıyor: kazanan görüş, güven, karşı görüşler ve aksiyonlar.';
  const names = (s.config?.specialists ?? []).map((a) => AGENT_PROFILES[a].name).join(', ');
  return `Tur ${s.nextStep}/${s.plannedRounds}: ${names} paralel düşünüyor; ardından Kaptan turu toparlayacak.`;
}

function SessionBody({
  session: s,
  onBack,
  onOpenSettings,
  onUpdate,
  onRefetch,
}: {
  session: SessionDetail;
  onBack: () => void;
  onOpenSettings: () => void;
  onUpdate: (s: SessionDetail) => void;
  onRefetch: () => unknown;
}) {
  const [runner, setRunner] = useState<RunnerState>({ mode: 'idle' });
  const [autoRun, setAutoRun] = useState(() => autoRunRequested(s.id));
  const abortRef = useRef<AbortController | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const decisionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canStep = s.status === 'running' && s.nextStep != null && !s.legacy;

  const runStep = useCallback(async () => {
    if (!canStep) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const label = stepLabel(s);
    setRunner({ mode: 'stepping', label });
    announce(label);
    try {
      const next = await stepSession(s.id, ctrl.signal);
      onUpdate(next);
      setRunner({ mode: 'idle' });
      if (next.status === 'completed') {
        announce('Konsey kararı hazır.');
        clearAutoRun(s.id);
        setAutoRun(false);
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        setRunner({ mode: 'paused' });
        return;
      }
      clearAutoRun(s.id);
      setAutoRun(false);
      if (e instanceof CouncilApiError && e.code === 'STEP_IN_PROGRESS') {
        setRunner({ mode: 'idle' });
        onRefetch();
        return;
      }
      setRunner({ mode: 'error', message: errorText(e, 'Adım tamamlanamadı.') });
      onRefetch();
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [canStep, s, onUpdate, onRefetch]);

  // Otomatik yürütme: yalnız bu sekmede yeni başlatılan ya da "Devam et" denen oturum ilerler.
  useEffect(() => {
    if (autoRun && canStep && !s.stepInFlight && runner.mode === 'idle') void runStep();
  }, [autoRun, canStep, s.stepInFlight, runner.mode, runStep]);

  const pause = () => {
    setAutoRun(false);
    clearAutoRun(s.id);
    abortRef.current?.abort();
    setRunner({ mode: 'paused' });
  };
  const resume = () => {
    setRunner({ mode: 'idle' });
    setAutoRun(true);
  };

  const act = async (action: 'cancel' | 'archive' | 'unarchive') => {
    if (action === 'cancel') {
      setAutoRun(false);
      abortRef.current?.abort();
    }
    const next = await sessionAction(s.id, action);
    onUpdate(next);
    setRunner({ mode: 'idle' });
    toast.success(action === 'cancel' ? 'Oturum sonlandırıldı.' : action === 'archive' ? 'Oturum arşivlendi.' : 'Oturum arşivden çıkarıldı.');
  };

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(sessionToMarkdown(s));
      toast.success('Oturum Markdown olarak panoya kopyalandı.');
    } catch {
      toast.error('Panoya erişilemedi. "İndir" seçeneğini kullanın.');
    }
  };
  const downloadMd = () => {
    const blob = new Blob([sessionToMarkdown(s)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ajan-konseyi-${s.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const rerun = () => {
    setComposerPrefill({
      topic: s.topic,
      scope: s.scope?.kind === 'dealer' ? { kind: 'dealer', dealer: { id: s.scope.dealerId, label: s.scope.dealerName, secondary: null } } : { kind: 'platform' },
    });
    onBack();
  };

  const stepping = runner.mode === 'stepping';

  return (
    <div className="space-y-4">
      {/* Oturum şeridi */}
      <SectionCard density="compact">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-1 rounded-md pr-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" /> Yeni oturum
            </button>
            <span aria-hidden className="text-fg-muted">·</span>
            <SessionStatusBadge status={s.status} />
            <span className={cn('rounded-chip px-2 py-0.5 text-xs font-medium', TONE_CHIP.neutral)}>{scopeLabel(s.scope)}</span>
            {s.models.length ? (
              <span className="text-xs text-fg-muted" title="Bu oturumda yanıt veren model">
                Model: {s.models.join(', ')} · {s.callCount} çağrı
              </span>
            ) : null}
          </div>
          <h2 className="text-lg font-semibold leading-snug text-fg sm:text-xl">{s.topic}</h2>
          <p className="text-xs text-fg-muted">
            {s.createdByName ?? 'Bilinmeyen yönetici'} başlattı · <RelativeTime iso={s.createdAt} />
            {s.config ? ` · ${s.config.rounds} tur, ${s.config.specialists.length} uzman + Kaptan, en fazla ${plannedCalls(s.config)} LLM çağrısı` : ''}
          </p>

          {!s.legacy && s.plannedRounds > 0 ? <StepTrack s={s} stepping={stepping} /> : null}

          <div className="flex flex-wrap gap-2">
            {s.status === 'running' && !s.legacy ? (
              stepping ? (
                <Button variant="outline" onClick={pause}>
                  <Pause aria-hidden className="h-4 w-4" /> Duraklat
                </Button>
              ) : (
                <Button onClick={resume} disabled={s.stepInFlight}>
                  <Play aria-hidden className="h-4 w-4" /> {s.messages.length ? 'Devam et' : 'Konseyi başlat'}
                </Button>
              )
            ) : null}
            {s.status === 'running' ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Ban aria-hidden className="h-4 w-4" /> Sonlandır
                  </Button>
                }
                tone="warning"
                title="Oturum sonlandırılsın mı?"
                description="Kaydedilmiş turlar korunur; oturum devam ettirilemez. Süren bir adım varsa sonucu kaydedilmez."
                irreversibleNote={false}
                confirmLabel="Sonlandır"
                onConfirm={() => act('cancel')}
              />
            ) : null}
            <Button variant="outline" onClick={copyMd}>
              <ClipboardCopy aria-hidden className="h-4 w-4" /> Kopyala
            </Button>
            <Button variant="outline" onClick={downloadMd}>
              <Download aria-hidden className="h-4 w-4" /> İndir (.md)
            </Button>
            {!s.legacy ? (
              <Button variant="outline" onClick={rerun}>
                <RotateCcw aria-hidden className="h-4 w-4" /> Aynı soruyla yeni oturum
              </Button>
            ) : null}
            {s.status === 'archived' ? (
              <Button variant="outline" onClick={() => act('unarchive').catch((e) => toast.error(errorText(e)))}>
                <ArchiveRestore aria-hidden className="h-4 w-4" /> Arşivden çıkar
              </Button>
            ) : s.status !== 'running' ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Archive aria-hidden className="h-4 w-4" /> Arşivle
                  </Button>
                }
                tone="brand"
                title="Oturum arşivlensin mi?"
                description="Geçmiş listesinden gizlenir, silinmez. Arşiv filtresinden geri alabilirsiniz."
                irreversibleNote={false}
                confirmLabel="Arşivle"
                onConfirm={() => act('archive')}
              />
            ) : null}
          </div>
        </div>
      </SectionCard>

      {s.legacy ? (
        <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-fg">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          Bu kayıt eski konsey motorunun biçiminde. Yalnız okunabilir; devam ettirilemez ve aksiyonları yayınlanamaz.
        </p>
      ) : null}

      {runner.mode === 'error' || (s.lastError && runner.mode !== 'stepping' && s.status === 'running') ? (
        <ErrorState
          variant="section"
          title="Adım tamamlanamadı"
          description={runner.mode === 'error' ? runner.message : s.lastError?.message}
          onRetry={canStep ? () => resume() : undefined}
        />
      ) : null}
      {runner.mode === 'paused' ? (
        <p role="status" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-fg">
          Duraklatıldı. Sunucuda süren adım tamamlanırsa yine kaydedilir; birkaç saniye sonra{' '}
          <button type="button" className="font-medium text-brand underline" onClick={() => onRefetch()}>
            yenileyin
          </button>
          .
        </p>
      ) : null}
      {s.stepInFlight && !stepping ? (
        <p role="status" className="flex items-center gap-2 rounded-md border border-info-border bg-info-subtle px-3 py-2 text-sm text-fg">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Bu oturumun bir adımı başka bir sekmede sürüyor; sayfa kendiliğinden güncellenecek.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Mobilde karar önce: sonuç tartışmadan önemli */}
        <div className="order-2 min-w-0 lg:order-1">
          <Transcript s={s} stepping={stepping ? runner.label : null} />
        </div>
        <aside aria-label="Konsey masası ve karar" className="order-1 min-w-0 space-y-4 lg:order-2">
          <CouncilTable s={s} stepping={stepping} onOpenSettings={onOpenSettings} />
          {s.dataPack !== undefined ? <DataPackCard s={s} /> : null}
          {s.decision ? (
            <DecisionPanel s={s} ref={decisionRef} onPublish={() => setPublishOpen(true)} />
          ) : s.status === 'running' ? (
            <SectionCard title="Karar" density="compact" headingLevel="h3">
              <p className="text-sm text-fg-muted">
                Karar, {s.plannedRounds} tartışma turundan sonra Kaptan&apos;ın sentezinde oluşur. Kazanan görüş, güven ve aksiyonlar burada görünecek.
              </p>
            </SectionCard>
          ) : null}
          {s.published.length ? <PublishedCard s={s} /> : null}
        </aside>
      </div>

      {s.decision && !s.legacy ? (
        <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} session={s} onPublished={onUpdate} />
      ) : null}
    </div>
  );
}

function StepTrack({ s, stepping }: { s: SessionDetail; stepping: boolean }) {
  const steps: Array<{ key: string; label: string; state: 'done' | 'current' | 'todo' }> = [];
  for (let r = 1; r <= s.plannedRounds; r++) {
    steps.push({
      key: `r${r}`,
      label: `Tur ${r}`,
      state: r <= s.completedRounds ? 'done' : s.nextStep === r && stepping ? 'current' : 'todo',
    });
  }
  steps.push({ key: 'syn', label: 'Karar', state: s.decision ? 'done' : s.nextStep === 'synthesis' && stepping ? 'current' : 'todo' });
  return (
    <ol aria-label="Oturum ilerlemesi" className="flex flex-wrap items-center gap-1.5">
      {steps.map((st, i) => (
        <li key={st.key} className="flex items-center gap-1.5">
          <span
            aria-current={st.state === 'current' ? 'step' : undefined}
            className={cn(
              'inline-flex min-h-7 items-center gap-1 rounded-chip px-2.5 text-xs font-medium',
              st.state === 'done' ? TONE_CHIP.success : st.state === 'current' ? TONE_CHIP.info : TONE_CHIP.neutral
            )}
          >
            {st.state === 'done' ? <Check aria-hidden className="h-3 w-3" /> : null}
            {st.state === 'current' ? <Loader2 aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
            {st.label}
            <span className="sr-only">{st.state === 'done' ? ' (tamamlandı)' : st.state === 'current' ? ' (sürüyor)' : ' (bekliyor)'}</span>
          </span>
          {i < steps.length - 1 ? <span aria-hidden className="h-px w-3 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

function CouncilTable({ s, stepping, onOpenSettings }: { s: SessionDetail; stepping: boolean; onOpenSettings: () => void }) {
  const members: CouncilAgent[] = s.config ? [...s.config.specialists, 'Grok'] : (['Harper', 'Benjamin', 'Lucas', 'Grok'] as CouncilAgent[]);
  const active = (a: CouncilAgent) =>
    stepping && (s.nextStep === 'synthesis' ? a === 'Grok' : typeof s.nextStep === 'number');
  return (
    <SectionCard
      title="Konsey masası"
      density="compact"
      headingLevel="h3"
      actions={
        <button type="button" onClick={onOpenSettings} className="min-h-11 rounded-md px-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0">
          Ayarlar
        </button>
      }
    >
      <ul className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:gap-2 lg:overflow-visible">
        {members.map((a) => {
          const p = AGENT_PROFILES[a];
          return (
            <li key={a} className="flex min-w-[9.5rem] items-center gap-2 lg:min-w-0">
              <AgentAvatar agent={a} active={active(a)} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">
                  {p.name} <span className="font-normal text-fg-muted">· {p.role}</span>
                </span>
                <span className="block truncate text-xs text-fg-muted" title={p.focus}>
                  {active(a) ? (s.nextStep === 'synthesis' || a !== 'Grok' ? 'Düşünüyor…' : 'Uzmanları bekliyor') : p.focus}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function DataPackCard({ s }: { s: SessionDetail }) {
  if (s.legacy) return null;
  return (
    <SectionCard density="compact" headingLevel="h3" title="Konseyin gördüğü veri" icon={<Database aria-hidden />}>
      {s.dataPack ? (
        <details className="group text-sm" open>
          <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted sm:min-h-0">
            {s.dataPack.scopeLabel} · son {s.dataPack.windowDays} gün · <RelativeTime iso={s.dataPack.generatedAt} className="ml-1" />
          </summary>
          <dl className="mt-2 grid grid-cols-1 gap-1.5">
            {s.dataPack.metrics.map((m) => (
              <div key={m.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-muted">{m.label}</dt>
                <dd className="font-medium tabular-nums text-fg">
                  {m.value.toLocaleString('tr-TR')}
                  {m.unit && m.unit !== 'adet' ? m.unit : ''}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-fg-muted">Uzmanlara yalnız bu sayılar verildi; başka sayı kullanmaları istemde yasak.</p>
        </details>
      ) : (
        <p className="text-sm text-fg-muted">Bu oturum veri paketi olmadan çalıştı (ayarlarda kapalıydı); tartışma nitel.</p>
      )}
    </SectionCard>
  );
}

const DecisionPanel = ({ s, onPublish, ref }: { s: SessionDetail; onPublish: () => void; ref?: React.Ref<HTMLDivElement> }) => {
  const d = s.decision!;
  const policy = useMotionPolicy();
  const pct = d.confidence != null ? Math.round(d.confidence * 100) : null;
  return (
    <m.div
      ref={ref}
      initial={policy.reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={policy.transition({ duration: DURATION.slow, ease: EASE.emphasized })}
    >
      <SectionCard title="Karar" headingLevel="h3" tone="brand" stripe density="compact">
        <div className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap leading-relaxed text-fg">{d.answer}</p>
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <AgentAvatar agent={d.winner} size="sm" />
              <span className="font-medium text-fg">Öne çıkan görüş: {agentLabel(d.winner)}</span>
            </div>
            <p className="mt-2 text-fg-muted">{d.winnerRationale}</p>
            {pct != null ? (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-fg-muted">
                  <span id={`conf-${s.id}`}>Güven (modelin kendi değerlendirmesi)</span>
                  <span className="tabular-nums">%{pct}</span>
                </div>
                <div
                  role="meter"
                  aria-labelledby={`conf-${s.id}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : null}
          </div>
          {d.dissent.length ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Karşı görüşler ve riskler</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-fg">
                {d.dissent.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Aksiyonlar</h4>
            <ul className="mt-1 space-y-2">
              {d.actions.map((a) => (
                <li key={a.key} className="rounded-md border border-border p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-fg">{a.title}</span>
                    <span className={cn('shrink-0 rounded-chip px-2 py-0.5 text-xs font-medium', a.priority === 'high' ? TONE_CHIP.danger : a.priority === 'medium' ? TONE_CHIP.warning : TONE_CHIP.neutral)}>
                      {PRIORITY_LABEL[a.priority]}
                    </span>
                  </div>
                  {a.detail ? <p className="mt-1 text-fg-muted">{a.detail}</p> : null}
                </li>
              ))}
            </ul>
          </div>
          {!s.legacy && s.status === 'completed' ? (
            <Button className="w-full" onClick={onPublish}>
              <Send aria-hidden className="h-4 w-4" /> Bayi kuyruğuna yayınla…
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </m.div>
  );
};

function PublishedCard({ s }: { s: SessionDetail }) {
  const done = s.published.filter((p) => p.status === 'done').length;
  return (
    <SectionCard title="Yayınlanan aksiyonlar" density="compact" headingLevel="h3" description={`${s.published.length} aksiyondan ${done} tanesi bayi tarafından tamamlandı.`}>
      <ul className="space-y-2 text-sm">
        {s.published.map((p) => (
          <li key={p.actionItemId} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-medium text-fg">{p.title}</span>
              <span className="block text-xs text-fg-muted">
                {p.dealerName} · <RelativeTime iso={p.at} />
                {p.byName ? ` · ${p.byName}` : ''}
              </span>
            </span>
            <span className={cn('shrink-0 rounded-chip px-2 py-0.5 text-xs font-medium', p.status === 'done' ? TONE_CHIP.success : p.status == null ? TONE_CHIP.danger : TONE_CHIP.neutral)}>
              {p.status == null ? 'Kayıt yok' : ACTION_STATUS_LABEL[p.status] ?? p.status}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const KIND_LABEL: Record<SessionMessage['kind'], string | null> = {
  turn: null,
  moderation: 'Tur özeti',
  synthesis: 'Nihai karar',
  legacy: null,
};

function Transcript({ s, stepping }: { s: SessionDetail; stepping: string | null }) {
  const policy = useMotionPolicy();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(false);
  const count = s.messages.length;
  const firstRender = useRef(true);

  const groups = useMemo(() => {
    const map = new Map<number, SessionMessage[]>();
    for (const msg of s.messages) {
      const list = map.get(msg.round) ?? [];
      list.push(msg);
      map.set(msg.round, list);
    }
    return [...map.entries()];
  }, [s.messages]);

  const toBottom = useCallback(
    (smooth: boolean) => {
      const el = boxRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !policy.reduce ? 'smooth' : 'auto' });
    },
    [policy.reduce]
  );

  // Yalnız iç kutu kaydırılır (pencere değil); kullanıcı yukarıdaysa zorla çekilmez.
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      toBottom(false);
      return;
    }
    if (atBottom) toBottom(true);
    else setUnseen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, stepping]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setAtBottom(bottom);
    if (bottom) setUnseen(false);
  };

  return (
    <SectionCard title="Tartışma" headingLevel="h3" density="flush" description={count ? `${count} mesaj` : undefined}>
      <div className="relative">
        <div
          ref={boxRef}
          onScroll={onScroll}
          role="log"
          aria-label="Konsey tartışması"
          aria-live="off"
          tabIndex={0}
          className="max-h-[70vh] min-h-[12rem] overflow-y-auto px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
          {count === 0 && !stepping ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              Henüz konuşma yok. {s.status === 'running' ? '“Konseyi başlat” ile ilk turu çalıştırın.' : ''}
            </p>
          ) : null}
          {groups.map(([round, msgs]) => (
            <section key={round} aria-label={msgs[0]?.kind === 'synthesis' ? 'Nihai karar' : s.legacy ? `Bölüm ${round}` : `Tur ${round}`} className="mb-4">
              <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-border bg-surface-1/95 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-fg-muted backdrop-blur-sm">
                {msgs[0]?.kind === 'synthesis' ? 'Nihai karar' : s.legacy ? `Bölüm ${round}` : `Tur ${round}`}
              </div>
              <ul className="space-y-3">
                {msgs.map((msg) => (
                  <m.li
                    key={msg.id}
                    initial={policy.reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={policy.transition({ duration: DURATION.base, ease: EASE.standard })}
                    className="flex gap-3"
                  >
                    <AgentAvatar agent={msg.agent} size="sm" />
                    <div className={cn('min-w-0 flex-1 rounded-md px-3 py-2', msg.kind === 'turn' || msg.kind === 'legacy' ? 'bg-surface-muted' : 'border border-border')}>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold text-fg">{agentLabel(msg.agent)}</span>
                        {KIND_LABEL[msg.kind] ? <span className="text-fg-muted">{KIND_LABEL[msg.kind]}</span> : null}
                        {msg.model ? (
                          <span className="text-fg-muted" title="Yanıt veren model ve süre">
                            {msg.model}
                            {msg.latencyMs != null ? ` · ${(msg.latencyMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : ''}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg">
                        {msg.kind === 'synthesis' ? 'Karar paneline yazıldı. ' : ''}
                        {msg.kind === 'synthesis' ? <span className="text-fg-muted">{msg.content.slice(0, 220)}{msg.content.length > 220 ? '…' : ''}</span> : msg.content}
                      </p>
                    </div>
                  </m.li>
                ))}
              </ul>
            </section>
          ))}
          {stepping ? (
            <div role="status" className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-fg-muted">
              <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
              {stepping}
            </div>
          ) : null}
        </div>
        {unseen && !atBottom ? (
          <button
            type="button"
            onClick={() => {
              toBottom(true);
              setUnseen(false);
            }}
            className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1 rounded-full bg-brand px-4 text-sm font-medium text-brand-fg shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <ArrowDown aria-hidden className="h-4 w-4" /> Yeni mesajlar
          </button>
        ) : null}
      </div>
      {!s.legacy && s.status === 'running' && !stepping && count > 0 ? (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-muted">
          <RefreshCw aria-hidden className="mr-1 inline h-3 w-3" />
          Oturum kayıtlı: sayfayı kapatsanız da kaldığı yerden “Devam et” ile sürer.
        </div>
      ) : null}
    </SectionCard>
  );
}
