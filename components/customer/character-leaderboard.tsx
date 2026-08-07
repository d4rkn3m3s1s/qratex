'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Trophy, Sparkles, Crown, Medal, Users } from 'lucide-react';

// ── Nadirlik (rarity) teması — character-card ile renk uyumlu ─────────────
type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
const RARITY: Record<Rarity, { label: string | null; glow: string }> = {
  legendary: { label: 'EFSANEVİ', glow: '#f59e0b' },
  epic: { label: 'EPİK', glow: '#c026d3' },
  rare: { label: 'NADİR', glow: '#3b82f6' },
  common: { label: null, glow: '#94a3b8' },
};
function rarityTheme(r?: string) {
  return RARITY[(r as Rarity) || 'common'] ?? RARITY.common;
}

/** Hex → rgba. */
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(148,163,184,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

/** Nadir % okunur biçim. */
function rateLabel(ratePct?: number | null): string | null {
  if (typeof ratePct !== 'number') return null;
  return ratePct < 1 ? ratePct.toFixed(1) : String(Math.round(ratePct));
}

function initials(name?: string | null): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

type RarestRow = {
  badgeId: string;
  name: string;
  icon: string;
  category: { key: string; name: string; emoji: string; accent: string } | null;
  rarity: Rarity;
  holders: number;
  ratePct: number | null;
};
type WeeklyRow = {
  rank: number;
  userId: string;
  name: string | null;
  image: string | null;
  count: number;
  isCurrentUser: boolean;
};
type Mode = 'rarest' | 'top-weekly';

/** Sıra rozeti rengi (1=altın, 2=gümüş, 3=bronz). */
function rankStyle(rank: number): { color: string; Icon: typeof Crown } {
  if (rank === 1) return { color: '#f59e0b', Icon: Crown };
  if (rank === 2) return { color: '#94a3b8', Icon: Medal };
  if (rank === 3) return { color: '#d97706', Icon: Medal };
  return { color: '#64748b', Icon: Trophy };
}

/**
 * "Karakter Liderliği" — badges sayfasında CharacterCard'ın altında yer alan şık
 * liderlik kartı. İki mod: En Nadir Karakterler / Bu Hafta En Çok Kazananlar.
 * Karakter rozetleri genel listede gizlidir; burası "kazanılmış karakterler
 * arasında" nadirlik/aktivite gösterir (kilitli karakter adı sızmaz).
 */
export function CharacterLeaderboard() {
  const [mode, setMode] = useState<Mode>('rarest');
  const [rarest, setRarest] = useState<RarestRow[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyRow[] | null>(null);
  const [myWeekly, setMyWeekly] = useState<{ count: number; rank: number | null } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/customer/character-leaderboard?mode=${mode}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        if (mode === 'rarest') {
          setRarest(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        } else {
          setWeekly(Array.isArray(data.leaderboard) ? data.leaderboard : []);
          setMyWeekly(data.currentUser ?? null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const isRarest = mode === 'rarest';
  const rows = isRarest ? rarest : weekly;
  const isEmpty = !loading && Array.isArray(rows) && rows.length === 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-amber-500/10 p-5 shadow-sm">
      {/* Başlık + mod anahtarı */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Trophy className="h-4 w-4" />
          Karakter Liderliği
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5 text-[11px]">
          <button
            onClick={() => setMode('rarest')}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              isRarest ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            💎 En Nadir
          </button>
          <button
            onClick={() => setMode('top-weekly')}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              !isRarest ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🔥 Bu Hafta
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {isRarest
          ? 'En az kişide bulunan karakterler en yukarıda — sende varsa gerçekten nadirsin.'
          : 'Son 7 günde en çok karakter kazanan avcılar. Sen de yorumlarınla yüksel!'}
      </p>

      {/* Liste */}
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/25 py-8 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-foreground">
              {isRarest ? 'Henüz kazanılmış karakter yok' : 'Bu hafta henüz karakter kazanılmadı'}
            </p>
            <p className="text-xs text-muted-foreground">İlk sırayı sen kapabilirsin — yorum yazmaya başla!</p>
          </div>
        ) : isRarest ? (
          <ol className="space-y-2">
            {(rarest ?? []).map((row, i) => (
              <RarestItem key={row.badgeId} row={row} rank={i + 1} />
            ))}
          </ol>
        ) : (
          <>
            <ol className="space-y-2">
              {(weekly ?? []).map((row) => (
                <WeeklyItem key={row.userId} row={row} />
              ))}
            </ol>
            {/* Mevcut kullanıcı ilk 20 dışındaysa kendi sırasını ayrıca göster. */}
            {myWeekly && !(weekly ?? []).some((r) => r.isCurrentUser) && myWeekly.count > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {myWeekly.rank ? `#${myWeekly.rank}` : '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">Sen</p>
                  <p className="text-[11px] text-muted-foreground">Bu hafta</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                  <Sparkles className="h-3 w-3" />
                  {myWeekly.count}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── EN NADİR: karakter satırı (görsel + ad + kategori + nadir % + holder) ──
function RarestItem({ row, rank }: { row: RarestRow; rank: number }) {
  const theme = rarityTheme(row.rarity);
  const pct = rateLabel(row.ratePct);
  const accent = row.category?.accent ?? theme.glow;
  const { color: rankColor } = rankStyle(rank);

  const frame: CSSProperties =
    theme.label === null
      ? { borderColor: 'hsl(var(--border) / 0.6)' }
      : { borderColor: rgba(theme.glow, 0.5), boxShadow: `0 0 12px ${rgba(theme.glow, 0.16)}` };

  return (
    <li
      className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5 backdrop-blur-sm"
      style={frame}
    >
      {/* Sıra */}
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold"
        style={{ color: rankColor, background: rgba(rankColor, 0.12), boxShadow: `inset 0 0 0 1px ${rgba(rankColor, 0.3)}` }}
      >
        {rank}
      </span>

      {/* Rozet görseli */}
      <span
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${rgba('#ffffff', 0.85)}, ${rgba(accent, 0.28)})`,
          boxShadow: `inset 0 1px 6px ${rgba('#ffffff', 0.4)}`,
        }}
      >
        <Image src={row.icon} alt={row.name} width={32} height={32} className="h-7 w-7 object-contain drop-shadow" />
      </span>

      {/* Ad + kategori */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-foreground">{row.name}</p>
          {theme.label && (
            <span
              className="shrink-0 rounded-full border px-1.5 py-px text-[8px] font-extrabold uppercase tracking-wider"
              style={{ color: theme.glow, borderColor: rgba(theme.glow, 0.5), background: rgba(theme.glow, 0.12) }}
            >
              {theme.label}
            </span>
          )}
        </div>
        {row.category && (
          <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: accent }}>
            {row.category.emoji} {row.category.name}
          </p>
        )}
      </div>

      {/* Nadir % + holder sayısı */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {pct !== null && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border px-2 py-px text-[10px] font-semibold"
            style={{ color: theme.glow, borderColor: rgba(theme.glow, 0.4), background: rgba(theme.glow, 0.1) }}
            title={`Oyuncuların %${pct}'inde`}
          >
            <Trophy className="h-2.5 w-2.5" />%{pct}
          </span>
        )}
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <Users className="h-2.5 w-2.5" />
          {row.holders}
        </span>
      </div>
    </li>
  );
}

// ── BU HAFTA: kullanıcı satırı (sıra + avatar + ad + adet) ──
function WeeklyItem({ row }: { row: WeeklyRow }) {
  const { color, Icon } = rankStyle(row.rank);
  const highlight = row.isCurrentUser;
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-sm ${
        highlight ? 'border-primary/50 bg-primary/5' : 'border-border/60 bg-card/60'
      }`}
    >
      {/* Sıra + ilk 3'e taç/madalya */}
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold"
        style={{ color, background: rgba(color, 0.12), boxShadow: `inset 0 0 0 1px ${rgba(color, 0.3)}` }}
      >
        {row.rank <= 3 ? <Icon className="h-4 w-4" /> : row.rank}
      </span>

      {/* Avatar */}
      {row.image ? (
        <Image
          src={row.image}
          alt={row.name ?? 'Kullanıcı'}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border/60"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {initials(row.name)}
        </span>
      )}

      {/* Ad */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {highlight ? 'Sen' : row.name || 'İsimsiz Kullanıcı'}
        </p>
        <p className="text-[11px] text-muted-foreground">Bu hafta kazanılan karakter</p>
      </div>

      {/* Adet */}
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
        <Sparkles className="h-3 w-3" />
        {row.count}
      </span>
    </li>
  );
}
