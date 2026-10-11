'use client';

import { useEffect, useState, useCallback } from 'react';
import { m as Motion } from 'framer-motion';
import { Trophy, Crown, Medal, Loader2, Gift, Timer } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useGamesCopy } from './copy';

interface Row {
  rank: number;
  name: string;
  image: string | null;
  score: number;
  prize: number;
  isMe: boolean;
}
interface PendingReward {
  rank: number;
  points: number;
  weekKey: string;
  /** Ödülün ait olduğu (geçen haftanın öne çıkan) oyun. */
  gameTitle?: string;
}
interface TournamentData {
  gameTitle: string;
  endsInMs: number;
  leaderboard: Row[];
  me: { rank: number; score: number } | null;
  totalPlayers: number;
  prizes: Record<string, number>;
  pendingReward: PendingReward | null;
  /** Tek öne çıkan oyun modeli (P0-17): ödül yalnız haftanın öne çıkan oyununda. */
  isFeatured?: boolean;
  featured?: { gameType: string; title: string; emoji: string } | null;
  minParticipants?: number;
  participantsNeeded?: number;
}

/** ms → "3g 14s" / "5s 20d" / "12d" biçimi (geri sayım). */
function fmtCountdown(ms: number, fmt: (d: number, h: number, m: number) => string): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return fmt(d, h, m);
}

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="h-4 w-4 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="w-4 text-center text-xs font-bold text-muted-foreground">{rank}</span>;
};

/**
 * Bir oyunun HAFTALIK TURNUVASI: bu haftanın canlı sıralaması + geri sayım + ilk 3 ödülü.
 * Geçen haftadan bekleyen ödül varsa "Ödülü al" butonu gösterir. /api/customer/tournament.
 */
export function GameTournament({ gameType, accent }: { gameType: string; accent: string }) {
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const t = useGamesCopy().tournament;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/customer/tournament?game=${gameType}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setData(j);
          setRemainingMs(j.endsInMs ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameType]);

  useEffect(() => {
    load();
  }, [load]);

  // Geri sayımı dakikada bir tazele (görsel; kesin süre sunucudan).
  useEffect(() => {
    if (remainingMs <= 0) return;
    const t = setInterval(() => setRemainingMs((v) => Math.max(0, v - 60_000)), 60_000);
    return () => clearInterval(t);
  }, [remainingMs]);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch(`/api/customer/tournament?game=${gameType}`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || t.claimFailed);
      toast.success(t.claimed(j.rank, j.points));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.claimFailed);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Başlık + geri sayım */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: accent }}>
          <Trophy className="h-4 w-4" />
          {t.title}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          {remainingMs > 0 ? t.remaining(fmtCountdown(remainingMs, t.countdown)) : t.closing}
        </div>
      </div>

      {/* Bekleyen ödül (geçen hafta) */}
      {data.pendingReward && (
        <Motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={claim}
          disabled={claiming}
          className="flex w-full items-center justify-between rounded-xl border border-yellow-400/50 bg-gradient-to-r from-yellow-400/15 to-amber-400/10 px-3 py-2.5 text-left transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm font-bold">
                {t.lastWeek(data.pendingReward.rank, data.pendingReward.gameTitle)}
              </p>
              <p className="text-xs text-muted-foreground">{t.waiting(data.pendingReward.points)}</p>
            </div>
          </div>
          {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold text-yellow-600">{t.claim}</span>}
        </Motion.button>
      )}

      {/* Ödül havuzu — yalnız haftanın öne çıkan oyununda */}
      {data.isFeatured === false ? (
        <p className="text-center text-xs text-muted-foreground">
          {t.unrewarded}{' '}
          {data.featured ? t.featured(data.featured.emoji, data.featured.title) : ''}
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-center gap-3 text-xs text-muted-foreground">
            <span>🥇 {data.prizes['1']}p</span>
            <span>🥈 {data.prizes['2']}p</span>
            <span>🥉 {data.prizes['3']}p</span>
          </div>
          {!!data.participantsNeeded && data.participantsNeeded > 0 && (
            <p className="text-center text-[11px] text-muted-foreground">
              {t.minPlayers(data.minParticipants, data.participantsNeeded)}
            </p>
          )}
        </div>
      )}

      {/* Bu haftanın sıralaması */}
      {data.leaderboard.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {t.empty}
        </p>
      ) : (
        <div className="space-y-1">
          {data.leaderboard.map((row) => (
            <div
              key={row.rank}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                row.isMe ? 'bg-primary/10 font-semibold ring-1 ring-primary/30' : ''
              }`}
            >
              <span className="grid w-5 place-items-center">{rankIcon(row.rank)}</span>
              <span className="min-w-0 flex-1 truncate">{row.isMe ? t.you : row.name}</span>
              {row.prize > 0 && <span className="text-[10px] text-yellow-600">+{row.prize}p</span>}
              <span className="font-mono text-xs tabular-nums">{row.score}⭐</span>
            </div>
          ))}
        </div>
      )}

      {/* Kendi sıram (ilk 10 dışındaysam) */}
      {data.me && !data.leaderboard.some((r) => r.isMe) && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-sm">
          <span className="w-5 text-center text-xs font-bold text-muted-foreground">{data.me.rank}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{t.you}</span>
          <span className="font-mono text-xs tabular-nums">{data.me.score}⭐</span>
        </div>
      )}
    </div>
  );
}
