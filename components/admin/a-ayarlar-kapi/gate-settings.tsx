'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSavedFlash } from './shared';
import { KeyRound, Unlock, LogOut, Rocket, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ConfirmAction,
  EmptyState,
  InlineError,
  PageHeader,
  QueryState,
  SectionCard,
  StatTile,
} from '@/components/states';
import { cn } from '@/lib/utils';
import { AdminAyarlarKapiText } from './copy';

/**
 * ADMIN ERİŞİM GÜVENLİĞİ — "Boyutlar Arası Geçit" ayarı (P0-01).
 *
 * Cevap bu ekrana HİÇ GELMEZ (sunucu yalnız soru + durum döndürür). Cevap yalnız yazılır;
 * değiştirmek için mevcut cevap gerekir ve değişince bütün yöneticilerin kapı oturumları
 * düşer. Ayrıca: toplu oturum sonlandırma, kilitli hesapların kilidini kaldırma, son kapı
 * olayları (audit) ve kilit politikası.
 */

type GateUser = { id: string; name: string | null; email: string | null } | null;
type GateEvent = {
  id: string;
  action: string;
  createdAt: string;
  ip: string | null;
  targetUserId: string | null;
  user: GateUser;
};
type GateStatus = {
  gate: {
    question: string;
    isDefaultAnswer: boolean;
    cfgVer: number;
    updatedAt: string | null;
    updatedBy: GateUser;
  };
  policy: {
    shortMaxFailures: number;
    shortLockMinutes: number;
    longMaxFailures: number;
    longLockHours: number;
    sessionHours: number;
  };
  stats: {
    failures24h: number;
    passes24h: number;
    lockedUsers: Array<{ userId: string; name: string | null; email: string | null; lockedUntil: string }>;
  };
  events: GateEvent[];
};

class GateApiError extends Error {
  status: number;
  code?: string;
  details?: Array<{ path: string; message: string }>;
  constructor(message: string, status: number, code?: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function goToGate() {
  window.location.href = `/admin-gate?from=${encodeURIComponent('/admin/gate-settings')}`;
}

async function gateFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new GateApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', 0);
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (res.status === 403 && data?.code === 'ADMIN_GATE_REQUIRED') {
    goToGate();
    throw new GateApiError('Kapı oturumunuz sona erdi. Geçide yönlendiriliyorsunuz.', 403, data.code);
  }
  if (!res.ok || !data || data.success === false) {
    throw new GateApiError(
      (data && typeof data.error === 'string' && data.error) || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
      res.status,
      data?.code,
      Array.isArray(data?.details) ? data.details : undefined
    );
  }
  return data as T;
}

const ACTION_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  ADMIN_GATE_PASSED: { label: 'Geçti', tone: 'success' },
  ADMIN_GATE_FAILED: { label: 'Yanlış deneme', tone: 'warning' },
  ADMIN_GATE_LOCKED: { label: 'Kilitlendi', tone: 'danger' },
  ADMIN_GATE_UNLOCKED: { label: 'Kilit kaldırıldı', tone: 'info' },
  UPDATE_ADMIN_GATE: { label: 'Ayar değişti', tone: 'info' },
  ADMIN_GATE_REVOKE_ALL: { label: 'Tüm oturumlar sonlandırıldı', tone: 'danger' },
};

/**
 * "Tüm kapı kayıtları" denetim merkezinde EYLEM ile süzülür: ayar değişikliği (`UPDATE_ADMIN_GATE`)
 * `Settings` varlığına yazıldığından `varlik=AdminGate` süzgeci onu (ve listedeki "Ayar değişti"
 * satırlarını) kaçırıyordu.
 */
export const GATE_AUDIT_HREF = `/admin/audit?eylem=${Object.keys(ACTION_LABELS).join(',')}`;

const CHIP: Record<'success' | 'danger' | 'warning' | 'info' | 'neutral', string> = {
  success: 'bg-success-subtle text-success ring-success-border',
  danger: 'bg-danger-subtle text-danger ring-danger-border',
  warning: 'bg-warning-subtle text-warning ring-warning-border',
  info: 'bg-info-subtle text-info ring-info-border',
  neutral: 'bg-surface-muted text-fg-muted ring-border',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function personLabel(u: GateUser | { name: string | null; email: string | null }): string {
  if (!u) return 'Bilinmeyen hesap';
  return u.name || u.email || 'Bilinmeyen hesap';
}

const QUESTION_MAX = 200;
const QUESTION_MIN = 5;

export function GateSettings() {
  const query = useQuery({
    queryKey: ['admin-gate-status'],
    queryFn: () => gateFetch<GateStatus & { success: true }>('/api/admin/settings/admin-gate'),
    retry: (count, err) => !(err instanceof GateApiError && [401, 403].includes(err.status)) && count < 2,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Rocket aria-hidden />}
        eyebrow="Yönetici erişim güvenliği"
        title="Gizli Kapı"
        description="Admin paneline girerken sorulan gizli soru. ADMIN rolü tek başına yetmez; kapı hem sayfalarda hem bütün yönetici API uçlarında zorunludur."
        back={{ href: '/admin/settings?bolum=guvenlik', label: 'Ayarlar · Güvenlik ve kapı' }}
      />
      <QueryState query={query} skeleton="form" loadingLabel="Gizli kapı ayarları yükleniyor">
        {(data) => <GateSettingsBody data={data} onChanged={() => query.refetch()} />}
      </QueryState>
    </div>
  );
}

function GateSettingsBody({ data, onChanged }: { data: GateStatus; onChanged: () => unknown }) {
  const { gate, policy, stats, events } = data;
  const queryClient = useQueryClient();
  const ids = {
    question: useId(),
    questionHelp: useId(),
    current: useId(),
    currentErr: useId(),
    next: useId(),
    confirm: useId(),
    answerErr: useId(),
  };

  const [question, setQuestion] = useState(gate.question);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [confirmAnswer, setConfirmAnswer] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, flashSaved] = useSavedFlash();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sunucudan yeni sürüm gelince (başka admin değiştirdi / kaydettik) soruyu tazele.
  useEffect(() => {
    setQuestion(gate.question);
  }, [gate.question, gate.cfgVer]);

  const digitOnly = (v: string) => v.replace(/[^0-9]/g, '').slice(-1);
  const questionTrim = question.trim();
  const questionInvalid = questionTrim.length < QUESTION_MIN;
  const answerChanging = newAnswer.length > 0 || confirmAnswer.length > 0;
  const answerMismatch = answerChanging && newAnswer !== confirmAnswer;
  const dirty = questionTrim !== gate.question || answerChanging;
  const canSave = dirty && !questionInvalid && !answerMismatch && (!answerChanging || (newAnswer.length === 1 && currentAnswer.length === 1));

  const save = async () => {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await gateFetch<{ success: true; answerChanged: boolean }>('/api/admin/settings/admin-gate', {
        method: 'PUT',
        body: JSON.stringify({
          question: questionTrim,
          ...(answerChanging ? { newAnswer, currentAnswer } : {}),
          expectedCfgVer: gate.cfgVer,
        }),
      });
      setCurrentAnswer('');
      setNewAnswer('');
      setConfirmAnswer('');
      flashSaved();
      toast.success(
        res.answerChanged
          ? 'Cevap değişti. Diğer bütün yöneticiler kapıdan yeniden geçecek; sizin oturumunuz yenilendi.'
          : 'Gizli soru güncellendi.'
      );
      await queryClient.invalidateQueries({ queryKey: ['admin-gate-status'] });
    } catch (e) {
      const err = e instanceof GateApiError ? e : new GateApiError('Kaydedilemedi.', 0);
      const map: Record<string, string> = {};
      for (const d of err.details ?? []) if (d.path) map[d.path] = d.message;
      setFieldErrors(map);
      setFormError(err.message);
      if (err.code === 'VERSION_CONFLICT') onChanged();
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    if (answerChanging) setConfirmOpen(true);
    else void save().catch(() => undefined);
  };

  const revokeAll = async () => {
    await gateFetch('/api/admin/settings/admin-gate/revoke', { method: 'POST', body: '{}' });
    toast.success('Bütün kapı oturumları sonlandırıldı. Geçide yönlendiriliyorsunuz.');
    setTimeout(goToGate, 700);
  };

  const unlock = async (userId: string) => {
    await gateFetch('/api/admin/settings/admin-gate/unlock', { method: 'POST', body: JSON.stringify({ userId }) });
    toast.success('Kilit kaldırıldı.');
    onChanged();
  };

  return (
    <div className="space-y-6">
      {gate.isDefaultAnswer && (
        <InlineError variant="banner" tone="danger">
          Cevap hâlâ varsayılan değerde. Bu değer kaynak kodda yazılı olduğu için kapıyı fiilen korumaz; aşağıdan hemen yeni bir cevap belirleyin.
        </InlineError>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Son 24 saatte geçiş" value={stats.passes24h} tone="success" icon={<ShieldCheck aria-hidden />} />
        <StatTile
          label="Son 24 saatte yanlış deneme"
          value={stats.failures24h}
          tone={stats.failures24h > 0 ? 'warning' : 'neutral'}
          icon={<ShieldAlert aria-hidden />}
        />
        <StatTile
          label="Kilitli hesap"
          value={stats.lockedUsers.length}
          tone={stats.lockedUsers.length > 0 ? 'danger' : 'neutral'}
          icon={<KeyRound aria-hidden />}
        />
        <StatTile
          label="Yapılandırma sürümü"
          value={gate.cfgVer}
          hint={gate.updatedAt ? `${formatDate(gate.updatedAt)} · ${personLabel(gate.updatedBy)}` : 'Hiç değiştirilmedi'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          title="Soru ve cevap"
          description="Cevap hiçbir ekranda gösterilmez ve geri okunamaz; yalnız yeni cevap yazılabilir."
          icon={<KeyRound aria-hidden />}
        >
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor={ids.question}>Gizli soru</Label>
              <Input
                id={ids.question}
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
                maxLength={QUESTION_MAX}
                aria-invalid={questionInvalid || !!fieldErrors.question}
                aria-describedby={ids.questionHelp}
                placeholder="Örn: Evrende bize göre kaç boyut gizlidir?"
              />
              <p id={ids.questionHelp} className="qx-small flex justify-between gap-3 text-fg-muted">
                <span><AdminAyarlarKapiText k="questionHint" /></span>
                <span className="tabular-nums">
                  {question.length}/{QUESTION_MAX}
                </span>
              </p>
              {questionInvalid && <InlineError>Soru en az {QUESTION_MIN} karakter olmalıdır.</InlineError>}
              {fieldErrors.question && <InlineError>{fieldErrors.question}</InlineError>}
            </div>

            <fieldset className="space-y-3 rounded-control border border-border p-4">
              <legend className="qx-small px-1 font-semibold text-fg"><AdminAyarlarKapiText k="changeAnswer" /></legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.current}>Mevcut cevap</Label>
                  <Input
                    id={ids.current}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(digitOnly(e.target.value))}
                    aria-invalid={!!fieldErrors.currentAnswer}
                    aria-describedby={fieldErrors.currentAnswer ? ids.currentErr : undefined}
                    className="text-center text-lg font-semibold tracking-widest"
                  />
                  {fieldErrors.currentAnswer && <InlineError id={ids.currentErr}>{fieldErrors.currentAnswer}</InlineError>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.next}>Yeni cevap</Label>
                  <Input
                    id={ids.next}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(digitOnly(e.target.value))}
                    aria-invalid={!!fieldErrors.newAnswer || answerMismatch}
                    aria-describedby={answerMismatch ? ids.answerErr : undefined}
                    className="text-center text-lg font-semibold tracking-widest"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.confirm}>Yeni cevap (tekrar)</Label>
                  <Input
                    id={ids.confirm}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={confirmAnswer}
                    onChange={(e) => setConfirmAnswer(digitOnly(e.target.value))}
                    aria-invalid={answerMismatch}
                    aria-describedby={answerMismatch ? ids.answerErr : undefined}
                    className="text-center text-lg font-semibold tracking-widest"
                  />
                </div>
              </div>
              {answerMismatch && <InlineError id={ids.answerErr}><AdminAyarlarKapiText k="answerMismatch" /></InlineError>}
              {fieldErrors.newAnswer && <InlineError>{fieldErrors.newAnswer}</InlineError>}
              <p className="qx-small text-fg-muted">
                Cevap 0-9 arası tek rakamdır. Değiştirdiğinizde diğer bütün yöneticilerin kapı oturumları anında sona erer.
              </p>
            </fieldset>

            {formError && !Object.keys(fieldErrors).length && <InlineError variant="banner">{formError}</InlineError>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving} success={saved} disabled={!canSave || saving} className="gap-2">
                <Save className="h-4 w-4" aria-hidden />
                Kaydet
              </Button>
              {!dirty && <span className="qx-small text-fg-muted"><AdminAyarlarKapiText k="noChange" /></span>}
            </div>
          </form>

          <ConfirmAction
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            tone="warning"
            title="Cevap değiştirilsin mi?"
            description="Yeni cevap kaydedildiği anda diğer bütün yöneticiler kapıdan yeniden geçmek zorunda kalır."
            impact={[
              { label: 'Kapı sürümü', value: `${gate.cfgVer} → ${gate.cfgVer + 1}`, emphasis: true },
              { label: 'Diğer yöneticilerin kapı oturumları', value: 'Sona erer' },
              { label: 'Sizin oturumunuz', value: 'Yenilenir (mevcut cevabı kanıtladınız)' },
            ]}
            irreversibleNote={false}
            confirmLabel="Cevabı değiştir"
            onConfirm={save}
          />
        </SectionCard>

        <SectionCard title="Önizleme" description="Yöneticilerin kapıda göreceği ekran.">
          <GatePreview question={questionTrim || gate.question} />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Kapı oturumları"
          description={`Kapıdan geçen yönetici ${policy.sessionHours} saat boyunca yeniden sorulmaz; çıkış yapınca oturum düşer.`}
          icon={<LogOut aria-hidden />}
        >
          <p className="qx-body text-fg-muted">
            Sızıntı şüphesinde bütün yöneticilerin (sizin dahil) kapı oturumlarını hemen sonlandırın. Herkes bir sonraki
            işlemde kapıdan yeniden geçer.
          </p>
          <div className="mt-4">
            <ConfirmAction
              trigger={
                <Button variant="destructive" className="gap-2">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Tüm kapı oturumlarını sonlandır
                </Button>
              }
              tone="danger"
              title="Bütün kapı oturumları sonlandırılsın mı?"
              description="Sizin dahil bütün yöneticiler kapıdan yeniden geçmek zorunda kalır."
              impact={[{ label: 'Kapı sürümü', value: `${gate.cfgVer} → ${gate.cfgVer + 1}`, emphasis: true }]}
              irreversibleNote={false}
              confirmLabel="Sonlandır"
              onConfirm={revokeAll}
            />
          </div>
          <dl className="qx-small mt-5 grid gap-2 text-fg-muted">
            <div className="flex justify-between gap-3">
              <dt><AdminAyarlarKapiText k="shortLock" /></dt>
              <dd className="text-fg">
                1 saatte {policy.shortMaxFailures} yanlış → {policy.shortLockMinutes} dk
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Uzun kilit</dt>
              <dd className="text-fg">
                24 saatte {policy.longMaxFailures} yanlış → {policy.longLockHours} saat
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Kilit bildirimi</dt>
              <dd className="text-fg"><AdminAyarlarKapiText k="allOtherAdmins" /></dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Kilitli hesaplar" icon={<Unlock aria-hidden />}>
          {stats.lockedUsers.length === 0 ? (
            <EmptyState title="Kilitli hesap yok" description="Son 24 saatte kapıda kilitlenen yönetici bulunmuyor." />
          ) : (
            <ul className="divide-y divide-border">
              {stats.lockedUsers.map((u) => (
                <li key={u.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="qx-body truncate font-medium text-fg">{personLabel(u)}</p>
                    <p className="qx-small text-fg-muted">Kilit bitişi: {formatDate(u.lockedUntil)}</p>
                  </div>
                  <ConfirmAction
                    trigger={
                      <Button variant="outline" size="sm">
                        Kilidi kaldır
                      </Button>
                    }
                    tone="warning"
                    title="Kilit kaldırılsın mı?"
                    description={`${personLabel(u)} kapıyı yeniden deneyebilecek. Yanlış denemeleri siz başlatmadıysanız önce hesabı inceleyin.`}
                    irreversibleNote={false}
                    confirmLabel="Kilidi kaldır"
                    onConfirm={() => unlock(u.userId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Son kapı olayları"
        description="Geçişler, yanlış denemeler, kilitler ve ayar değişiklikleri (denetim kaydından, son 25)."
        actions={
          <Link href={GATE_AUDIT_HREF} className="qx-small inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline">
            Tüm kapı kayıtları
          </Link>
        }
      >
        {events.length === 0 ? (
          <EmptyState title="Henüz kapı olayı yok" description="İlk geçiş ya da deneme burada görünecek." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead>
                <tr className="qx-caption text-fg-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Olay</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Hesap</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Zaman</th>
                  <th scope="col" className="py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((ev) => {
                  const meta = ACTION_LABELS[ev.action] ?? { label: ev.action, tone: 'neutral' as const };
                  return (
                    <tr key={ev.id} className="qx-small">
                      <td className="py-2.5 pr-3">
                        <span className={cn('inline-flex rounded-chip px-2 py-0.5 font-medium ring-1 ring-inset', CHIP[meta.tone])}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate py-2.5 pr-3 text-fg">{personLabel(ev.user)}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-fg-muted">{formatDate(ev.createdAt)}</td>
                      <td className="whitespace-nowrap py-2.5 tabular-nums text-fg-muted">{ev.ip ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** Kapı ekranının (app/admin-gate) etkileşimsiz, hareketsiz küçük kopyası. */
function GatePreview({ question }: { question: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-card p-6 text-center text-white"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1f 0%, #05050f 60%, #000 100%)' }}
      aria-label="Kapı ekranı önizlemesi"
      role="img"
    >
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-purple-400/40 shadow-[0_0_40px_rgba(168,85,247,0.35)]">
        <span className="text-3xl" aria-hidden>
          🛸
        </span>
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.35em] text-purple-300/80"><AdminAyarlarKapiText k="gateTitle" /></p>
      <p className="mt-1 text-lg font-black"><AdminAyarlarKapiText k="gateSubtitle" /></p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/75">{question}</p>
      <div className="mx-auto mt-4 flex h-12 max-w-[16rem] items-center justify-center gap-2 rounded-xl border-2 border-purple-500/40 bg-white/5">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-purple-400/50" />
        ))}
      </div>
    </div>
  );
}
