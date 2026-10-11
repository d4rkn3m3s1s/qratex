'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { KeyValueList, Sparkline, StatusBadge, statusBadgeProps, Timeline, type TimelineEvent } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import {
  AUDIT_ACTION_LABEL,
  CADENCE_LABEL,
  MECHANIC_META,
  WARNING_LABEL,
  type QuestDetail,
} from '@/lib/admin-quests/contract';
import { fetchQuest, questsKeys } from './api';
import { QuestActions } from './quest-actions';
import { QUEST_STATUS_MAP, fmtDate, fmtDateTime, fmtNumber, fmtRemaining, pct } from './format';

function Funnel({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-2" aria-label="Görev hunisi">
      {steps.map((s, i) => (
        <li key={s.label} className="space-y-1">
          <div className="qx-small flex items-baseline justify-between gap-2">
            <span className="text-fg">{s.label}</span>
            <span className="qx-num font-semibold text-fg">
              {fmtNumber(s.value)}
              {i > 0 && steps[0].value > 0 ? <span className="ml-1 font-normal text-fg-muted">(%{pct(s.value, steps[0].value)})</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function QuestDetailBody({ id, onEdit, onOpen }: { id: string; onEdit: (id: string) => void; onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: questsKeys.detail(id), queryFn: () => fetchQuest(id), staleTime: 10_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(d: QuestDetail) => {
        const quest = d.quest;
        const meta = MECHANIC_META[quest.mechanic];
        const payouts14 = d.dailyPayouts14d.reduce((a, b) => a + b, 0);
        const events: TimelineEvent[] = d.audit.map((a) => ({
          id: a.id,
          title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
          description: [a.changes.length ? `Değişen: ${a.changes.join(', ')}` : null, a.reason ? `Gerekçe: ${a.reason}` : null].filter(Boolean).join(' · ') || undefined,
          at: a.at,
          actor: a.actorName ?? undefined,
          tone: a.action === 'QUEST_ARCHIVE' || a.action === 'DELETE_QUEST' ? 'warning' : a.action === 'QUEST_RESUME' || a.action === 'CREATE_QUEST' ? 'success' : 'neutral',
        }));
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-2xl ring-1 ring-inset ring-brand-border">
                  {quest.icon && !quest.icon.startsWith('/') ? quest.icon : '🎯'}
                </span>
                <div className="min-w-0">
                  <p className="qx-body font-semibold text-fg">{quest.name}</p>
                  <p className="qx-small text-fg-muted">{quest.description}</p>
                </div>
              </div>
              <StatusBadge {...statusBadgeProps(QUEST_STATUS_MAP, quest.status)} />
            </div>

            <QuestActions quest={quest} onEdit={onEdit} onOpenCreated={onOpen} variant="buttons" />

            {quest.warnings.length ? (
              <ul className="space-y-2" aria-label="Uyarılar">
                {quest.warnings.map((w) => (
                  <li key={w} className="qx-small flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    {WARNING_LABEL[w]}
                    {w === 'manual_only' ? ' — kullanıcıları “Kullanıcıyı tamamla” ile işaretleyin.' : ''}
                  </li>
                ))}
              </ul>
            ) : null}

            <section aria-labelledby={`qd-def-${id}`} className="space-y-2">
              <h3 id={`qd-def-${id}`} className="qx-small font-semibold text-fg">Tanım</h3>
              <KeyValueList
                items={[
                  { label: 'Mekanik', value: meta.label, hint: meta.description },
                  ...(quest.category ? [{ label: 'Kategori', value: `${quest.category} · ${fmtNumber(quest.categoryDealers)} işletme` }] : []),
                  ...(quest.minLength ? [{ label: 'En az karakter', value: fmtNumber(quest.minLength) }] : []),
                  { label: 'Dönem', value: CADENCE_LABEL[quest.cadence] },
                  { label: 'Hedef', value: `${fmtNumber(quest.target)} ${meta.unit}` },
                  { label: 'Ödül', value: `${fmtNumber(quest.reward.points)} puan · ${fmtNumber(quest.reward.xp)} XP`, hint: meta.autoReward ? 'Tamamlanınca otomatik verilir' : 'Müşteri “Ödülü al” der' },
                  { label: 'Bitiş', value: quest.expiresAt ? `${fmtDateTime(quest.expiresAt)} · ${fmtRemaining(quest.expiresAt)}` : 'Süresiz' },
                  { label: 'Oluşturma', value: fmtDate(quest.createdAt) },
                  { label: 'Kimlik', value: quest.id, copyValue: quest.id },
                ]}
              />
            </section>

            <section aria-labelledby={`qd-fun-${id}`} className="space-y-3">
              <h3 id={`qd-fun-${id}`} className="qx-small font-semibold text-fg">Performans</h3>
              <Funnel
                steps={[
                  { label: 'İlerleme kaydı olan', value: quest.metrics.participants },
                  { label: 'Tamamlayan', value: quest.metrics.completed },
                  { label: 'Ödül alan', value: quest.metrics.rewardedUsers },
                ]}
              />
              {quest.tracking === 'live' ? (
                <p className="qx-caption text-fg-muted">Canlı sayılan görevlerde ilerleme kaydı ilk ödül alımında açılır; ilerleyip henüz almamış kullanıcılar burada görünmez.</p>
              ) : null}
              <div className="rounded-card border border-subtle p-3">
                <div className="qx-small mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-fg">Son 14 gün ödeme</span>
                  <span className="qx-num font-semibold text-fg">{fmtNumber(payouts14)}</span>
                </div>
                <Sparkline data={d.dailyPayouts14d} height={40} area zeroBased label={`Son 14 günde toplam ${fmtNumber(payouts14)} ödeme`} />
                <p className="qx-caption mt-2 text-fg-muted">
                  Son 30 gün: {fmtNumber(quest.metrics.payouts30d)} ödeme · {fmtNumber(quest.metrics.points30d)} puan · {fmtNumber(quest.metrics.xp30d)} XP (puan defteri)
                </p>
              </div>
            </section>

            <section aria-labelledby={`qd-rec-${id}`} className="space-y-2">
              <h3 id={`qd-rec-${id}`} className="qx-small font-semibold text-fg">Son tamamlayanlar</h3>
              {d.recent.length === 0 ? (
                <p className="qx-small text-fg-muted">Henüz tamamlayan yok.</p>
              ) : (
                <ul className="divide-y divide-subtle rounded-card border border-subtle">
                  {d.recent.map((r) => (
                    <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <Link href={`/admin/users/${encodeURIComponent(r.userId)}`} className="qx-small min-h-11 min-w-0 truncate py-3 font-medium text-fg underline-offset-4 hover:underline focus-visible:underline sm:min-h-0 sm:py-0">
                        {r.name || r.email || 'Adsız kullanıcı'}
                      </Link>
                      <span className="qx-caption text-fg-muted">
                        {fmtDateTime(r.completedAt)} · {r.rewardedAt ? 'ödül alındı' : 'ödül bekliyor'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby={`qd-aud-${id}`} className="space-y-2">
              <h3 id={`qd-aud-${id}`} className="qx-small font-semibold text-fg">Değişiklik geçmişi</h3>
              {events.length ? <Timeline events={events} timeStyle="datetime" ariaLabel="Görev değişiklik geçmişi" /> : <p className="qx-small text-fg-muted">Kayıt yok.</p>}
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}
