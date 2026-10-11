'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eraser,
  FileSearch,
  FileText,
  Gavel,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Timer,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ConfirmAction,
  EmptyState,
  InlineError,
  QueryState,
  SectionCard,
  SkeletonDetail,
  StatTile,
  TONE_CALLOUT,
  TONE_CHIP,
  type Tone,
} from '@/components/states';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion/variants';
import {
  DSR_EVENT_LABELS,
  DSR_STATUS_LABELS,
  DSR_TYPE_LABELS,
  MIN_REASON_LENGTH,
  type DsrCommand,
  type DsrEventType,
  type DsrStatus,
  type DsrType,
} from '@/lib/dsr-workflow';
import {
  ApiRequestError,
  fetchDsrDetail,
  fetchDsrList,
  runDsrCommand,
  type DsrDetailResponse,
  type DsrListResponse,
  type DsrListRow,
  type DsrListStatus,
} from './api';
import { ManualRequestDialog } from './manual-request-dialog';
import { AdminKvkkText, useAdminKvkkCopy } from '../copy';

const STATUS_TABS: Array<{ key: DsrListStatus; label: string }> = [
  { key: 'open', label: 'Açık' },
  { key: 'overdue', label: 'Geciken' },
  { key: 'due_soon', label: '7 gün içinde' },
  { key: 'completed', label: 'Tamamlanan' },
  { key: 'rejected', label: 'Reddedilen' },
  { key: 'all', label: 'Tümü' },
];

const TYPE_ICON: Record<DsrType, typeof FileText> = {
  access: FileSearch,
  deletion: UserX,
  rectification: PenLine,
  objection: Gavel,
};

const STATUS_TONE: Record<DsrStatus, Tone> = {
  received: 'info',
  in_review: 'warning',
  completed: 'success',
  rejected: 'neutral',
};

function typeLabel(t: string): string {
  return (DSR_TYPE_LABELS as Record<string, string>)[t] ?? t;
}
function statusLabel(s: string): string {
  return (DSR_STATUS_LABELS as Record<string, string>)[s] ?? s;
}
function statusTone(s: string): Tone {
  return (STATUS_TONE as Record<string, Tone>)[s] ?? 'neutral';
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });

function Chip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[tone], className)}>
      {children}
    </span>
  );
}

/** Kalan gün rozeti: > 10 yeşil, 3–10 sarı, < 3 / gecikmiş kırmızı. */
function DueBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft == null) return null;
  const tone: Tone = daysLeft < 0 ? 'danger' : daysLeft < 3 ? 'danger' : daysLeft <= 10 ? 'warning' : 'success';
  const text = daysLeft < 0 ? `${Math.abs(daysLeft)} gün gecikti` : daysLeft === 0 ? 'Bugün son gün' : `${daysLeft} gün kaldı`;
  return (
    <Chip tone={tone}>
      <Timer className="h-3 w-3" aria-hidden />
      {text}
    </Chip>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ───────────────────────────── Gerekçe diyaloğu ─────────────────────────────

type ReasonCommand = Extract<DsrCommand, 'reject' | 'reopen' | 'note' | 'rectify' | 'resolve_objection' | 'confirm_delivery'>;

const REASON_COPY: Record<ReasonCommand, { title: string; description: string; label: string; cta: string; tone: Tone }> = {
  reject: {
    title: 'Talebi reddet',
    description: 'KVKK m.13 gereği ret gerekçeli olmalıdır. Gerekçe başvurana e-postayla iletilir.',
    label: 'Ret gerekçesi',
    cta: 'Reddet ve bildir',
    tone: 'danger',
  },
  reopen: {
    title: 'Talebi yeniden aç',
    description: 'Yeniden açılan talep eski kanıtla kapatılamaz; yürütme yeniden yapılmalıdır.',
    label: 'Yeniden açma gerekçesi',
    cta: 'Yeniden aç',
    tone: 'warning',
  },
  note: {
    title: 'Dahili not ekle',
    description: 'Not kanıt zincirine eklenir ve yalnız yöneticiler görür.',
    label: 'Not',
    cta: 'Notu ekle',
    tone: 'brand',
  },
  rectify: {
    title: 'Düzeltmeyi kaydet',
    description: 'Hangi bilginin neyle düzeltildiğini yazın. Özet başvurana iletilir ve talep kapanır.',
    label: 'Yapılan düzeltme',
    cta: 'Kaydet ve kapat',
    tone: 'brand',
  },
  resolve_objection: {
    title: 'İtirazı sonuçlandır',
    description: 'Kararı ve gerekçesini yazın. Sonuç başvurana iletilir ve talep kapanır.',
    label: 'Karar ve gerekçe',
    cta: 'Sonuçlandır',
    tone: 'brand',
  },
  confirm_delivery: {
    title: 'Teslimi onayla',
    description: 'Paket başvurana başka bir kanaldan iletildiyse kanalı ve tarihi yazın. Talep kanıtıyla kapanır.',
    label: 'Teslim bilgisi',
    cta: 'Teslimi kaydet',
    tone: 'brand',
  },
};

function ReasonDialog({
  command,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  command: ReasonCommand | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (command) setText('');
  }, [command]);
  if (!command) return null;
  const copy = REASON_COPY[command];
  const tooShort = text.trim().length < MIN_REASON_LENGTH;
  return (
    <Dialog open onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="dsr-reason">{copy.label}</Label>
          <Textarea
            id="dsr-reason"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            aria-describedby="dsr-reason-hint"
          />
          <p id="dsr-reason-hint" className="text-xs text-fg-muted">
            En az {MIN_REASON_LENGTH} karakter · {text.trim().length}/2000
          </p>
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button
            type="button"
            variant={copy.tone === 'danger' ? 'destructive' : 'default'}
            disabled={pending || tooShort}
            onClick={() => onSubmit(text.trim())}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Ayrıntı paneli ─────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  feedbacks: 'Geri bildirimler',
  consumptionReviews: 'Tüketim değerlendirmeleri',
  consumptions: 'Tüketimler',
  qraChatLogs: 'QRA sohbetleri',
  notifications: 'Bildirimler',
  pushDevices: 'Bildirim cihazları',
  pushNotifications: 'Anlık bildirimler',
  auditTrail: 'Denetim kayıtları',
  pointsLedger: 'Puan hareketleri',
  analyticsEvents: 'Analitik olayları',
  uploads: 'Yüklenen dosyalar',
  donations: 'Bağışlar',
};

function EvidenceChecklist({ detail }: { detail: DsrDetailResponse }) {
  const r = detail.request;
  if (r.status === 'completed') {
    return (
      <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', TONE_CALLOUT.success)}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <span><AdminKvkkText k="closedFulfilled" /></span>
      </div>
    );
  }
  if (r.status === 'rejected') {
    return (
      <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', TONE_CALLOUT.neutral)}>
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span><AdminKvkkText k="closedRejected" /></span>
      </div>
    );
  }
  return (
    <div className={cn('rounded-xl border p-3 text-sm', TONE_CALLOUT.info)}>
      <p className="font-medium"><AdminKvkkText k="proofRequired" /></p>
      <ul className="mt-2 space-y-1">
        {detail.missingEvidence.length === 0 ? (
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Kanıt tamam
          </li>
        ) : (
          detail.missingEvidence.map((e) => (
            <li key={e} className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" aria-hidden />
              {DSR_EVENT_LABELS[e as DsrEventType] ?? e}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Timeline({ events }: { events: DsrDetailResponse['events'] }) {
  if (events.length === 0) {
    return <p className="text-sm text-fg-muted"><AdminKvkkText k="noSteps" /></p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e) => {
        const reason =
          (typeof e.detail?.reason === 'string' && e.detail.reason) ||
          (typeof e.detail?.summary === 'string' && e.detail.summary) ||
          (typeof e.detail?.note === 'string' && e.detail.note) ||
          null;
        const counts = e.detail?.counts && typeof e.detail.counts === 'object' ? (e.detail.counts as Record<string, number>) : null;
        const total = counts ? Object.values(counts).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) : null;
        return (
          <li key={e.id} className="relative">
            <span aria-hidden className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-surface-1" />
            <p className="text-sm font-medium text-fg">{e.label}</p>
            <p className="text-xs text-fg-muted">
              {dateTimeFmt.format(new Date(e.createdAt))}
              {' · '}
              {e.actor ? e.actor.name || e.actor.email || 'Yönetici' : 'Sistem'}
            </p>
            {reason ? <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{reason}</p> : null}
            {total != null ? <p className="mt-1 text-xs text-fg-muted">{total} kayıt etkilendi</p> : null}
            {typeof e.detail?.digest === 'string' ? (
              <p className="mt-1 font-mono text-[11px] text-fg-subtle" title="Paket içerik özeti (SHA-256)">
                özet {String(e.detail.digest).slice(0, 16)}…
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DetailPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [withInventory, setWithInventory] = useState(false);
  const [reasonCmd, setReasonCmd] = useState<ReasonCommand | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    setWithInventory(false);
    setReasonCmd(null);
  }, [id]);

  const detail = useQuery({
    queryKey: ['admin-dsr', 'detail', id, withInventory],
    queryFn: () => fetchDsrDetail(id!, withInventory),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (v: { action: DsrCommand; reason?: string; confirmEmail?: string }) =>
      runDsrCommand(id!, v.action, { reason: v.reason, confirmEmail: v.confirmEmail }),
    onSuccess: (res) => {
      if ('downloaded' in res) toast.success('Veri paketi indirildi; indirme kanıt zincirine yazıldı.');
      else if (res.message) (res.completed === false ? toast.warning : toast.success)(res.message);
      setReasonCmd(null);
      setReasonError(null);
      void qc.invalidateQueries({ queryKey: ['admin-dsr'] });
    },
  });

  const run = async (action: DsrCommand, input: { reason?: string; confirmEmail?: string } = {}) => {
    try {
      await mutation.mutateAsync({ action, ...input });
    } catch (e) {
      const msg = e instanceof ApiRequestError || e instanceof Error ? e.message : 'İşlem tamamlanamadı.';
      if (reasonCmd) setReasonError(msg);
      else toast.error(msg);
      throw e;
    }
  };

  const d = detail.data;
  const r = d?.request;
  const allowed = new Set(d?.allowedCommands ?? []);
  const pending = mutation.isPending;
  const Icon = r ? (TYPE_ICON as Record<string, typeof FileText>)[r.type] ?? FileText : FileText;

  return (
    <Sheet open={!!id} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <span className={cn('grid h-9 w-9 place-items-center rounded-xl', TONE_CHIP.brand)}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <SheetTitle>{r ? typeLabel(r.type) : 'KVKK talebi'}</SheetTitle>
          </div>
          <SheetDescription>
            {r ? `Başvuru: ${dateTimeFmt.format(new Date(r.createdAt))} · Son tarih: ${dateFmt.format(new Date(r.dueAt))}` : 'Yükleniyor…'}
          </SheetDescription>
          {r ? (
            <div className="flex flex-wrap gap-2">
              <Chip tone={statusTone(r.status)}>{statusLabel(r.status)}</Chip>
              <DueBadge daysLeft={r.daysLeft} />
            </div>
          ) : null}
        </SheetHeader>

        <div className="mt-6 space-y-6" aria-busy={detail.isLoading}>
          {detail.isLoading ? (
            <SkeletonDetail />
          ) : detail.isError ? (
            <InlineError variant="banner" onRetry={() => void detail.refetch()}>
              {detail.error instanceof Error ? detail.error.message : 'Talep yüklenemedi.'}
            </InlineError>
          ) : d && r ? (
            <>
              <section aria-labelledby="dsr-applicant" className="space-y-2">
                <h3 id="dsr-applicant" className="text-sm font-semibold text-fg">
                  Başvuran
                </h3>
                <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-fg-muted"><AdminKvkkText k="applicationEmail" /></dt>
                  <dd className="break-all text-fg">{r.email}</dd>
                  <dt className="text-fg-muted">Hesap</dt>
                  <dd className="break-all text-fg">
                    {r.account ? (
                      r.account.anonymized ? (
                        <Chip tone="neutral"><AdminKvkkText k="anonymized" /></Chip>
                      ) : (
                        <>
                          {r.account.email} · {r.account.role}
                        </>
                      )
                    ) : (
                      <Chip tone="warning"><AdminKvkkText k="notLinked" /></Chip>
                    )}
                  </dd>
                </dl>
                {r.account?.emailMismatch ? (
                  <p className={cn('flex items-start gap-2 rounded-lg border p-2 text-xs', TONE_CALLOUT.warning)}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Başvuru e-postası hesabın güncel e-postasıyla eşleşmiyor; kimliği doğrulayın.
                  </p>
                ) : null}
                {r.message ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-fg">{r.message}</p>
                ) : null}
              </section>

              <EvidenceChecklist detail={d} />

              {/* Türüne özgü birincil eylem */}
              <section aria-labelledby="dsr-actions" className="space-y-3">
                <h3 id="dsr-actions" className="text-sm font-semibold text-fg">
                  Yürütme
                </h3>
                <div className="flex flex-wrap gap-2">
                  {allowed.has('review') ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => void run('review').catch(() => {})}>
                      İncelemeye al
                    </Button>
                  ) : null}
                  {allowed.has('fulfill_access') ? (
                    <Button size="sm" disabled={pending} onClick={() => void run('fulfill_access').catch(() => {})}>
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                      Paketi hazırla ve bildir
                    </Button>
                  ) : null}
                  {allowed.has('confirm_delivery') ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => setReasonCmd('confirm_delivery')}>
                      Teslimi onayla
                    </Button>
                  ) : null}
                  {allowed.has('download_export') ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => void run('download_export').catch(() => {})}>
                      <Download className="h-4 w-4" aria-hidden />
                      Paketi indir (denetlenir)
                    </Button>
                  ) : null}
                  {allowed.has('erase') ? (
                    <ConfirmAction
                      tone="danger"
                      trigger={
                        <Button variant="destructive" size="sm" disabled={pending}>
                          <Eraser className="h-4 w-4" aria-hidden />
                          Sil ve kapat
                        </Button>
                      }
                      title="Kişisel veriler kalıcı olarak silinsin mi?"
                      description="Hesap anonimleştirilir, açık oturumlar kapanır, sohbetler, bildirim cihazları, yorum metinleri ve diğer kişisel kayıtlar silinir. Puan ve istatistik kimliksiz kalır."
                      loadImpact={async () => {
                        const res = await fetchDsrDetail(r.id, true);
                        const inv = res.inventory ?? {};
                        const items = Object.entries(inv)
                          .filter(([, n]) => n > 0)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 8)
                          .map(([k, n]) => ({ label: SECTION_LABELS[k] ?? k, value: n, emphasis: true }));
                        return { items: items.length ? items : [{ label: 'Kişisel kayıt', value: 0 }] };
                      }}
                      confirmPhrase={r.email}
                      confirmLabel="Sil ve kapat"
                      onConfirm={() => run('erase', { confirmEmail: r.email })}
                    />
                  ) : null}
                  {allowed.has('rectify') ? (
                    <Button size="sm" disabled={pending} onClick={() => setReasonCmd('rectify')}>
                      <PenLine className="h-4 w-4" aria-hidden />
                      Düzeltmeyi kaydet
                    </Button>
                  ) : null}
                  {allowed.has('resolve_objection') ? (
                    <Button size="sm" disabled={pending} onClick={() => setReasonCmd('resolve_objection')}>
                      <Gavel className="h-4 w-4" aria-hidden />
                      İtirazı sonuçlandır
                    </Button>
                  ) : null}
                  {allowed.has('reject') ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReasonCmd('reject')}>
                      Reddet
                    </Button>
                  ) : null}
                  {allowed.has('reopen') ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReasonCmd('reopen')}>
                      Yeniden aç
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReasonCmd('note')}>
                    Not ekle
                  </Button>
                </div>
                {r.type === 'rectification' ? (
                  <p className="text-xs text-fg-muted">
                    Düzeltmeyi kullanıcı profilinde yaptıktan sonra yapılan değişikliği buraya kaydedin.
                  </p>
                ) : null}
              </section>

              <section aria-labelledby="dsr-inventory" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="dsr-inventory" className="text-sm font-semibold text-fg">
                    Veri envanteri
                  </h3>
                  {!withInventory && r.userId && !r.account?.anonymized ? (
                    <Button variant="ghost" size="sm" onClick={() => setWithInventory(true)}>
                      Kayıtları say
                    </Button>
                  ) : null}
                </div>
                {d.inventory ? (
                  <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    {Object.entries(d.inventory)
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => (
                        <li key={k} className="rounded-lg bg-surface-muted px-3 py-2">
                          <p className="text-xs text-fg-muted">{SECTION_LABELS[k] ?? k}</p>
                          <p className="font-semibold tabular-nums text-fg">{n}</p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-muted">
                    Sayılar kişisel veri içermez. Tam paket yalnız "Paketi indir" ile ve denetlenerek alınır.
                  </p>
                )}
              </section>

              <section aria-labelledby="dsr-timeline" className="space-y-3">
                <h3 id="dsr-timeline" className="text-sm font-semibold text-fg">
                  Kanıt zinciri
                </h3>
                <Timeline events={d.events} />
              </section>
            </>
          ) : null}
        </div>

        <ReasonDialog
          command={reasonCmd}
          pending={pending}
          error={reasonError}
          onClose={() => {
            setReasonCmd(null);
            setReasonError(null);
          }}
          onSubmit={(reason) => void run(reasonCmd!, { reason }).catch(() => {})}
        />
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────── Liste ─────────────────────────────

function RequestRow({ row, onOpen }: { row: DsrListRow; onOpen: (id: string) => void }) {
  const Icon = (TYPE_ICON as Record<string, typeof FileText>)[row.type] ?? FileText;
  return (
    <Motion.li variants={fadeUp} initial="hidden" animate="visible" exit="exit" layout="position">
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-muted/60 focus-visible:bg-surface-muted focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
      >
        <span className={cn('hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid', TONE_CHIP.brand)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{typeLabel(row.type)}</span>
            <Chip tone={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
            <DueBadge daysLeft={row.daysLeft} />
            {row.account?.emailMismatch ? (
              <Chip tone="warning">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                E-posta uyuşmuyor
              </Chip>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">
            {row.email} · {dateFmt.format(new Date(row.createdAt))}
            {row.lastEvent ? ` · Son adım: ${row.lastEvent.label}` : ''}
          </span>
        </span>
      </button>
    </Motion.li>
  );
}

const STATUS_KEYS = new Set<DsrListStatus>(STATUS_TABS.map((t) => t.key));

/** Filtreler ve açık talep URL'de (?status=&type=&q=&id=) — paylaşılabilir ve yenilemede kalır. */
function useRequestsUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawStatus = sp.get('status') as DsrListStatus | null;
  const status: DsrListStatus = rawStatus && STATUS_KEYS.has(rawStatus) ? rawStatus : 'open';
  const rawType = sp.get('type') ?? '';
  const type = (Object.keys(DSR_TYPE_LABELS) as string[]).includes(rawType) ? rawType : '';
  const q = sp.get('q') ?? '';
  const id = sp.get('id');
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!next.get('tab')) next.set('tab', 'talepler');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname]
  );
  return { status, type, q, id, set };
}

export function RequestsPanel() {
  const tx = useAdminKvkkCopy();
  const url = useRequestsUrlState();
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search.trim(), 300);
  const [manualOpen, setManualOpen] = useState(false);
  const { status, type, set } = url;

  useEffect(() => {
    if (debounced !== url.q) set({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useInfiniteQuery({
    queryKey: ['admin-dsr', 'list', status, type, url.q],
    queryFn: ({ pageParam }) => fetchDsrList({ status, type: type || undefined, q: url.q || undefined, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DsrListResponse) => last.nextCursor,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.requests) ?? [], [list.data]);
  const stats = list.data?.pages[0]?.stats;
  const listLike = { ...list, data: list.data ? { requests: rows } : undefined };
  const unfiltered = status === 'open' && !type && !url.q;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Açık talep" value={stats?.open} loading={!stats} icon={<FileText />} tone="brand" />
        <StatTile
          label="Süresi geçen"
          value={stats?.overdue}
          loading={!stats}
          icon={<AlertTriangle />}
          tone={stats && stats.overdue > 0 ? 'danger' : 'neutral'}
        />
        <StatTile label="7 gün içinde dolacak" value={stats?.dueSoon} loading={!stats} icon={<Timer />} tone="warning" />
        <StatTile label="Son 30 günde kapanan" value={stats?.completed30} loading={!stats} icon={<CheckCircle2 />} tone="success" />
        <StatTile
          label="Ortalama yanıt"
          value={stats?.avgResponseDays ?? '—'}
          unit={stats?.avgResponseDays != null ? 'gün' : undefined}
          loading={!stats}
          icon={<Clock />}
          hint="Son 90 gün"
        />
      </div>

      <SectionCard
        title="Talep kuyruğu"
        description="Satıra dokunarak ayrıntıyı, kanıt zincirini ve türüne özgü işlemi açın. Hiçbir talep elle “Tamamlandı” yapılamaz."
        density="flush"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="E-posta ara"
                aria-label="Başvuru e-postasında ara"
                className="h-11 pl-8 sm:h-9 sm:w-56"
              />
            </div>
            <select
              value={type}
              onChange={(e) => set({ type: e.target.value || null })}
              aria-label="Talep türü"
              className="h-11 rounded-md border border-border bg-background px-2 text-sm text-fg sm:h-9"
            >
              <option value="">{tx.allTypes}</option>
              {(Object.keys(DSR_TYPE_LABELS) as DsrType[]).map((t) => (
                <option key={t} value={t}>
                  {DSR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 flex-1 sm:min-h-9"
                onClick={() => void list.refetch()}
                disabled={list.isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', list.isFetching && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                Yenile
              </Button>
              <Button size="sm" className="min-h-11 flex-1 sm:min-h-9" onClick={() => setManualOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Talep ekle
              </Button>
            </div>
          </div>
        }
      >
        <div role="tablist" aria-label="Durum" className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
          {STATUS_TABS.map((t) => {
            const count =
              t.key === 'open' ? stats?.open : t.key === 'overdue' ? stats?.overdue : t.key === 'due_soon' ? stats?.dueSoon : undefined;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={status === t.key}
                onClick={() => set({ status: t.key === 'open' ? null : t.key })}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
                  status === t.key ? 'bg-brand-subtle font-medium text-brand' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                )}
              >
                {t.label}
                {typeof count === 'number' ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      t.key === 'overdue' && count > 0 ? 'bg-danger-subtle text-danger' : 'bg-surface-muted text-fg-muted'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <QueryState
          query={listLike}
          skeleton="list"
          isEmpty={(d) => d.requests.length === 0}
          empty={
            <EmptyState
              compact
              icon={ShieldCheck}
              title={unfiltered ? 'Açık talep yok' : 'Bu filtrede kayıt yok'}
              description={
                unfiltered
                  ? 'Başvurular müşteri ayarlarındaki Gizlilik bölümünden gelir. E-postayla gelen başvuruyu “Talep ekle” ile kuyruğa alın.'
                  : 'Filtreleri değiştirerek diğer talepleri görebilirsiniz.'
              }
            />
          }
          error={{ title: 'Talepler yüklenemedi' }}
        >
          {() => (
            <>
              <ul className="divide-y divide-border" aria-busy={list.isFetching}>
                <AnimatePresence initial={false}>
                  {rows.map((row) => (
                    <RequestRow key={row.id} row={row} onOpen={(id) => set({ id })} />
                  ))}
                </AnimatePresence>
              </ul>
              {list.hasNextPage ? (
                <div className="flex justify-center border-t border-border p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => void list.fetchNextPage()}
                    disabled={list.isFetchingNextPage}
                  >
                    {list.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Daha fazla yükle
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </QueryState>
      </SectionCard>

      <DetailPanel id={url.id} onClose={() => set({ id: null })} />
      <ManualRequestDialog open={manualOpen} onClose={() => setManualOpen(false)} onCreated={(id) => set({ id, status: null })} />
    </div>
  );
}
