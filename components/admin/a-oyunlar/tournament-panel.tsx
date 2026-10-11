'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Medal, Swords, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { QueryState, SectionCard, TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { fetchTournament, fmt, fmtDateTime, gamesKeys } from './api';

/**
 * Haftalık turnuva (salt-okunur + oyuna geçiş). Rotasyon (haftaya dondurulmuş TOURNAMENT_ROTATION
 * takvimi) ve ödül tablosu kod sabitidir (lib/game-tournament.ts, lib/tournament-core.ts); ödülleri
 * günlük `tournament-settle` işi otomatik dağıtır. Yönetim kolu öne çıkan oyunun ayarları ve aç/kapat anahtarıdır.
 */
export function TournamentPanel({ onOpenGame }: { onOpenGame: (gameType: string) => void }) {
  const q = useQuery({ queryKey: gamesKeys.tournament(), queryFn: fetchTournament, staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="list">
      {(t) => {
        const prizeActive = t.participants >= t.minParticipants;
        return (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <CalendarClock className="h-4 w-4" aria-hidden />
              Hafta <strong className="tabular-nums text-fg">{t.weekKey}</strong> · bitiş {fmtDateTime(t.endsAt)} (İstanbul saati)
            </p>
            <MetricGrid cols={3}>
              <MetricTile label="Katılımcı" icon={<Users />} tone="brand" metric={{ value: t.participants, unit: `/ en az ${t.minParticipants}` }} />
              <MetricTile label="1. ödülü" icon={<Medal />} tone="warning" metric={{ value: prizeActive ? t.prizes[1] : 0, unit: 'puan' }} hint={prizeActive ? 'Katılım eşiği sağlandı' : 'Eşik altında: ödül dağıtılmaz'} />
              <MetricTile label="Geçen hafta talep" icon={<Swords />} metric={{ value: t.lastWeek.claims.length }} hint={t.lastWeek.unclaimed > 0 ? `${t.lastWeek.unclaimed} ödül henüz talep edilmedi` : undefined} />
            </MetricGrid>

            {t.featuredGameType && !t.featuredEnabled && (
              <p className={cn('rounded-control border px-3 py-2 text-sm', TONE_CALLOUT.danger)}>
                Haftanın turnuva oyunu şu an KAPALI. Oyuncular yeni deneme açamaz; sıralama yalnız kapatmadan önceki skorlarla kalır.
              </p>
            )}

            <SectionCard
              title={t.featuredTitle ? `Haftanın oyunu: ${t.featuredTitle}` : 'Bu hafta turnuva yok'}
              description="Canlı sıralama (oyuncu başına en iyi sıralı skor; eşitlikte önce yapan önde)."
              actions={
                t.featuredGameType ? (
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onOpenGame(t.featuredGameType!)}>
                    Oyun ayarlarını aç
                  </Button>
                ) : null
              }
            >
              {t.top.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu hafta henüz tamamlanan sıralı deneme yok.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {t.top.map((e) => (
                    <li key={e.rank} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-6 text-right font-semibold tabular-nums text-fg-muted">{e.rank}.</span>
                      <span className="flex-1">{e.name}</span>
                      <span className="tabular-nums">{fmt(e.best)} skor</span>
                      {e.prize > 0 && <StatusBadge size="sm" tone="warning" label={`${fmt(e.prize)} puan`} icon={Medal} />}
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Rotasyon" description="Aday listesi: görünür portföy, registry sırası (kod sabiti).">
                <ol className="space-y-1 text-sm">
                  {t.rotation.map((r, i) => (
                    <li key={r.weekKey} className="flex justify-between gap-2">
                      <span className="tabular-nums text-fg-muted">{r.weekKey}{i === 0 ? ' (bu hafta)' : ''}</span>
                      <span className="font-medium">{r.title ?? '—'}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-fg-muted">
                  Rotasyon haftaya dondurulmuş takvimden gelir (yalnız canlı oyunlar); bir oyunu gizlemek/açmak sırayı kaydırmaz. Portföy değişince takvime gelecek haftadan başlayan yeni dilim eklenir.
                </p>
              </SectionCard>
              <SectionCard title={`Geçen hafta (${t.lastWeek.weekKey})`} description={t.lastWeek.title ? `${t.lastWeek.title} · ${fmt(t.lastWeek.participants)} katılımcı` : 'Turnuva yok'}>
                {t.lastWeek.participants < t.minParticipants ? (
                  <p className="text-sm text-fg-muted">Katılım eşiği ({t.minParticipants}) sağlanmadı; ödül dağıtılmadı.</p>
                ) : t.lastWeek.claims.length === 0 ? (
                  <p className="text-sm text-fg-muted">Ödüller henüz dağıtılmadı; günlük kapanış işi ilk koşusunda ilk 3’e otomatik verir.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {t.lastWeek.claims.map((c) => (
                      <li key={c.rank} className="flex justify-between gap-2">
                        <span>
                          {c.rank}. {c.name}
                        </span>
                        <span className="tabular-nums text-fg-muted">
                          {fmt(c.points)} puan · {fmtDateTime(c.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
