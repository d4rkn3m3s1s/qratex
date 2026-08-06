'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Sparkles, Wand2, Star, Lock, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CharacterReveal, type RevealCharacter } from '@/components/customer/character-reveal';
import { MysteryBar } from '@/components/customer/mystery-bar';

type Category = { key: string; name: string; emoji: string; accent: string; description?: string };
type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
type Character = {
  badgeId: string;
  name: string;
  icon?: string;
  description?: string;
  earnedAt?: string;
  category?: Category | null;
  rarity?: Rarity;
  holders?: number;
  ratePct?: number | null;
};
type CategoryStat = { key: string; name: string; emoji: string; accent: string; collected: number };
type Bar = { current: number; threshold: number; progress: number; remaining: number; ready: boolean };
type State = {
  character: Character | null;
  collection: Character[];
  categoryStats?: CategoryStat[];
  featuredBadgeId?: string | null;
  bar: Bar;
};

// ── Nadirlik (rarity) teması — reveal ekranıyla renk uyumlu ──────────────
// glow: rarity ışık rengi (hex), label: küçük rozet metni (common'da yok),
// intensity: parıltı yoğunluğu (0-1), ring: kart çerçeve sınıfı.
type RarityTheme = {
  key: Rarity;
  label: string | null;
  glow: string;
  glow2: string;
  intensity: number;
};
const RARITY_THEMES: Record<Rarity, RarityTheme> = {
  legendary: { key: 'legendary', label: 'EFSANEVİ', glow: '#f59e0b', glow2: '#fde047', intensity: 1 },
  epic: { key: 'epic', label: 'EPİK', glow: '#c026d3', glow2: '#a855f7', intensity: 0.8 },
  rare: { key: 'rare', label: 'NADİR', glow: '#3b82f6', glow2: '#60a5fa', intensity: 0.55 },
  common: { key: 'common', label: null, glow: '#94a3b8', glow2: '#cbd5e1', intensity: 0.35 },
};
function rarityTheme(r?: string): RarityTheme {
  return RARITY_THEMES[(r as Rarity) || 'common'] ?? RARITY_THEMES.common;
}

/** Hex → rgba (glow gölgeleri için). */
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(148,163,184,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

/** earnedAt (ISO) → kısa Türkçe tarih ("12 Ağu" gibi). */
function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

/** Nadir yüzdesini okunur biçimle (çok küçükse ondalık). */
function rateLabel(ratePct?: number | null): string | null {
  if (typeof ratePct !== 'number') return null;
  return ratePct < 1 ? ratePct.toFixed(1) : String(Math.round(ratePct));
}

// Her kategoride SABİT sayıda "???" kilitli kart (gerçek kalan sayı SIZMAZ — amaç merak).
const LOCKED_PER_CATEGORY = 2;

/**
 * "Karakter Koleksiyonun" — şık KOLEKSİYON VİTRİNİ.
 *  • Üstte: gizemli ilerleme barı + reveal tetik + küre/maskot seçici (KORUNDU, dokunulmadı).
 *  • Altında: kazanılan karakterler KATEGORİYE göre gruplu şık vitrin.
 *    - Kategori başlığı: emoji + ad + "N karakter toplandı" (TOPLAM sayı GİZLİ — merak).
 *    - Karakter kartı: rarity çerçeve/parıltı + rarity rozeti + nadir % + tarih + "ana karakter".
 *    - Her kategoride 2 adet "???" kilitli kart (daha fazlası seni bekliyor hissi).
 *  • Boş durumda: "İlk karakterini keşfetmek üzeresin…" mesajı.
 */
export function CharacterCard() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealOpen, setRevealOpen] = useState(false);
  const [variant, setVariant] = useState<'orb' | 'mascot'>('orb');
  // Ana karakter değişimi sırasında hangi rozet işleniyor (butonu kilitlemek için).
  const [featuring, setFeaturing] = useState<string | null>(null);

  const load = () => {
    fetch('/api/customer/character', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: State | null) => data && setState(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // "Ana karakter yap" — POST feature, iyimser yerel güncelleme + tazele.
  const setFeatured = (badgeId: string) => {
    if (!state || featuring) return;
    if (state.featuredBadgeId === badgeId) return; // zaten ana karakter
    setFeaturing(badgeId);
    // İyimser: önce yerelde işaretle (anında geri bildirim).
    setState((s) => (s ? { ...s, featuredBadgeId: badgeId } : s));
    fetch('/api/customer/character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feature', badgeId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { success?: boolean; featuredBadgeId?: string } | null) => {
        // Sunucu doğrulaması: başarısızsa tazeleme gerçeği geri getirir.
        if (!res?.success) load();
      })
      .catch(() => load())
      .finally(() => setFeaturing(null));
  };

  if (loading || !state) return null;

  const bar = state.bar;
  const collection = state.collection ?? [];
  const categoryStats = state.categoryStats ?? [];
  const featuredBadgeId = state.featuredBadgeId ?? null;
  const ready = bar?.ready;

  // Kazanılan karakterleri kategoriye göre grupla (kategori sırası categoryStats'tan).
  const statByKey = new Map(categoryStats.map((c) => [c.key, c]));
  const grouped = new Map<string, { cat: Category; stat?: CategoryStat; items: Character[] }>();
  for (const c of collection) {
    const key = c.category?.key ?? '__none';
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(c);
    } else {
      grouped.set(key, {
        cat: c.category ?? { key: '__none', name: 'Karakterler', emoji: '🎭', accent: '#94a3b8' },
        stat: c.category ? statByKey.get(c.category.key) : undefined,
        items: [c],
      });
    }
  }
  // categoryStats sırasına göre diz, bilinmeyenler sona.
  const orderedGroups = Array.from(grouped.values()).sort((a, b) => {
    const ai = categoryStats.findIndex((s) => s.key === a.cat.key);
    const bi = categoryStats.findIndex((s) => s.key === b.cat.key);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-fuchsia-500/10 p-5 shadow-sm">
        {/* Üst etiket + varyant seçici (reveal'e hazırken) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Karakter Koleksiyonun
          </div>
          {ready && (
            <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5 text-[11px]">
              <button
                onClick={() => setVariant('orb')}
                className={`rounded-full px-2 py-0.5 font-medium transition-colors ${variant === 'orb' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🔮 Küre
              </button>
              <button
                onClick={() => setVariant('mascot')}
                className={`rounded-full px-2 py-0.5 font-medium transition-colors ${variant === 'mascot' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🧙 Maskot
              </button>
            </div>
          )}
        </div>

        {/* ── GİZLİ İLERLEME BARI / REVEAL TETİK ── (KORUNDU) */}
        {ready ? (
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              ✨ Bir karakter senin için hazırlandı! Sihirli {variant === 'orb' ? 'küre' : 'maskot'} onu açığa
              çıkarmayı bekliyor. <span className="text-foreground/70">Ne çıkacağını kimse bilmiyor…</span>
            </p>
            <Button
              onClick={() => setRevealOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 motion-safe:animate-[pulse_2.2s_ease-in-out_infinite]"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Karakterini Aç
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              Yorumların gizemli bir koleksiyonu besliyor… <span className="font-semibold text-foreground">{bar?.remaining ?? '?'}</span> yorum
              daha, yeni bir karakter açığa çıkabilir. <span className="text-foreground/60">Hangi karakter? Sürpriz.</span>
            </p>
            {/* Gizemli merak-bar: akışkan renk + rozet yuvaları + kader küresi şarjı */}
            <div className="mt-3">
              <MysteryBar
                progress={bar?.progress ?? 0}
                current={bar?.current ?? 0}
                threshold={bar?.threshold ?? 6}
                ready={false}
              />
            </div>
          </div>
        )}

        {/* ── KOLEKSİYON VİTRİNİ ── */}
        {collection.length > 0 ? (
          <div className="mt-5 space-y-5 border-t border-border/50 pt-4">
            {orderedGroups.map((group) => (
              <CategorySection
                key={group.cat.key}
                category={group.cat}
                collected={group.stat?.collected ?? group.items.length}
                items={group.items}
                featuredBadgeId={featuredBadgeId}
                featuring={featuring}
                onFeature={setFeatured}
              />
            ))}
          </div>
        ) : (
          <EmptyShowcase />
        )}
      </div>

      {/* Sihirli reveal ekranı — açılınca POST atıp sürpriz açar */}
      <CharacterReveal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        variant={variant}
        fetchOnOpen
        onReveal={(revealed: NonNullable<RevealCharacter>) => {
          // Yeni karakter koleksiyona eklendi; kartı, barı ve vitrini tazele.
          void revealed;
          load();
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KATEGORİ BÖLÜMÜ — başlık (emoji + ad + "N karakter toplandı") + kart grid'i
// ─────────────────────────────────────────────────────────────────────────
function CategorySection({
  category,
  collected,
  items,
  featuredBadgeId,
  featuring,
  onFeature,
}: {
  category: Category;
  collected: number;
  items: Character[];
  featuredBadgeId: string | null;
  featuring: string | null;
  onFeature: (badgeId: string) => void;
}) {
  const accent = category.accent;
  return (
    <section>
      {/* Kategori başlığı — accent renkli sol şerit + emoji + ad + sayaç */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-lg ring-1"
          style={{ background: rgba(accent, 0.14), color: accent, boxShadow: `inset 0 0 0 1px ${rgba(accent, 0.3)}` }}
        >
          {category.emoji}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight" style={{ color: accent }}>
            {category.name}
          </p>
          {/* TOPLAM sayı GÖSTERİLMEZ — sadece kaç tane toplandığı (merak korunur). */}
          <p className="text-[11px] font-medium text-muted-foreground">
            {collected} karakter toplandı
          </p>
        </div>
      </div>

      {/* Kart grid'i — kazanılanlar + sabit 2 kilitli "???" (mobil uyumlu) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((c) => (
          <CharacterTile
            key={c.badgeId}
            character={c}
            accent={accent}
            isFeatured={featuredBadgeId === c.badgeId}
            featuringBusy={featuring === c.badgeId}
            featureDisabled={featuring !== null}
            onFeature={() => onFeature(c.badgeId)}
          />
        ))}
        {/* Kilitli "???" kartlar — kaç tane daha var BELLİ ETMEZ, merak uyandırır. */}
        {Array.from({ length: LOCKED_PER_CATEGORY }).map((_, i) => (
          <LockedTile key={`locked-${category.key}-${i}`} accent={accent} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KARAKTER KARTI — rozet görseli + ad + rarity çerçeve/parıltı + nadir % + tarih
// ─────────────────────────────────────────────────────────────────────────
function CharacterTile({
  character,
  accent,
  isFeatured,
  featuringBusy,
  featureDisabled,
  onFeature,
}: {
  character: Character;
  accent: string;
  isFeatured: boolean;
  featuringBusy: boolean;
  featureDisabled: boolean;
  onFeature: () => void;
}) {
  const theme = rarityTheme(character.rarity);
  const isLegendary = theme.key === 'legendary';
  const isEpic = theme.key === 'epic';
  const isRare = theme.key === 'rare';
  const date = shortDate(character.earnedAt);
  const pct = rateLabel(character.ratePct);

  // Çerçeve/parıltı: legendary=altın parıltı, epic=mor, rare=mavi, common=sade.
  // Ana karakter seçiliyse accent renkli vurgulu çerçeve öne çıkar.
  const frameStyle: CSSProperties = isFeatured
    ? { borderColor: rgba(accent, 0.7), boxShadow: `0 0 0 1px ${rgba(accent, 0.4)}, 0 0 18px ${rgba(accent, 0.28)}` }
    : theme.key === 'common'
      ? { borderColor: 'hsl(var(--border) / 0.6)' }
      : {
          borderColor: rgba(theme.glow, 0.5),
          boxShadow: `0 0 14px ${rgba(theme.glow, 0.16 + theme.intensity * 0.14)}`,
        };

  return (
    <button
      type="button"
      onClick={onFeature}
      disabled={featureDisabled || isFeatured}
      title={
        isFeatured
          ? 'Ana karakterin'
          : featureDisabled
            ? undefined
            : `${character.name} — ana karakter yap`
      }
      className={[
        'group relative flex flex-col items-center overflow-hidden rounded-2xl border bg-card/60 p-2.5 text-center backdrop-blur-sm transition-transform',
        isFeatured ? '' : 'motion-safe:hover:-translate-y-0.5',
        featureDisabled && !isFeatured ? 'cursor-wait' : isFeatured ? 'cursor-default' : 'cursor-pointer',
      ].join(' ')}
      style={frameStyle}
    >
      {/* Legendary/epic parıltı zemini — reduceMotion'da sabit (animasyon yok). */}
      {(isLegendary || isEpic) && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 opacity-60 ${isLegendary ? 'motion-safe:animate-[pulse_3s_ease-in-out_infinite]' : ''}`}
          style={{
            background: `radial-gradient(80% 60% at 50% 0%, ${rgba(theme.glow, 0.2)}, transparent 70%)`,
          }}
        />
      )}

      {/* Ana karakter rozeti (sağ üst) */}
      {isFeatured && (
        <span
          className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${accent}, ${rgba(accent, 0.75)})` }}
        >
          <Star className="h-2.5 w-2.5 fill-current" />
          ANA
        </span>
      )}

      {/* Rarity rozeti (sol üst) — common'da yok */}
      {theme.label && !isFeatured && (
        <span
          className="absolute left-1.5 top-1.5 z-10 rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider"
          style={{
            color: theme.glow,
            borderColor: rgba(theme.glow, 0.5),
            background: rgba(theme.glow, 0.12),
            textShadow: `0 0 8px ${rgba(theme.glow, 0.5)}`,
          }}
        >
          {theme.label}
        </span>
      )}

      {/* Rozet görseli — icon varsa next/image, yoksa kategori emoji.
          Rarity halkası: legendary altın (dönen), epic/rare renkli, common sade. */}
      <span className="relative mt-3 grid h-14 w-14 place-items-center">
        {theme.key !== 'common' && (
          <span
            aria-hidden="true"
            className={`absolute -inset-1 rounded-full blur-[3px] ${
              isLegendary ? 'motion-safe:animate-[spin_6s_linear_infinite]' : ''
            }`}
            style={{
              background: `conic-gradient(from 0deg, ${theme.glow}, ${theme.glow2}, #ffffff, ${theme.glow})`,
              opacity: isLegendary ? 0.55 : isEpic ? 0.4 : 0.28,
            }}
          />
        )}
        <span
          className="relative grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full ring-1"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${rgba('#ffffff', 0.85)}, ${rgba(theme.key === 'common' ? accent : theme.glow, 0.28)})`,
            boxShadow: `inset 0 1px 6px ${rgba('#ffffff', 0.4)}`,
          }}
        >
          {character.icon ? (
            <Image
              src={character.icon}
              alt={character.name}
              width={40}
              height={40}
              className="h-9 w-9 object-contain drop-shadow"
            />
          ) : (
            <span className="text-2xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
              {character.category?.emoji ?? '🎭'}
            </span>
          )}
        </span>
      </span>

      {/* Karakter adı */}
      <p className="mt-2 line-clamp-2 text-xs font-bold leading-tight text-foreground">
        {character.name}
      </p>

      {/* Kategori mini-etiketi */}
      {character.category && (
        <span className="mt-0.5 line-clamp-1 text-[10px] font-medium" style={{ color: accent }}>
          {character.category.emoji} {character.category.name}
        </span>
      )}

      {/* Alt satır: nadir % (varsa) + kazanım tarihi */}
      <div className="mt-1.5 flex w-full flex-wrap items-center justify-center gap-1">
        {pct !== null && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[9px] font-semibold"
            title={`Oyuncuların %${pct}'inde`}
            style={{
              color: isRare || isEpic || isLegendary ? theme.glow : '#eab308',
              borderColor: rgba(isRare || isEpic || isLegendary ? theme.glow : '#eab308', 0.4),
              background: rgba(isRare || isEpic || isLegendary ? theme.glow : '#eab308', 0.1),
            }}
          >
            <Trophy className="h-2.5 w-2.5" />%{pct}
          </span>
        )}
        {date && <span className="text-[9px] text-muted-foreground/70">{date}</span>}
      </div>

      {/* "Ana karakter yap" ipucu — hover'da beliren alt şerit (seçili değilse) */}
      {!isFeatured && (
        <span
          className={`mt-1.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold transition-opacity ${
            featuringBusy ? 'opacity-100' : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
          style={{ color: accent, background: rgba(accent, 0.1) }}
        >
          <Star className="h-2.5 w-2.5" />
          {featuringBusy ? 'Ayarlanıyor…' : 'Ana karakter yap'}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KİLİTLİ "???" KARTI — soluk, ❓; ad/görsel ASLA gösterilmez (merak).
// ─────────────────────────────────────────────────────────────────────────
function LockedTile({ accent }: { accent: string }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/25 p-2.5 text-center opacity-70"
      title="Henüz keşfedilmedi"
      aria-label="Henüz keşfedilmemiş karakter"
    >
      <span
        className="mt-3 grid h-14 w-14 place-items-center rounded-full"
        style={{ background: rgba(accent, 0.06) }}
      >
        <Lock className="h-5 w-5 text-muted-foreground/50" />
      </span>
      <p className="mt-2 text-xs font-bold tracking-widest text-muted-foreground/60">???</p>
      <span className="mt-0.5 text-[10px] font-medium text-muted-foreground/50">Henüz keşfedilmedi</span>
      <span className="mt-1.5 text-[9px] text-muted-foreground/40">Daha fazlası seni bekliyor</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOŞ DURUM — hiç karakter yoksa güzel bir davet mesajı (bar zaten üstte).
// ─────────────────────────────────────────────────────────────────────────
function EmptyShowcase() {
  // Basit dekoratif "gizli koleksiyon" ipucu — 3 soluk "???" yuvası.
  return (
    <div className="mt-5 flex flex-col items-center gap-3 border-t border-border/50 pt-5 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-3xl">🎭</span>
      <div>
        <p className="text-sm font-bold text-foreground">İlk karakterini keşfetmek üzeresin…</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Yorumların gizli kategorilerde karakter rozetleri kazandırır. Barı doldur, sürprizini aç.
        </p>
      </div>
      <div className="mt-1 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <span
            key={i}
            className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-border/60 bg-card/25 text-muted-foreground/50"
          >
            <Lock className="h-4 w-4" />
          </span>
        ))}
      </div>
    </div>
  );
}
