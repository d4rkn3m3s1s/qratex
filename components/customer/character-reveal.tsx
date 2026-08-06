'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Wand2, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * KARAKTER ROZETİ REVEAL — göz alıcı, sinematik "sürpriz açığa çıkarma" modalı.
 *
 * Kullanıcı NE kazanacağını önceden bilmez: bar dolunca veya "Karakterimi Keşfet"e
 * basınca bu tam ekran modal açılır, gizemli bir hazırlanma animasyonu oynar
 * (Harry Potter seçmen şapkası / kader küresi hissi), sonra rozet ışık patlamasıyla
 * belirir + AI'ın yazdığı "neden bu rozeti aldın" açıklaması gösterilir.
 *
 * İki varyant vardır (`variant` prop'u seçer): 'orb' (sihirli kader küresi) ve
 * 'mascot' (kapüşonlu büyücü maskotu). İkisi de tamamen canvas/CSS ile prosedürel;
 * harici görsel/asset YOKTUR (rozet ikonu opsiyonel next/image ile).
 */

// ── Tipler ───────────────────────────────────────────────────────────
export type RevealCategory = {
  key: string;
  name: string;
  emoji: string;
  accent: string;
  description: string;
};

export type RevealCharacter = {
  badgeId: string;
  name: string;
  why?: string;
  icon?: string;
  description?: string;
  category?: RevealCategory | null;
} | null;

export interface CharacterRevealProps {
  /** Modal açık mı? */
  open: boolean;
  /** Kapatma isteği (Esc, backdrop, kapat butonu). */
  onClose: () => void;
  /** Reveal tamamlandığında (rozet göründüğünde) bir kez çağrılır — dış state tazelemek için. */
  onReveal?: (character: NonNullable<RevealCharacter>) => void;
  /** Görsel varyant. Kullanıcı hangisini beğendiğine karar verecek. */
  variant?: 'orb' | 'mascot';
  /** Zaten elde bir karakter varsa doğrudan verilebilir (fetch yapılmaz). */
  character?: RevealCharacter;
  /** true ise açılınca POST /api/customer/character çağrılır; sonuç beklenirken "hazırlanıyor" oynar. */
  fetchOnOpen?: boolean;
}

// ── Yardımcı: değişen gizemli hazırlanma yazıları ─────────────────────
const PREPARING_LINES = [
  'Kaderin okunuyor…',
  'Yorumların fısıldıyor…',
  'Yıldızlar hizalanıyor…',
  'Ruhun eşleştiriliyor…',
  'Karakterin şekilleniyor…',
];

// Aşama makinesi.
type Phase = 'preparing' | 'category' | 'reveal' | 'details';

/** Hex rengi rgba string'e çevirir (canvas glow'ları için). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(147,51,234,${alpha})`; // güvenli mor fallback
  return `rgba(${r},${g},${b},${alpha})`;
}

const DEFAULT_ACCENT = '#9333ea'; // sistem primary morumsu — kategori gelene kadar

export function CharacterReveal({
  open,
  onClose,
  onReveal,
  variant = 'orb',
  character: characterProp = null,
  fetchOnOpen = false,
}: CharacterRevealProps) {
  const [phase, setPhase] = useState<Phase>('preparing');
  const [character, setCharacter] = useState<RevealCharacter>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineIdx, setLineIdx] = useState(0);

  // reduceMotion gövdede hesaplanır (koşulsuz), böylece hook sırası bozulmaz.
  const reduceMotion = typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Konfeti opsiyonel — provider yoksa hata vermesin diye dinamik import edilir.
  const fireCelebration = useCallback(() => {
    if (reduceMotion) return;
    import('@/components/providers/confetti-provider')
      .then(() => import('canvas-confetti'))
      .then((m) => {
        const confetti = m.default;
        const accent = character?.category?.accent ?? DEFAULT_ACCENT;
        confetti({
          particleCount: 120, spread: 90, startVelocity: 42, origin: { y: 0.42 },
          colors: [accent, '#ffffff', '#facc15', '#c084fc'], scalar: 1.05,
        });
        setTimeout(() => confetti({
          particleCount: 60, spread: 120, startVelocity: 30, origin: { y: 0.5 },
          colors: [accent, '#ffffff'], shapes: ['star'], scalar: 1.2,
        }), 160);
      })
      .catch(() => { /* konfeti yoksa sorun değil */ });
  }, [character, reduceMotion]);

  // Aktif kategori (aşama 2+'de kullanılır). Yoksa varsayılan tema.
  const accent = character?.category?.accent ?? DEFAULT_ACCENT;
  const categoryReady = phase === 'category' || phase === 'reveal' || phase === 'details';

  // ── Açılış efekti: state'i sıfırla, veriyi getir, aşamaları ilerlet ──
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setPhase('preparing');
    setError(null);
    setLineIdx(0);

    // Hazırlanma yazılarını döndür.
    const lineTimer = setInterval(() => {
      if (!cancelled) setLineIdx((i) => (i + 1) % PREPARING_LINES.length);
    }, reduceMotion ? 2600 : 1500);

    // Aşamaları sinematik biçimde ilerleten fonksiyon (veri hazır olunca).
    const runReveal = (data: NonNullable<RevealCharacter>) => {
      if (cancelled) return;
      setCharacter(data);
      // aşama 2: kategori belli — küre/maskot kategori rengine bürünür.
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setPhase('category');
        // aşama 3: REVEAL — rozet ışık patlamasıyla belirir + konfeti.
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setPhase('reveal');
          fireCelebration();
          onReveal?.(data);
          // aşama 4: açıklama.
          timers.push(setTimeout(() => {
            if (!cancelled) setPhase('details');
          }, reduceMotion ? 600 : 1200));
        }, reduceMotion ? 700 : 1600));
      }, reduceMotion ? 500 : 1100));
    };

    if (characterProp) {
      // Elde veri var — yine de kısa bir "hazırlanma" gösterip sürpriz hissini koru.
      timers.push(setTimeout(() => runReveal(characterProp), reduceMotion ? 500 : 2000));
    } else if (fetchOnOpen) {
      // Sürpriz için mükemmel: POST atıp beklerken "hazırlanıyor" oynar.
      const startedAt = Date.now();
      fetch('/api/customer/character', { method: 'POST' })
        .then((r) => r.json())
        .then((res: { success?: boolean; character?: NonNullable<RevealCharacter>; error?: string }) => {
          if (cancelled) return;
          if (!res?.success || !res.character) {
            setError(res?.error || 'Karakterin şu an belirlenemedi, sonra tekrar dene.');
            return;
          }
          // En az ~2.2sn hazırlanma göster (çok hızlı dönerse sürpriz kaçmasın).
          const elapsed = Date.now() - startedAt;
          const wait = Math.max(0, (reduceMotion ? 600 : 2200) - elapsed);
          timers.push(setTimeout(() => runReveal(res.character as NonNullable<RevealCharacter>), wait));
        })
        .catch(() => {
          if (!cancelled) setError('Bağlantı hatası — karakterin belirlenemedi.');
        });
    } else {
      setError('Gösterilecek karakter yok.');
    }

    return () => {
      cancelled = true;
      clearInterval(lineTimer);
      timers.forEach(clearTimeout);
    };
    // fireCelebration/onReveal referansları kararlı; open + kaynak propları tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, characterProp, fetchOnOpen, reduceMotion]);

  // ── Esc ile kapat ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Karakter rozeti keşfi"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-xl"
          style={{
            // Kategori rengine hafifçe boyanan koyu radyal overlay.
            background: `radial-gradient(120% 120% at 50% 35%, ${hexToRgba(accent, 0.22)} 0%, rgba(6,8,18,0.9) 55%, rgba(2,4,10,0.96) 100%)`,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="relative w-full max-w-lg my-4 rounded-3xl border border-white/15 bg-white/[0.03] p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kapat butonu */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Kapat"
              className="absolute right-3 top-3 z-30 rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>

            {error ? (
              <ErrorState message={error} onClose={onClose} />
            ) : (
              <div className="flex flex-col items-center text-center">
                {/* SAHNE: küre veya maskot (aşama 1-3) */}
                <RevealStage
                  variant={variant}
                  accent={accent}
                  categoryReady={categoryReady}
                  revealed={phase === 'reveal' || phase === 'details'}
                  character={character}
                  reduceMotion={reduceMotion}
                />

                {/* METİN KATMANI: aşamaya göre değişir */}
                <div className="mt-6 min-h-[132px] w-full">
                  <AnimatePresence mode="wait">
                    {phase === 'preparing' && (
                      <PreparingText key="prep" line={PREPARING_LINES[lineIdx]} />
                    )}
                    {phase === 'category' && character?.category && (
                      <CategoryText key="cat" category={character.category} />
                    )}
                    {(phase === 'reveal' || phase === 'details') && character && (
                      <DetailsText
                        key="details"
                        character={character}
                        accent={accent}
                        showWhy={phase === 'details'}
                        onClose={onClose}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Hata durumu ──────────────────────────────────────────────────────
function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-3xl">🔮</div>
      <p className="max-w-xs text-sm text-white/80">{message}</p>
      <Button variant="secondary" onClick={onClose}>Kapat</Button>
    </div>
  );
}

// ── Aşama 1 metni: değişen gizemli yazı ──────────────────────────────
function PreparingText({ line }: { line: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2"
    >
      <p className="flex items-center gap-2 text-lg font-semibold text-white/90">
        <Wand2 className="h-4 w-4 animate-pulse text-white/70" />
        {line}
      </p>
      <p className="text-xs text-white/50">Rozetin hazırlanıyor, biraz bekle…</p>
    </motion.div>
  );
}

// ── Aşama 2 metni: kategori belli ────────────────────────────────────
function CategoryText({ category }: { category: RevealCategory }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-2"
    >
      <span className="text-xs uppercase tracking-[0.25em] text-white/50">Kategorin belirlendi</span>
      <p
        className="flex items-center gap-2 text-2xl font-bold"
        style={{ color: category.accent }}
      >
        <span className="text-3xl">{category.emoji}</span>
        {category.name}
      </p>
    </motion.div>
  );
}

// ── Aşama 3-4 metni: rozet adı + kategori + AI açıklaması ─────────────
function DetailsText({
  character,
  accent,
  showWhy,
  onClose,
}: {
  character: NonNullable<RevealCharacter>;
  accent: string;
  showWhy: boolean;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-3"
    >
      {character.category && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold"
          style={{
            color: character.category.accent,
            borderColor: hexToRgba(character.category.accent, 0.5),
            backgroundColor: hexToRgba(character.category.accent, 0.12),
          }}
        >
          <span>{character.category.emoji}</span>
          {character.category.name}
        </span>
      )}

      <h2
        className="text-3xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-4xl"
        style={{ textShadow: `0 0 24px ${hexToRgba(accent, 0.5)}` }}
      >
        {character.name}
      </h2>

      {character.description && (
        <p className="max-w-sm text-sm text-white/70">{character.description}</p>
      )}

      {/* AI'ın "neden bu rozeti aldın" açıklaması */}
      <AnimatePresence>
        {showWhy && character.why && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full overflow-hidden"
          >
            <div
              className="mt-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left"
              style={{ boxShadow: `inset 0 1px 0 ${hexToRgba(accent, 0.15)}` }}
            >
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
                <Sparkles className="h-3.5 w-3.5" />
                Bu rozeti aldın çünkü
              </p>
              <p className="text-sm leading-relaxed text-white/85">{character.why}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showWhy && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', delay: 0.25, damping: 18 }}
          className="mt-2"
        >
          <Button
            onClick={onClose}
            className="gap-2 text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.7)})` }}
          >
            <PartyPopper className="h-4 w-4" />
            Harika!
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── SAHNE: varyantı ve rozet ikonunu barındıran kap ──────────────────
function RevealStage({
  variant,
  accent,
  categoryReady,
  revealed,
  character,
  reduceMotion,
}: {
  variant: 'orb' | 'mascot';
  accent: string;
  categoryReady: boolean;
  revealed: boolean;
  character: RevealCharacter;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative grid h-56 w-56 place-items-center sm:h-64 sm:w-64">
      {/* Prosedürel canvas sahne (küre veya maskot) — reveal sonrası solar */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: revealed ? 0.35 : 1, scale: revealed ? 1.08 : 1 }}
        transition={{ duration: 0.6 }}
      >
        {variant === 'orb' ? (
          <OrbCanvas accent={accent} categoryReady={categoryReady} reduceMotion={reduceMotion} />
        ) : (
          <MascotCanvas accent={accent} categoryReady={categoryReady} reduceMotion={reduceMotion} />
        )}
      </motion.div>

      {/* Rozet — reveal anında ışık patlamasıyla belirir */}
      <AnimatePresence>
        {revealed && (
          <RevealedBadge accent={accent} character={character} reduceMotion={reduceMotion} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reveal edilen rozet (emoji fallback + opsiyonel ikon) ────────────
function RevealedBadge({
  accent,
  character,
  reduceMotion,
}: {
  accent: string;
  character: RevealCharacter;
  reduceMotion: boolean;
}) {
  const emoji = character?.category?.emoji || '🎭';
  return (
    <motion.div
      className="relative z-10 grid place-items-center"
      initial={{ scale: 0, rotate: reduceMotion ? 0 : -25, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 12, stiffness: 200 }}
    >
      {/* Işık patlaması halkaları */}
      {!reduceMotion && (
        <>
          <motion.span
            className="absolute rounded-full"
            style={{ border: `2px solid ${hexToRgba(accent, 0.7)}` }}
            initial={{ width: 40, height: 40, opacity: 0.9 }}
            animate={{ width: 240, height: 240, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute rounded-full"
            style={{ border: `1px solid ${hexToRgba('#ffffff', 0.6)}` }}
            initial={{ width: 40, height: 40, opacity: 0.8 }}
            animate={{ width: 180, height: 180, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
          />
        </>
      )}

      {/* Rarity-benzeri dönen altın/renk halkası */}
      <motion.div
        className="absolute -inset-3 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, ${accent}, #facc15, #ffffff, ${accent})`,
          filter: 'blur(6px)', opacity: 0.55,
        }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />

      {/* Rozet gövdesi */}
      <div
        className="relative grid h-28 w-28 place-items-center rounded-full ring-2 sm:h-32 sm:w-32"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${hexToRgba('#ffffff', 0.9)}, ${hexToRgba(accent, 0.35)})`,
          boxShadow: `0 0 40px ${hexToRgba(accent, 0.7)}, inset 0 2px 12px rgba(255,255,255,0.5)`,
        }}
      >
        {character?.icon ? (
          <Image
            src={character.icon}
            alt={character.name}
            width={96}
            height={96}
            className="h-20 w-20 object-contain drop-shadow sm:h-24 sm:w-24"
          />
        ) : (
          <span className="text-5xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] sm:text-6xl">{emoji}</span>
        )}
      </div>

      {/* Parıltı süsü */}
      {!reduceMotion && (
        <motion.div
          className="absolute -right-1 -top-1 z-20"
          animate={{ rotate: 360, scale: [1, 1.25, 1] }}
          transition={{ rotate: { duration: 5, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.6, repeat: Infinity } }}
        >
          <Sparkles className="h-7 w-7" style={{ color: '#facc15', filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.6))' }} />
        </motion.div>
      )}
    </motion.div>
  );
}

// ── VARYANT 1: ORB (sihirli kader küresi) — canvas ───────────────────
function OrbCanvas({
  accent,
  categoryReady,
  reduceMotion,
}: {
  accent: string;
  categoryReady: boolean;
  reduceMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Animasyon içinde okunacak canlı değerler ref'te tutulur (kapanışta stale kalmasın).
  // Render'da DEĞİL, effect'te senkronlanır (react-hooks/refs kuralı).
  const accentRef = useRef(accent);
  const readyRef = useRef(categoryReady);
  useEffect(() => {
    accentRef.current = accent;
    readyRef.current = categoryReady;
  }, [accent, categoryReady]);

  // Yörünge parçacıklarını yalnızca bir kez üret (render'da RNG çağırmayız).
  const orbits = useMemo(
    () => Array.from({ length: reduceMotion ? 10 : 22 }, (_, i) => ({
      a: (i / 22) * Math.PI * 2,
      r: 78 + (i % 5) * 8,
      speed: 0.004 + (i % 4) * 0.0016,
      size: 1 + (i % 3) * 0.7,
      tilt: 0.42, // satürn halkası eğimi
      phase: i,
    })),
    [reduceMotion],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;
    const cx = () => W / 2;
    const cy = () => H / 2;

    const draw = () => {
      t += reduceMotion ? 0.006 : 0.016;
      ctx.clearRect(0, 0, W, H);
      const col = accentRef.current;
      const R = Math.min(W, H) * 0.26; // küre yarıçapı
      const x = cx(), y = cy();

      // Dış aura (kategori gelince güçlenir)
      const auraStrength = readyRef.current ? 0.5 : 0.28;
      const aura = ctx.createRadialGradient(x, y, R * 0.4, x, y, R * 2.1);
      aura.addColorStop(0, hexToRgba(col, auraStrength));
      aura.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, W, H);

      // SATÜRN HALKASI — eğik dönen ışık halkası
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(reduceMotion ? 0.5 : t * 0.5);
      ctx.scale(1, orbits[0]?.tilt ?? 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.55, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(col, readyRef.current ? 0.75 : 0.4);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.8, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba('#ffffff', 0.18);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // Yörünge parçacıkları (eğik düzlemde döner)
      for (const p of orbits) {
        const ang = reduceMotion ? p.a : p.a + t * p.speed * 60;
        const px = x + Math.cos(ang) * (R * 1.55);
        const py = y + Math.sin(ang) * (R * 1.55) * p.tilt;
        const depth = (Math.sin(ang) + 1) / 2; // arkadaki soluk
        ctx.beginPath();
        ctx.arc(px, py, p.size * (0.6 + depth * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(depth > 0.5 ? '#ffffff' : col, 0.3 + depth * 0.6);
        ctx.fill();
      }

      // KÜRE gövdesi — cam küre + içinde dönen sis/enerji
      // Alt gölge/derinlik
      const body = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.15, x, y, R);
      body.addColorStop(0, hexToRgba('#ffffff', 0.95));
      body.addColorStop(0.4, hexToRgba(col, readyRef.current ? 0.75 : 0.45));
      body.addColorStop(1, hexToRgba(col, 0.15));
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();

      // İç dönen sis (clip ile küre içinde)
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, R * 0.96, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 3; i++) {
        const a = t * (0.6 + i * 0.4) + i * 2.1;
        const mx = x + Math.cos(a) * R * 0.35;
        const my = y + Math.sin(a * 1.3) * R * 0.35;
        const mist = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.7);
        mist.addColorStop(0, hexToRgba(i % 2 ? '#ffffff' : col, 0.32));
        mist.addColorStop(1, hexToRgba(col, 0));
        ctx.fillStyle = mist;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
      ctx.restore();

      // Cam highlight
      ctx.beginPath();
      ctx.ellipse(x - R * 0.32, y - R * 0.4, R * 0.28, R * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba('#ffffff', 0.55);
      ctx.fill();

      // Kenar ışık halkası
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba('#ffffff', 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [orbits, reduceMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}

// ── VARYANT 2: MASCOT (kapüşonlu büyücü silüeti) — canvas ─────────────
function MascotCanvas({
  accent,
  categoryReady,
  reduceMotion,
}: {
  accent: string;
  categoryReady: boolean;
  reduceMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Canlı değerler effect'te senkronlanır (render'da ref yazma yok — react-hooks/refs).
  const accentRef = useRef(accent);
  const readyRef = useRef(categoryReady);
  useEffect(() => {
    accentRef.current = accent;
    readyRef.current = categoryReady;
  }, [accent, categoryReady]);

  // Büyücünün önünde dönen parçacıklar (bir kez üret).
  const sparks = useMemo(
    () => Array.from({ length: reduceMotion ? 8 : 18 }, (_, i) => ({
      a: (i / 18) * Math.PI * 2,
      r: 26 + (i % 4) * 7,
      speed: 0.01 + (i % 3) * 0.006,
      size: 1 + (i % 3) * 0.8,
      phase: i * 0.7,
    })),
    [reduceMotion],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;

    const draw = () => {
      t += reduceMotion ? 0.006 : 0.02;
      ctx.clearRect(0, 0, W, H);
      const col = accentRef.current;
      const cx = W / 2;
      // Nefes/yüzme: hafif dikey salınım (idle animasyon)
      const bob = reduceMotion ? 0 : Math.sin(t * 1.1) * 5;
      const cy = H / 2 + bob;
      const S = Math.min(W, H) / 240; // ölçek faktörü

      // Zemin glow
      const glow = ctx.createRadialGradient(cx, cy + 70 * S, 10, cx, cy + 70 * S, 90 * S);
      glow.addColorStop(0, hexToRgba(col, readyRef.current ? 0.4 : 0.22));
      glow.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // ── KAPÜŞONLU BÜYÜCÜ SİLÜETİ ────────────────────────────────
      // Cübbe gövdesi (trapez + yayvan etek)
      ctx.save();
      ctx.translate(cx, cy);
      const robe = ctx.createLinearGradient(0, -60 * S, 0, 80 * S);
      robe.addColorStop(0, hexToRgba(col, readyRef.current ? 0.9 : 0.6));
      robe.addColorStop(1, hexToRgba('#0b1020', 0.92));
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.moveTo(-16 * S, -46 * S);          // sol omuz
      ctx.quadraticCurveTo(-52 * S, 40 * S, -46 * S, 78 * S); // sol etek
      ctx.quadraticCurveTo(0, 92 * S, 46 * S, 78 * S);        // etek tabanı
      ctx.quadraticCurveTo(52 * S, 40 * S, 16 * S, -46 * S);  // sağ omuz
      ctx.quadraticCurveTo(0, -58 * S, -16 * S, -46 * S);     // omuz üstü
      ctx.closePath();
      ctx.fill();

      // Kapüşon (baş bölgesi)
      ctx.beginPath();
      ctx.moveTo(-20 * S, -44 * S);
      ctx.quadraticCurveTo(0, -90 * S, 20 * S, -44 * S);
      ctx.quadraticCurveTo(0, -60 * S, -20 * S, -44 * S);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(col, readyRef.current ? 0.95 : 0.7);
      ctx.fill();

      // Kapüşon iç karanlığı (yüz yok — gizem)
      ctx.beginPath();
      ctx.ellipse(0, -52 * S, 12 * S, 15 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(4,6,14,0.95)';
      ctx.fill();

      // İki parlayan göz (kategori gelince accent, öncesi soluk)
      const eyeCol = readyRef.current ? col : '#8891b0';
      for (const dx of [-4.5 * S, 4.5 * S]) {
        ctx.beginPath();
        ctx.arc(dx, -52 * S, 1.9 * S, 0, Math.PI * 2);
        ctx.fillStyle = eyeCol;
        ctx.shadowColor = eyeCol;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // ── Önünde hazırlanan enerji topu + dönen parçacıklar ───────
      const ex = cx, ey = cy + 6 * S;
      // Enerji topu
      const ball = ctx.createRadialGradient(ex, ey, 0, ex, ey, 22 * S);
      ball.addColorStop(0, hexToRgba('#ffffff', readyRef.current ? 0.95 : 0.55));
      ball.addColorStop(0.5, hexToRgba(col, 0.7));
      ball.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(ex, ey, 22 * S, 0, Math.PI * 2);
      ctx.fill();

      // Yörüngedeki parçacıklar
      for (const p of sparks) {
        const ang = reduceMotion ? p.a : p.a + t * p.speed * 60;
        const rr = p.r * S * (0.9 + Math.sin(t + p.phase) * 0.12);
        const px = ex + Math.cos(ang) * rr;
        const py = ey + Math.sin(ang) * rr * 0.7;
        ctx.beginPath();
        ctx.arc(px, py, p.size * S, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba((p.phase | 0) % 2 ? '#ffffff' : col, 0.7);
        ctx.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [sparks, reduceMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
