'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, ExternalLink, ListChecks, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { QueryState, SectionCard, InlineError } from '@/components/states';
import { ContrastAuditSection } from '../guide/token-sections';
import {
  A11Y_CHECKLIST,
  CHECK_STATUSES,
  CHECK_STATUS_LABEL,
  PRINCIPLE_HINT,
  PRINCIPLE_LABEL,
  checklistProgress,
  type CheckStatus,
  type ChecklistItem,
  type WcagPrinciple,
} from '@/lib/design-system/a11y-checklist';
import { THEME_FAMILIES, contrastChecks, resolvePaletteTokens } from '@/lib/design-system/theme-model';
import type { ChecklistData, PrefsSummary } from '@/lib/design-system/a11y.server';
import { dsKeys, errorText, fetchA11y, formatIstanbul, isConflict, patchChecklist } from '../api';

type A11yData = { prefs: PrefsSummary; checklist: ChecklistData };

const ROLE_LABEL: Record<string, string> = { CUSTOMER: 'Müşteri', DEALER: 'Bayi', STAFF: 'Personel', ADMIN: 'Yönetici' };
const fmt = (n: number) => n.toLocaleString('tr-TR');
const pct = (a: number, b: number) => (b ? `%${((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—');

const STATUS_STYLE: Record<CheckStatus, string> = {
  untested: 'border-subtle bg-surface-muted text-fg-muted',
  pass: 'border-success-border bg-success-subtle text-success',
  fail: 'border-danger-border bg-danger-subtle text-danger',
  na: 'border-info-border bg-info-subtle text-info',
};

function PrefsCard({ prefs }: { prefs: PrefsSummary }) {
  const t = prefs.totals;
  const tiles = [
    { k: 'Yüksek kontrast', v: t.highContrast },
    { k: 'Animasyonları azalt', v: t.reduceAnimations },
    { k: 'Renk körü modu', v: t.colorblindMode },
    { k: 'Büyük yazı', v: t.largeText },
  ];
  return (
    <SectionCard
      title="Kullanıcı tercihleri"
      icon={<Users />}
      description={`Hesaba kaydedilmiş erişilebilirlik tercihleri (yalnız cihazda kalanlar görünmez). ${fmt(t.saved)} kullanıcı tercih kaydetmiş · Ölçüm: ${formatIstanbul(prefs.generatedAt)} (10 dk önbellek).`}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((m) => (
            <div key={m.k} className="rounded-card border bg-surface-1 p-3">
              <dt className="qx-caption text-fg-muted">{m.k}</dt>
              <dd className="qx-h3 qx-num mt-1 text-fg">{fmt(m.v)}</dd>
              <dd className="qx-caption text-fg-subtle">tüm kullanıcıların {pct(m.v, t.users)}’i</dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto rounded-control border">
          <table className="w-full min-w-[36rem] text-left">
            <caption className="sr-only">Rol kırılımı</caption>
            <thead className="bg-surface-muted">
              <tr className="qx-caption text-fg-muted">
                <th scope="col" className="px-3 py-2 font-medium">Rol</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kullanıcı</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tercih kaydeden</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kontrast</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Hareket</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Renk körü</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Büyük yazı</th>
              </tr>
            </thead>
            <tbody>
              {prefs.rows.map((r) => (
                <tr key={r.role} className="border-t">
                  <th scope="row" className="qx-small px-3 py-2 font-medium text-fg">
                    {ROLE_LABEL[r.role] ?? r.role}
                  </th>
                  {[r.users, r.saved, r.highContrast, r.reduceAnimations, r.colorblindMode, r.largeText].map((v, i) => (
                    <td key={i} className="qx-small qx-num px-3 py-2 text-right text-fg-muted">
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

function ChecklistRow({
  item,
  data,
  onSaved,
}: {
  item: ChecklistItem;
  data: ChecklistData;
  onSaved: (d: ChecklistData) => void;
}) {
  const entry = data.state[item.id];
  const status = entry?.status ?? 'untested';
  const [editing, setEditing] = useState<CheckStatus | null>(null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const noteId = `a11y-note-${item.id}`;

  const save = async (next: CheckStatus, nextNote: string) => {
    setBusy(true);
    setErr(null);
    try {
      const d = await patchChecklist({ id: item.id, status: next, note: nextNote.trim() || undefined, baseVersion: data.version });
      onSaved(d);
      setEditing(null);
      toast.success(`${item.sc} “${CHECK_STATUS_LABEL[next]}” olarak kaydedildi.`);
    } catch (e) {
      setErr(isConflict(e) ? 'Liste bu arada güncellendi; yenilendi, tekrar deneyin.' : errorText(e));
      if (isConflict(e)) onSaved(data); // üst bileşen yeniden çeker
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="qx-small font-medium text-fg">
            <span className="font-mono text-fg-muted">{item.sc}</span> {item.title}{' '}
            <span className="qx-caption rounded-chip border px-1.5 py-0.5 text-fg-muted">{item.level}</span>
          </p>
          <p className="qx-caption mt-0.5 text-fg-muted">{item.howTo}</p>
          {entry?.note && <p className="qx-caption mt-1 text-fg">Not: {entry.note}</p>}
          {entry?.at && (
            <p className="qx-caption text-fg-subtle">
              {formatIstanbul(entry.at)} · {entry.by ?? 'Bilinmeyen yönetici'}
            </p>
          )}
        </div>
        <div role="radiogroup" aria-label={`${item.sc} durumu`} className="flex shrink-0 flex-wrap gap-1">
          {CHECK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              disabled={busy}
              onClick={() => {
                if (s === status) return;
                if (s === 'fail' || s === 'na') {
                  setEditing(s);
                  return;
                }
                void save(s, entry?.note ?? '');
              }}
              className={cn(
                'qx-caption min-h-11 rounded-chip border px-2.5 font-medium transition-colors duration-fast sm:min-h-8',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                status === s ? STATUS_STYLE[s] : 'bg-surface-1 text-fg-muted hover:text-fg',
              )}
            >
              {CHECK_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {editing && (
        <div className="space-y-2 rounded-control border bg-surface-muted p-3">
          <label htmlFor={noteId} className="qx-small font-medium text-fg">
            {editing === 'fail' ? 'Nerede, ne bozuk? (zorunlu)' : 'Neden kapsam dışı? (isteğe bağlı)'}
          </label>
          <Textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              loading={busy}
              disabled={editing === 'fail' && note.trim().length < 5}
              onClick={() => void save(editing, note)}
            >
              “{CHECK_STATUS_LABEL[editing]}” olarak kaydet
            </Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setEditing(null)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
      <InlineError>{err}</InlineError>
    </li>
  );
}

function ChecklistCard({ data, onSaved }: { data: ChecklistData; onSaved: (d: ChecklistData | null) => void }) {
  const progress = checklistProgress(data.state);
  const [filter, setFilter] = useState<'all' | CheckStatus>('all');
  const principles: WcagPrinciple[] = ['perceivable', 'operable', 'understandable', 'robust'];
  const visible = (i: ChecklistItem) => filter === 'all' || (data.state[i.id]?.status ?? 'untested') === filter;

  return (
    <SectionCard
      title="WCAG 2.2 AA el ile doğrulama listesi"
      icon={<ListChecks />}
      description="Otomatik ölçülemeyen kriterler. Her değişiklik denetim günlüğüne yazılır; “Kaldı” için not zorunlu."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="qx-small font-medium text-fg">
              %{progress.percent} tamamlandı · {progress.pass} geçti · {progress.fail} kaldı · {progress.na} kapsam dışı · {progress.untested} denetlenmedi
            </span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Doğrulama listesi tamamlanma"
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <div role="group" aria-label="Duruma göre süz" className="flex flex-wrap gap-1.5">
          {(['all', ...CHECK_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                'qx-caption min-h-11 rounded-chip border px-2.5 font-medium sm:min-h-9',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === s ? 'border-brand-border bg-brand-subtle text-brand' : 'bg-surface-1 text-fg-muted hover:text-fg',
              )}
            >
              {s === 'all' ? 'Tümü' : CHECK_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {principles.map((p) => {
          const items = A11Y_CHECKLIST.filter((i) => i.principle === p && visible(i));
          if (!items.length) return null;
          return (
            <section key={p} aria-labelledby={`a11y-p-${p}`} className="space-y-1.5">
              <h3 id={`a11y-p-${p}`} className="qx-overline text-fg-muted">
                {PRINCIPLE_LABEL[p]}
              </h3>
              <ul className="divide-y rounded-control border">
                {items.map((i) => (
                  <ChecklistRow key={i.id} item={i} data={data} onSaved={(d) => onSaved(d === data ? null : d)} />
                ))}
              </ul>
            </section>
          );
        })}
        {A11Y_CHECKLIST.every((i) => !visible(i)) && <p className="qx-small text-fg-muted">Bu durumda kriter yok.</p>}
      </div>
    </SectionCard>
  );
}

/** Tüm hazır paletlerin kritik çiftleri — yayın öncesi hangi temanın sorunlu olduğu bir bakışta. */
function PresetContrastCard() {
  const rows = useMemo(
    () =>
      THEME_FAMILIES.map((f) => {
        const res = (['light', 'dark'] as const).map((mode) => contrastChecks(resolvePaletteTokens(f.variants[mode], mode)).filter((c) => !c.pass));
        return { f, light: res[0], dark: res[1] };
      }),
    [],
  );
  return (
    <SectionCard
      title="Tema paletleri kontrast tablosu"
      description="Her hazır paletin açık ve koyu varyantında WCAG eşiğinin altında kalan çiftler (metin 4,5:1, odak halkası 3:1). Kaynak: lib/theme-presets.ts."
    >
      <div className="overflow-x-auto rounded-control border">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="bg-surface-muted">
            <tr className="qx-caption text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">Palet</th>
              <th scope="col" className="px-3 py-2 font-medium">Açık mod</th>
              <th scope="col" className="px-3 py-2 font-medium">Koyu mod</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, light, dark }) => (
              <tr key={f.id} className="border-t align-top">
                <th scope="row" className="qx-small px-3 py-2 font-medium text-fg">
                  {f.name}
                </th>
                {[light, dark].map((fails, i) => (
                  <td key={i} className="qx-caption px-3 py-2">
                    {fails.length === 0 ? (
                      <span className="font-medium text-success">Tümü geçer</span>
                    ) : (
                      <span className="text-danger">{fails.map((c) => c.label).join(', ')}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const REFS = [
  { href: 'https://www.w3.org/WAI/WCAG22/quickref/', label: 'WCAG 2.2 hızlı başvuru (W3C)' },
  { href: 'https://www.w3.org/Translations/WCAG21-tr/', label: 'WCAG 2.1 Türkçe yetkili çeviri (W3C)' },
  { href: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility', label: 'MDN: Erişilebilirlik' },
];

function GuideCard() {
  return (
    <SectionCard title="Rehber ve referanslar" icon={<BookOpen />} description="Bu ekran hukuki bir uygunluk denetiminin yerine geçmez.">
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PRINCIPLE_LABEL) as WcagPrinciple[]).map((p) => (
            <div key={p} className="rounded-card border bg-surface-1 p-3">
              <dt className="qx-small font-semibold text-fg">{PRINCIPLE_LABEL[p]}</dt>
              <dd className="qx-caption mt-1 text-fg-muted">{PRINCIPLE_HINT[p]}</dd>
            </div>
          ))}
        </dl>
        <nav aria-label="Dış referanslar">
          <ul className="flex flex-wrap gap-2">
            {REFS.map((r) => (
              <li key={r.href}>
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <a href={r.href} target="_blank" rel="noopener noreferrer">
                    {r.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only"> (yeni sekmede açılır)</span>
                  </a>
                </Button>
              </li>
            ))}
            <li>
              <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Link href="/admin/observability#rum-web-vitals">Panel RUM örnekleri</Link>
              </Button>
            </li>
          </ul>
        </nav>
        <p className="qx-caption text-fg-muted">
          Otomatik tarama (axe) henüz CI'a bağlı değil; bu nedenle burada otomatik ihlal sayısı gösterilmez. Kontrast sözleşmesi ise her
          tema × mod × erişilebilirlik modu kombinasyonunda Jest ile denetlenir.
        </p>
      </div>
    </SectionCard>
  );
}

export function A11yTab({ initial }: { initial: A11yData | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: dsKeys.a11y, queryFn: ({ signal }) => fetchA11y(signal), initialData: initial ?? undefined, staleTime: 60_000 });

  return (
    <div className="flex flex-col gap-section">
      <ContrastAuditSection />
      <QueryState query={q} skeleton="stats">
        {(data) => (
          <div className="flex flex-col gap-section">
            <PrefsCard prefs={data.prefs} />
            <ChecklistCard
              data={data.checklist}
              onSaved={(d) => {
                if (d) qc.setQueryData(dsKeys.a11y, { ...data, checklist: d });
                else void q.refetch();
              }}
            />
          </div>
        )}
      </QueryState>
      <PresetContrastCard />
      <GuideCard />
    </div>
  );
}
