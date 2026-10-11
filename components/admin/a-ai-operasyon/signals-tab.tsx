'use client';

import Link from 'next/link';
import { MessageSquareText, Tags, UserSearch, Lightbulb, Star, Heart, ShieldAlert, Activity } from 'lucide-react';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import { cn } from '@/lib/utils';
import {
  ENTITY_TYPE_LABEL,
  PERIOD_LABEL,
  PRIORITY_LABEL,
  labelOf,
  toCsv,
  type SignalsReport,
} from '@/lib/admin-ai-ops/contract';
import { useAiOps, useSignals } from './hooks';
import { CsvButton, DistList, KindBadge, Meter, fmtAgo, fmtInt, fmtPct } from './parts';

const SENT_TONES = { positive: 'success', neutral: 'neutral', negative: 'danger', mixed: 'warning' } as const;
const URG_TONES = { low: 'success', medium: 'info', high: 'warning', critical: 'danger' } as const;
const CHURN_TONES = { safe: 'success', low: 'info', medium: 'warning', high: 'danger' } as const;

function signalsCsv(s: SignalsReport): string {
  const rows: unknown[][] = [];
  rows.push(['Kapsam', 'Toplam geri bildirim', s.coverage.total]);
  rows.push(['Kapsam', 'Yazılı', s.coverage.withText]);
  rows.push(['Kapsam', 'Analiz edilmiş', s.coverage.analyzed]);
  for (const d of s.sentiment) rows.push(['Duygu', d.label, d.count]);
  for (const d of s.intent) rows.push(['Niyet', d.label, d.count]);
  for (const d of s.urgency) rows.push(['Aciliyet', d.label, d.count]);
  for (const d of s.churn) rows.push(['Kayıp riski', d.label, d.count]);
  for (const t of s.themes) rows.push(['Tema', t.theme, t.count]);
  for (const e of s.entities) rows.push(['Varlık', e.name, e.count]);
  for (const r of s.riskyDealers) rows.push(['Riskli bayi', r.name, r.risk]);
  return toCsv(['Bölüm', 'Ad', 'Değer'], rows);
}

export function SignalsTab() {
  const { period, openSignal } = useAiOps();
  const signals = useSignals();

  return (
    <QueryState query={signals} skeleton="cards">
      {(s) => (
        <div className="space-y-6">
          <div className={cn('flex flex-col gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between', TONE_CALLOUT.neutral)}>
            <p>
              <span className="font-medium">Kapsam ({PERIOD_LABEL[period].toLocaleLowerCase('tr-TR')}):</span> {fmtInt(s.coverage.total)} geri bildirim · {fmtInt(s.coverage.withText)} yazılı · {fmtInt(s.coverage.analyzed)} gerçek AI analizli ({fmtPct(s.coverage.analyzedPercent)}) · {fmtInt(s.coverage.pending)} bekliyor
              {s.coverage.synthetic ? <> · <span className="text-danger">{fmtInt(s.coverage.synthetic)} sezgisel kayıt hariç tutuldu</span></> : null}. Silinmiş kayıtlar sayılmaz.
            </p>
            <CsvButton filename={`ai-sinyaller-${period}.csv`} build={() => signalsCsv(s)} />
          </div>

          <MetricGrid cols={4}>
            <MetricTile label="Ort. aciliyet" icon={<Activity />} metric={{ value: s.averages.urgency, unit: '/100', n: s.averages.n, minN: 20 }} hint="0 = acil değil · 100 = kritik" />
            <MetricTile label="Ort. efor" metric={{ value: s.averages.effort, unit: '/100' }} hint="Müşterinin harcadığı çaba (yüksek = kötü)" />
            <MetricTile label="Ort. kayıp riski" metric={{ value: s.averages.churn, unit: '/100' }} hint="Müşteriyi kaybetme olasılığı" />
            <MetricTile label="Ort. puan" icon={<Star />} metric={{ value: s.averages.rating, fractionDigits: 2, unit: '/5', n: s.coverage.total, minN: 20 }} hint="Metinsiz puanlar dahil" />
          </MetricGrid>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-4">
            <SectionCard title="Duygu" description="Yerel yedek analizler dahil; sahte kayıtlar hariç." density="compact">
              <DistList dist={s.sentiment} tones={SENT_TONES} pickable={(k) => k === 'negative'} onPick={() => openSignal({ signal: 'negative' })} />
            </SectionCard>
            <SectionCard title="Niyet" density="compact">
              <DistList dist={s.intent} onPick={(k, l) => openSignal({ signal: 'intent', value: k, label: l })} />
            </SectionCard>
            <SectionCard title="Aciliyet" description="Kovalar: <0,4 · <0,6 · <0,85 · ≥0,85" density="compact">
              <DistList dist={s.urgency} tones={URG_TONES} onPick={(k, l) => openSignal({ signal: 'urgency', value: k, label: l })} />
            </SectionCard>
            <SectionCard title="Kayıp riski" description="Kovalar: <0,25 · <0,5 · <0,75 · ≥0,75" density="compact">
              <DistList dist={s.churn} tones={CHURN_TONES} pickable={(k) => k === 'high'} onPick={() => openSignal({ signal: 'churn' })} />
            </SectionCard>
          </div>

          <SectionCard title="Riskli bayiler" description="Olumsuz oran, acil ve kayıp riski yoğunluğu ile düşük puandan türeyen skor (0-100); 20 kayıt altında güven düşürülür." icon={<ShieldAlert />} density="flush">
            {s.riskyDealers.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-fg-muted">Bu dönemde risk sinyali taşıyan bayi yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">Riskli bayiler</caption>
                  <thead className="border-b border-border text-left text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Bayi</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Risk</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Geri bildirim</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Olumsuz</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Acil</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Kayıp riski</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Ort. puan</th>
                      <th scope="col" className="px-4 py-2"><span className="sr-only">İşlemler</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.riskyDealers.map((d) => (
                      <tr key={d.dealerId} className="border-b border-border last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-medium text-fg">{d.name}</th>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <StatusBadge size="sm" icon={null} label={String(d.risk)} tone={d.risk >= 50 ? 'danger' : d.risk >= 25 ? 'warning' : 'neutral'} srPrefix="Risk skoru" />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(d.feedbacks)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(d.negativePercent)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(d.urgent)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(d.churnHigh)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{d.avgRating ?? '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <span className="inline-flex gap-2 text-xs">
                            <button type="button" className="min-h-[44px] rounded px-1 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8" onClick={() => openSignal({ signal: 'negative', dealerId: d.dealerId, label: `${d.name} · olumsuz` })}>
                              Olumsuzlar
                            </button>
                            <Link className="inline-flex min-h-[44px] items-center rounded px-1 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8" href={`/admin/dealers-health?q=${encodeURIComponent(d.name)}`}>
                              Sağlık
                            </Link>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Temalar" description="Yıldız = o temayı taşıyan yorumların GERÇEK puan ortalaması (AI skoru değil)." icon={<Tags />} density="compact">
              {s.themes.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu dönemde tema çıkarılmış yorum yok.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {s.themes.map((t) => (
                    <li key={t.theme}>
                      <button
                        type="button"
                        onClick={() => openSignal({ signal: 'theme', value: t.theme })}
                        className="flex min-h-[44px] w-full flex-col gap-1 rounded px-1 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        aria-label={`${t.theme}: ${t.count} yorum, olumsuz ${fmtPct(t.negative)}, ortalama ${t.avgRating ?? '—'} yıldız. Listeyi aç`}
                      >
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-fg">{t.theme}</span>
                          <span className="shrink-0 tabular-nums text-fg-muted">
                            {fmtInt(t.count)} · {t.avgRating ?? '—'}★ · {fmtInt(t.dealers)} bayi
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-fg-muted">
                          <span className="w-24 shrink-0">Olumsuz {fmtPct(t.negative)}</span>
                          <Meter value={t.negative ?? 0} tone="danger" label={`${t.theme} olumsuz oranı ${fmtPct(t.negative)}`} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Varlıklar" description="Yorumlarda adı geçen ürün, kişi ve yerler." icon={<UserSearch />} density="compact">
              {s.entities.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu dönemde varlık çıkarılmış yorum yok.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {s.entities.map((e) => (
                    <li key={`${e.type}:${e.name}`}>
                      <button
                        type="button"
                        onClick={() => openSignal({ signal: 'entity', value: e.name })}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded px-1 py-2 text-left text-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-fg">{e.name}</span> <span className="text-xs text-fg-muted">{labelOf(ENTITY_TYPE_LABEL, e.type)}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                          {fmtInt(e.count)} · olumlu {fmtPct(e.positive)} · olumsuz {fmtPct(e.negative)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard title="Aksiyon önerileri" description="AI önerileri kategoriye göre kümelenmiş; öncelik = kümedeki en yüksek." icon={<Lightbulb />} density="compact" className="xl:col-span-2">
              {s.actions.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu dönemde aksiyon önerisi yok.</p>
              ) : (
                <ul className="space-y-3">
                  {s.actions.map((a) => (
                    <li key={a.category} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium capitalize text-fg">{a.category === 'other' ? 'Diğer' : a.category}</span>
                        <StatusBadge size="sm" icon={null} label={labelOf(PRIORITY_LABEL, a.topPriority)} tone={a.topPriority === 'critical' ? 'danger' : a.topPriority === 'high' ? 'warning' : 'neutral'} srPrefix="Öncelik" />
                        <span className="text-xs text-fg-muted">
                          {fmtInt(a.count)} öneri · {fmtInt(a.dealers)} bayi
                        </span>
                      </div>
                      {a.examples.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                          {a.examples.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Duygular" icon={<Heart />} density="compact">
              {s.emotions.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu dönemde duygu etiketi yok.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {s.emotions.map((e) => (
                    <li key={e.emotion} className="flex items-baseline justify-between gap-2">
                      <span className="text-fg">{e.label}</span>
                      <span className="tabular-nums text-fg-muted">{fmtInt(e.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Puan × duygu" description="Tüm puanlar (metinsiz dahil); duygu yalnız analiz edilmiş yorumlarda. 5★ verip olumsuz yazanlar tutarsızlık işaretidir." icon={<Star />} density="flush">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Puana göre duygu dağılımı</caption>
                <thead className="border-b border-border text-left text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Puan</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Adet</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Olumlu</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Nötr</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Olumsuz</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Liste</span></th>
                  </tr>
                </thead>
                <tbody>
                  {s.rating.map((r) => {
                    const odd = (r.rating >= 4 && r.negative > 0) || (r.rating <= 2 && r.positive > 0);
                    return (
                      <tr key={r.rating} className="border-b border-border last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-medium">{r.rating} yıldız</th>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.count)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.positive)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.neutral)}</td>
                        <td className={cn('px-2 py-2 text-right tabular-nums', odd && r.rating >= 4 && r.negative ? 'font-medium text-warning' : undefined)}>{fmtInt(r.negative)}</td>
                        <td className="px-4 py-2 text-right">
                          {r.count ? (
                            <button type="button" className="min-h-[44px] rounded px-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8" onClick={() => openSignal({ signal: 'rating', value: String(r.rating) })}>
                              Listele
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Son analizler" description="Model rozeti analizin kaynağını gösterir: yapay zekâ, yerel yedek ya da sezgisel (sahte)." icon={<MessageSquareText />} density="compact">
            {s.recent.length === 0 ? (
              <p className="text-sm text-fg-muted">Bu dönemde analiz edilmiş geri bildirim yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {s.recent.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                      <span className="font-medium text-fg">{r.dealerName}</span>
                      <span aria-hidden>·</span>
                      <span>{r.rating} yıldız</span>
                      <span aria-hidden>·</span>
                      <time dateTime={r.at}>{fmtAgo(r.at)}</time>
                      <KindBadge kind={r.kind} />
                    </div>
                    <p className="mt-1 text-sm text-fg">{r.preview}</p>
                    <Link href={`/admin/feedbacks?id=${encodeURIComponent(r.id)}`} className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-6">
                      Geri bildirimi aç
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </QueryState>
  );
}
