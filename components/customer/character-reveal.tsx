'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { m as Motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { Sparkles, X, Wand2, PartyPopper, Share2, Crown, Gem } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shareCharacter } from '@/components/customer/character-share-card';
import { categoryRevealTheme, badgeTier, LEGENDARY_OVERLAY, RARE_OVERLAY } from '@/lib/character-reveal-theme';
import { getCharacterRevealText } from '@/lib/character-reveal-texts';

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
  /** Nadirlik seviyesi — reveal görkemini belirler (çoğu karakter epic/legendary). */
  rarity?: string;
  /** Bu rozet kaç kullanıcıda var. */
  holders?: number;
  /** Kullanıcıların yüzde kaçında (nadir göstergesi). null ise gösterilmez. */
  ratePct?: number | null;
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

/**
 * SÜRPRİZ DÖNGÜSÜ: kategori belli olmadan önce kürede sırayla dönen renkler.
 * Tüm kategorileri kapsar (kırmızı=dram, sarı=komedi, mor=fantastik, mavi=gizem,
 * yeşil=gizemli) → kullanıcı kazandığı kategoriyi renkten önceden anlayamaz.
 */
const CYCLE_ACCENTS = ['#dc2626', '#f59e0b', '#8b5cf6', '#0ea5e9', '#10b981'];

// ── Nadirlik (rarity) teması ─────────────────────────────────────────
/**
 * Her rarity için görkem profili. `glow` kategori renginden BAĞIMSIZ bir ışık
 * rengidir; ikisi birlikte katmanlanır. `intensity` parçacık/konfeti/god-ray
 * yoğunluğunu ölçeklendirir (0-1). `shake` reveal patlamasında ekran sarsılması.
 */
type RarityTheme = {
  key: 'common' | 'rare' | 'epic' | 'legendary';
  label: string | null;   // "EFSANEVİ" etiketi (yalnız özel rozetlerde)
  glow: string;           // ana ışık rengi (kategori accent'i; efsaneviyse altın)
  glow2: string;          // ikincil ton (huzme geçişi için)
  intensity: number;      // 0-1 görkem ölçeği
  shake: number;          // reveal sarsılma genliği (px)
  rays: number;           // god-ray huzme sayısı (0 = kapalı)
  tagline: string;        // kategori üst başlığı ("TANIKLIK KAYDA GEÇTİ" vb.)
  particles: string[];    // konfeti/parçacık paleti
};

/**
 * KATEGORİ ODAKLI TEMA (yeni sistem): açılışın kimliği artık kategoridir
 * (dram=kırmızı, komedi=sarı, fantastik=mor, gizem=mavi, gizemli=yeşil).
 * EFSANEVİ yalnız `LEGENDARY_BADGE_IDS` listesindeki rozetlerde, kategori renginin
 * ÜSTÜNE altın bir katman olarak eklenir — kategori kimliğini ezmez.
 */
function buildTheme(categoryKey?: string | null, badgeId?: string | null): RarityTheme {
  const cat = categoryRevealTheme(categoryKey);
  const tier = badgeTier(badgeId); // puandan gelir: 10000→legendary, 5000→rare, 2500→common
  const legendary = tier === 'legendary';
  const rare = tier === 'rare';
  return {
    key: legendary ? 'legendary' : rare ? 'rare' : 'common',
    // Etiket: EFSANEVİ / NADİR (YAYGIN'da etiket yok — sade kalsın).
    label: legendary ? LEGENDARY_OVERLAY.label : rare ? RARE_OVERLAY.label : null,
    // RENK HER ZAMAN KATEGORİDEN gelir: gizemli rozet YEŞİL açılır, efsanevi olsa bile
    // sarıya dönmez. Efsanevilik renkten DEĞİL, ayrı bir görsel dilden anlaşılır
    // (taç ikonu + "EFSANEVİ" ibaresi + daha yoğun huzme/parçacık/sarsıntı).
    glow: cat.accent,
    glow2: cat.accent2,
    intensity: Math.min(
      1,
      cat.intensity + (legendary ? LEGENDARY_OVERLAY.intensityBoost : rare ? RARE_OVERLAY.intensityBoost : 0)
    ),
    shake: cat.shake + (legendary ? LEGENDARY_OVERLAY.extraShake : rare ? RARE_OVERLAY.extraShake : 0),
    rays: cat.rays + (legendary ? LEGENDARY_OVERLAY.extraRays : rare ? RARE_OVERLAY.extraRays : 0),
    tagline: cat.tagline,
    // Parçacıklar da kategori paletinde kalır (altın karışmaz); efsanevilik yoğunlukla belli olur.
    particles: cat.particles,
  };
}

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

  // Ekran sarsılması tetikleyicisi (reveal patlamasında kısa titreşim).
  const [shakeKey, setShakeKey] = useState(0);
  // Modal içeriğine uygulanan sarsılma kontrolü (giriş spring'iyle çakışmaz — ayrı katman).
  const shakeControls = useAnimationControls();

  // reduceMotion gövdede hesaplanır (koşulsuz), böylece hook sırası bozulmaz.
  const reduceMotion = typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Aktif rarity teması (kategori renginden bağımsız görkem profili).
  const theme = buildTheme(character?.category?.key, character?.badgeId);

  // Konfeti opsiyonel — provider yoksa hata vermesin diye dinamik import edilir.
  // Rarity'ye göre ölçeklenir: legendary'de daha çok + altın ağırlıklı.
  const fireCelebration = useCallback(() => {
    if (reduceMotion) return;
    const rt = buildTheme(character?.category?.key, character?.badgeId);
    import('@/components/providers/confetti-provider')
      .then(() => import('canvas-confetti'))
      .then((m) => {
        const confetti = m.default;
        // Konfeti paleti KATEGORİDEN gelir (dram=kırmızı, komedi=sarı, …);
        // efsaneviyse altın tonlar listenin başına eklenmiş olur (buildTheme).
        const baseColors = rt.particles;
        const scale = 0.85 + rt.intensity * 0.5; // ~1.05 → 1.35
        confetti({
          particleCount: Math.round(120 * (0.7 + rt.intensity * 0.9)),
          spread: 90, startVelocity: 42, origin: { y: 0.42 },
          colors: baseColors, scalar: scale,
        });
        setTimeout(() => confetti({
          particleCount: Math.round(60 * (0.7 + rt.intensity)),
          spread: 130, startVelocity: 32, origin: { y: 0.5 },
          colors: [rt.glow, '#ffffff'], shapes: ['star'], scalar: scale + 0.15,
        }), 160);
        // Legendary/epic'te iki yandan altın/renk fışkırması — büyük an.
        if (rt.intensity >= 0.75) {
          setTimeout(() => {
            confetti({ particleCount: 55, angle: 60, spread: 70, startVelocity: 45, origin: { x: 0, y: 0.6 }, colors: baseColors, scalar: scale });
            confetti({ particleCount: 55, angle: 120, spread: 70, startVelocity: 45, origin: { x: 1, y: 0.6 }, colors: baseColors, scalar: scale });
          }, 320);
        }
      })
      .catch(() => { /* konfeti yoksa sorun değil */ });
  }, [character, reduceMotion]);

  // Reveal anında görkem paketi: konfeti + ses + (rarity yüksekse) ekran sarsılması.
  const fireReveal = useCallback(() => {
    fireCelebration();
    if (reduceMotion) return;
    const rt = buildTheme(character?.category?.key, character?.badgeId);
    // Ses opsiyonel — altyapı yoksa/hata olursa sessizce geç.
    import('@/lib/game-sounds')
      .then((m) => { m.sfxReveal?.(); if (rt.intensity >= 0.75) m.haptic?.([18, 40, 24]); })
      .catch(() => { /* ses yoksa sorun değil */ });
    // Sarsılma yalnızca common dışında (shake > 0).
    if (rt.shake > 0) setShakeKey((k) => k + 1);
  }, [fireCelebration, character, reduceMotion]);

  // Aktif kategori (aşama 2+'de kullanılır). Yoksa varsayılan tema.
  const finalAccent = character?.category?.accent ?? DEFAULT_ACCENT;
  const categoryReady = phase === 'category' || phase === 'reveal' || phase === 'details';
  const revealed = phase === 'reveal' || phase === 'details';

  // ── SÜRPRİZ RENK DÖNGÜSÜ ──────────────────────────────────────────
  // Hazırlanma aşamasında küre TÜM kategori renklerini sırayla dolaşır
  // (kırmızı→sarı→mor→mavi→yeşil…), böylece kullanıcı hangi kategoriyi
  // kazandığını renkten ÖNCEDEN anlayamaz. Kategori belli olunca (categoryReady)
  // döngü durur ve gerçek renge oturur.
  const [cycleIdx, setCycleIdx] = useState(0);
  useEffect(() => {
    if (categoryReady || reduceMotion) return; // kategori belli → döngü yok
    const id = setInterval(() => setCycleIdx((i) => i + 1), 420);
    return () => clearInterval(id);
  }, [categoryReady, reduceMotion]);

  // Küre/maskot rengi: kategori belli değilse döngüdeki renk, belliyse gerçek renk.
  const accent = categoryReady
    ? finalAccent
    : CYCLE_ACCENTS[cycleIdx % CYCLE_ACCENTS.length];

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
          fireReveal();
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
    // fireReveal/onReveal referansları kararlı; open + kaynak propları tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, characterProp, fetchOnOpen, reduceMotion]);

  // ── Esc ile kapat ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ── Ekran sarsılması: shakeKey artınca ~300ms hafif x/y titreşim ───
  // Ayrı bir sarmalayıcı katmana uygulanır; dış modalın giriş spring'ini bozmaz.
  useEffect(() => {
    if (shakeKey === 0 || reduceMotion) return;
    const amp = theme.shake;
    if (amp <= 0) return;
    // Sönümlenen titreşim keyframe'leri (abartısız, ~300ms).
    shakeControls.start({
      x: [0, -amp, amp, -amp * 0.7, amp * 0.5, -amp * 0.3, 0],
      y: [0, amp * 0.5, -amp * 0.6, amp * 0.4, -amp * 0.25, amp * 0.15, 0],
      transition: { duration: 0.32, ease: 'easeOut' },
    }).catch(() => { /* animasyon iptali sorun değil */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey, reduceMotion]);

  return (
    <AnimatePresence>
      {open && (
        <Motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Karakter rozeti keşfi"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          // DİKKAT: `flex items-center` + `overflow-y-auto` birlikte, içerik ekrandan uzun
          // olduğunda üst kısmı ERİŞİLEMEZ kılar (bilinen flexbox+scroll tuzağı).
          // Çözüm: dış kap sadece kaydırır; ortalama içteki `min-h-full flex` sarmalında,
          // çocukta `my-auto` ile yapılır → kısa içerik ortalanır, uzun içerik üstten kesilmez.
          className="fixed inset-0 z-[60] overflow-y-auto backdrop-blur-xl"
          style={{
            // Kategori rengi + rarity ışığı birlikte katmanlanan koyu radyal overlay.
            background: `radial-gradient(120% 120% at 50% 30%, ${hexToRgba(theme.glow, revealed ? 0.2 : 0.1)} 0%, transparent 45%), radial-gradient(120% 120% at 50% 35%, ${hexToRgba(accent, 0.22)} 0%, rgba(6,8,18,0.9) 55%, rgba(2,4,10,0.96) 100%)`,
          }}
          onClick={onClose}
        >
          {/* Ortalama sarmalı: min-h-full + flex → kısa içerik dikeyde ortalanır,
              uzun içerik yukarı taşarken üstü ERİŞİLEBİLİR kalır (kaydırılabilir). */}
          <div className="flex min-h-full items-center justify-center p-4">
          <Motion.div
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            // Üst padding bilinçli olarak daha dar (pt-3/sm:pt-4): sahne (küre/rozet) modalın
            // üstünde gereksiz boşluk bırakmasın — kapat butonu zaten absolute konumlu.
            // Ortalama dıştaki `min-h-full flex items-center` sarmalında yapılır;
            // burada yalnız genişlik + iç boşluk (üst dar: sahne yukarıda dursun).
            className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-white/[0.03] px-6 pb-6 pt-3 shadow-2xl sm:px-8 sm:pb-8 sm:pt-4"
            style={{
              // Rarity ışığını modal kenarına taşır (kategori renginden bağımsız görkem).
              boxShadow: theme.key === 'common'
                ? undefined
                : `0 0 60px ${hexToRgba(theme.glow, 0.28)}, 0 0 120px ${hexToRgba(theme.glow2, 0.14)}`,
            }}
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
              <Motion.div className="flex flex-col items-center text-center" animate={shakeControls}>
                {/* SAHNE: küre veya maskot (aşama 1-3) */}
                <RevealStage
                  variant={variant}
                  accent={accent}
                  categoryReady={categoryReady}
                  revealed={phase === 'reveal' || phase === 'details'}
                  character={character}
                  reduceMotion={reduceMotion}
                  theme={theme}
                />

                {/* METİN KATMANI: aşamaya göre değişir */}
                <div className="mt-4 min-h-[112px] w-full">
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
                        theme={theme}
                        showWhy={phase === 'details'}
                        onClose={onClose}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </Motion.div>
            )}
          </Motion.div>
          </div>
        </Motion.div>
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
    <Motion.div
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
    </Motion.div>
  );
}

// ── Aşama 2 metni: kategori belli ────────────────────────────────────
function CategoryText({ category }: { category: RevealCategory }) {
  return (
    <Motion.div
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
    </Motion.div>
  );
}

// ── Aşama 3-4 metni: rozet adı + kategori + rarity + AI açıklaması ────
function DetailsText({
  character,
  accent,
  theme,
  showWhy,
  onClose,
}: {
  character: NonNullable<RevealCharacter>;
  accent: string;
  theme: RarityTheme;
  showWhy: boolean;
  onClose: () => void;
}) {
  // Karaktere özel açılış metni (lib/character-reveal-texts.ts). Henüz yazılmamışsa null
  // döner ve eski davranış (katalog açıklaması) gösterilir — yarım liste hiçbir şeyi bozmaz.
  const revealText = getCharacterRevealText(character.badgeId);

  // Nadir oran rozeti verisi: ratePct varsa göster; düşükse "çok nadir" vurgusu.
  const ratePct = typeof character.ratePct === 'number' ? character.ratePct : null;
  const veryRare = ratePct !== null && ratePct <= 5;
  // Yüzdeyi okunur biçimle (çok küçükse ondalık göster).
  const rateLabel = ratePct === null
    ? null
    : ratePct < 1 ? ratePct.toFixed(1) : String(Math.round(ratePct));

  return (
    <Motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-3"
    >
      {/* Kategori + rarity etiketleri (yan yana, sarmalar) */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
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


        {/* PUAN kademesi — kazanımın somut karşılığı (2.500 / 5.000 / 10.000 P) */}
        {revealText && (
          <Motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', delay: 0.22, damping: 14 }}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-3 py-0.5 text-xs font-extrabold tracking-wide text-white/90"
          >
            {revealText.points.toLocaleString('tr-TR')} P
          </Motion.span>
        )}
      </div>

      {/* KADEME BANDI — efsanevi/nadir olduğunu BİR BAKIŞTA gösteren geniş şerit.
          Küçük etiketten farklı olarak burada ikon + başlık + açıklama birlikte:
          "EFSANEVİ · En özgün arketiplerden" gibi. Yaygın rozetlerde gösterilmez. */}
      {theme.label && (
        <Motion.div
          initial={{ opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ type: 'spring', delay: 0.1, damping: 18 }}
          className="relative w-full max-w-sm overflow-hidden rounded-xl px-4 py-2"
          style={{
            background: `linear-gradient(100deg, ${hexToRgba(theme.glow, 0.28)} 0%, ${hexToRgba(theme.glow2, 0.12)} 60%, transparent 100%)`,
            border: `1px solid ${hexToRgba(theme.glow, 0.5)}`,
            boxShadow: `inset 0 1px 0 ${hexToRgba(theme.glow, 0.4)}`,
          }}
        >
          {/* efsanevilerde soldan sağa kayan parıltı — dikkat çeker, renk değiştirmez */}
          {theme.key === 'legendary' && (
            <Motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-24"
              style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba('#ffffff', 0.28)}, transparent)` }}
              animate={{ x: ['-120%', '520%'] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
            />
          )}
          <div className="relative flex items-center justify-center gap-2">
            {theme.key === 'legendary' ? (
              <Crown className="h-5 w-5 shrink-0 text-white drop-shadow" />
            ) : (
              <Gem className="h-4 w-4 shrink-0 text-white/90" />
            )}
            <span className="text-sm font-extrabold uppercase tracking-[0.2em] text-white drop-shadow">
              {theme.label}
            </span>
            <span className="text-[11px] font-medium text-white/70">
              {theme.key === 'legendary' ? '· En özgün arketiplerden' : '· Belirgin, derin karakter'}
            </span>
          </div>
        </Motion.div>
      )}

      {/* KATEGORİ TAGLINE — isimden önce, sahneyi kuran küçük üst başlık */}
      <Motion.p
        initial={{ opacity: 0, letterSpacing: '0.5em' }}
        animate={{ opacity: 1, letterSpacing: '0.28em' }}
        transition={{ duration: 0.7, delay: 0.05 }}
        className="text-[10px] font-bold uppercase sm:text-[11px]"
        style={{ color: hexToRgba(theme.glow, 0.85), textShadow: `0 0 14px ${hexToRgba(theme.glow, 0.5)}` }}
      >
        {theme.tagline}
      </Motion.p>

      <h2
        className="text-3xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-4xl"
        style={{ textShadow: `0 0 24px ${hexToRgba(theme.key === 'common' ? accent : theme.glow, 0.55)}` }}
      >
        {character.name}
      </h2>

      {/* DİZİ/FİLM KAYNAĞI + karakterin özü (isim altı, ince ve zarif) */}
      {revealText && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="-mt-1 flex flex-col items-center gap-0.5"
        >
          <span className="text-xs font-medium tracking-wide text-white/55">{revealText.source}</span>
          <span className="text-[13px] italic text-white/75">{revealText.essence}</span>
        </Motion.div>
      )}

      {/* İMZA CÜMLE — "Rozetini kazandın! …" (karaktere özel kutlama). Yoksa katalog açıklaması. */}
      {revealText?.quote ? (
        <Motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-md text-balance px-2 text-base font-semibold leading-snug text-white/95 sm:text-lg"
          style={{ textShadow: `0 0 18px ${hexToRgba(theme.glow, 0.35)}` }}
        >
          {revealText.quote}
        </Motion.p>
      ) : character.description ? (
        <p className="max-w-sm text-sm text-white/70">{character.description}</p>
      ) : null}

      {/* ÖZELLİK ETİKETLERİ — karakteri tanımlayan kelimeler, kategori renginde çipler */}
      {revealText?.tags?.length ? (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex max-w-md flex-wrap items-center justify-center gap-1.5"
        >
          {revealText.tags.map((tag, i) => (
            <Motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 16, delay: 0.34 + i * 0.05 }}
              className="rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:text-[11px]"
              style={{
                color: hexToRgba(theme.glow, 0.95),
                borderColor: hexToRgba(theme.glow, 0.35),
                backgroundColor: hexToRgba(theme.glow, 0.1),
              }}
            >
              {tag}
            </Motion.span>
          ))}
        </Motion.div>
      ) : null}

      {/* AI'ın "neden bu rozeti aldın" açıklaması */}
      <AnimatePresence>
        {showWhy && character.why && (
          <Motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full overflow-hidden"
          >
            {/* Kategori renginde çerçeve + üst ışık şeridi → "okunmaya değer" his */}
            <div
              className="relative mt-1 overflow-hidden rounded-2xl border p-4 text-left"
              style={{
                borderColor: hexToRgba(theme.glow, 0.3),
                background: `linear-gradient(160deg, ${hexToRgba(theme.glow, 0.1)} 0%, rgba(255,255,255,0.04) 45%)`,
                boxShadow: `inset 0 1px 0 ${hexToRgba(theme.glow, 0.25)}, 0 8px 30px ${hexToRgba(theme.glow, 0.12)}`,
              }}
            >
              {/* üst kenar ışık çizgisi */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(theme.glow, 0.9)}, transparent)` }}
              />
              <p
                className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: theme.glow, textShadow: `0 0 12px ${hexToRgba(theme.glow, 0.5)}` }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Bu rozeti aldın çünkü
              </p>
              <p className="text-[15px] leading-relaxed text-white/90">{character.why}</p>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* NADİR ORAN rozeti — ratePct varsa şık bir "seyreklik" göstergesi */}
      {showWhy && rateLabel !== null && (
        <Motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            color: veryRare ? theme.glow : '#facc15',
            borderColor: hexToRgba(veryRare ? theme.glow : '#facc15', 0.45),
            background: hexToRgba(veryRare ? theme.glow : '#facc15', 0.1),
          }}
        >
          <span aria-hidden="true">🏆</span>
          <span className="truncate">
            Oyuncuların yalnızca %{rateLabel}&apos;inde
            {veryRare && <span className="ml-1 font-extrabold">— çok nadir!</span>}
          </span>
        </Motion.div>
      )}

      {showWhy && (
        <Motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', delay: 0.25, damping: 18 }}
          className="mt-2 flex flex-wrap items-center justify-center gap-2"
        >
          <ShareButton character={character} theme={theme} />
          <Button
            onClick={onClose}
            className="gap-2 text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${hexToRgba(accent, 0.7)})` }}
          >
            <PartyPopper className="h-4 w-4" />
            Harika!
          </Button>
        </Motion.div>
      )}
    </Motion.div>
  );
}

// ── Paylaş butonu: şık PNG görsel kartı üret → native paylaş / indir ──
// Görsel üretimi/paylaşımı character-share-card.tsx'e devredilir; başarısızlıkta
// (görsel taint'lenirse ya da paylaşım desteklenmezse) sessizce metin/panoya düşer.
function ShareButton({
  character,
  theme,
}: {
  character: NonNullable<RevealCharacter>;
  theme: RarityTheme;
}) {
  // Görsel üretilirken kısa "hazırlanıyor" durumu (buton kilidi + geri bildirim).
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  // theme yalnızca prop imzasını korumak için — paylaşım metni share-card içinde rarity'den türetilir.
  void theme;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Görsel PNG paylaşımı (mobilde native share, masaüstünde indirme; hata → metin).
      await shareCharacter(character);
    } catch {
      /* shareCharacter zaten kendi içinde güvenli — yine de akışı bozma */
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [character, busy]);

  return (
    <Button
      variant="secondary"
      onClick={handleShare}
      disabled={busy}
      className="gap-2"
      aria-label="Karakterini görsel olarak paylaş"
    >
      <Share2 className="h-4 w-4" />
      {busy ? 'Hazırlanıyor…' : 'Paylaş 📸'}
    </Button>
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
  theme,
}: {
  variant: 'orb' | 'mascot';
  accent: string;
  categoryReady: boolean;
  revealed: boolean;
  character: RevealCharacter;
  reduceMotion: boolean;
  theme: RarityTheme;
}) {
  return (
    <div className="relative grid h-44 w-44 place-items-center sm:h-52 sm:w-52">
      {/* IŞIK HUZMELERİ (god rays) — reveal anında rozetin arkasından yayılır.
          Rarity yüksekse daha belirgin; reduceMotion'da dönmez. */}
      <AnimatePresence>
        {revealed && theme.rays > 0 && (
          <GodRays theme={theme} reduceMotion={reduceMotion} />
        )}
      </AnimatePresence>

      {/* Prosedürel canvas sahne (küre veya maskot) — reveal sonrası solar */}
      <Motion.div
        className="absolute inset-0"
        animate={{ opacity: revealed ? 0.35 : 1, scale: revealed ? 1.08 : 1 }}
        transition={{ duration: 0.6 }}
      >
        {variant === 'orb' ? (
          <OrbCanvas accent={accent} categoryReady={categoryReady} reduceMotion={reduceMotion} />
        ) : (
          <MascotCanvas accent={accent} categoryReady={categoryReady} reduceMotion={reduceMotion} />
        )}
      </Motion.div>

      {/* Rozet — reveal anında ışık patlamasıyla belirir */}
      <AnimatePresence>
        {revealed && (
          <RevealedBadge accent={accent} character={character} reduceMotion={reduceMotion} theme={theme} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── IŞIK HUZMELERİ (god rays) — conic-gradient tabanlı dönen ışın demeti ──
function GodRays({ theme, reduceMotion }: { theme: RarityTheme; reduceMotion: boolean }) {
  // Işınları conic-gradient'te tekrarlayan renkli/şeffaf dilimlerle üretiriz.
  // Dilim sayısı rarity'nin `rays` değerine bağlı; legendary'de en yoğun.
  const slices = theme.rays;
  const step = 360 / slices;
  const stops: string[] = [];
  for (let i = 0; i < slices; i++) {
    const a0 = i * step;
    stops.push(
      `transparent ${a0}deg`,
      `${hexToRgba(theme.glow, 0.55)} ${a0 + step * 0.22}deg`,
      `${hexToRgba(theme.glow2, 0.32)} ${a0 + step * 0.42}deg`,
      `transparent ${a0 + step * 0.5}deg`,
    );
  }
  const cone = `conic-gradient(from 0deg, ${stops.join(', ')})`;

  return (
    <Motion.div
      className="pointer-events-none absolute inset-0 z-0 grid place-items-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: theme.key === 'legendary' ? 0.85 : 0.6, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <Motion.div
        className="h-[150%] w-[150%] rounded-full"
        style={{
          background: cone,
          // Merkeze doğru soluklaşan maske — ışınlar dışarı doğru yayılır gibi.
          WebkitMaskImage: 'radial-gradient(closest-side, transparent 26%, #000 42%, transparent 78%)',
          maskImage: 'radial-gradient(closest-side, transparent 26%, #000 42%, transparent 78%)',
          filter: 'blur(2px)',
          mixBlendMode: 'screen',
        }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: theme.key === 'legendary' ? 14 : 22, repeat: Infinity, ease: 'linear' }}
      />
    </Motion.div>
  );
}

// ── Reveal edilen rozet (emoji fallback + opsiyonel ikon) ────────────
function RevealedBadge({
  accent,
  character,
  reduceMotion,
  theme,
}: {
  accent: string;
  character: RevealCharacter;
  reduceMotion: boolean;
  theme: RarityTheme;
}) {
  const emoji = character?.category?.emoji || '🎭';
  // Rarity ışığı gövde/halka glow'unda kullanılır (kategori renginden bağımsız).
  const glow = theme.key === 'common' ? accent : theme.glow;
  // Patlama halkası sayısı rarity yoğunluğuna göre (legendary'de ekstra halka).
  const strongBurst = theme.intensity >= 0.75;

  return (
    <Motion.div
      className="relative z-10 grid place-items-center"
      style={{ perspective: 800 }}
      initial={{ scale: 0, rotate: reduceMotion ? 0 : -25, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 12, stiffness: 200 }}
    >
      {/* EFSANEVİ İŞARETİ — renk DEĞİL, form: rozetin çevresinde yavaşça dönen
          kesikli taç halkası. Kategori renginde olduğu için gizemli yeşil kalır,
          ama bu halka sadece efsanevilerde göründüğü için "özel" olduğu anlaşılır. */}
      {theme.key === 'legendary' && !reduceMotion && (
        <Motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            width: 210,
            height: 210,
            border: `2px dashed ${hexToRgba(glow, 0.65)}`,
            filter: `drop-shadow(0 0 10px ${hexToRgba(glow, 0.5)})`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Işık patlaması halkaları (rarity rengiyle) */}
      {!reduceMotion && (
        <>
          <Motion.span
            className="absolute rounded-full"
            style={{ border: `2px solid ${hexToRgba(glow, 0.75)}` }}
            initial={{ width: 40, height: 40, opacity: 0.9 }}
            animate={{ width: 260, height: 260, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          <Motion.span
            className="absolute rounded-full"
            style={{ border: `1px solid ${hexToRgba('#ffffff', 0.6)}` }}
            initial={{ width: 40, height: 40, opacity: 0.8 }}
            animate={{ width: 190, height: 190, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
          />
          {/* Legendary/epic'te ekstra ikinci renk halkası — daha görkemli patlama */}
          {strongBurst && (
            <Motion.span
              className="absolute rounded-full"
              style={{ border: `2px solid ${hexToRgba(theme.glow2, 0.6)}` }}
              initial={{ width: 40, height: 40, opacity: 0.8 }}
              animate={{ width: 320, height: 320, opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut', delay: 0.02 }}
            />
          )}
        </>
      )}

      {/* Rarity dönen renk halkası — rarity glow + altın karışımı */}
      <Motion.div
        className="absolute -inset-3 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, ${glow}, ${theme.glow2}, #ffffff, ${glow})`,
          filter: 'blur(6px)', opacity: strongBurst ? 0.7 : 0.55,
        }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: theme.key === 'legendary' ? 4.5 : 6, repeat: Infinity, ease: 'linear' }}
      />

      {/* 3D salınım katmanı: rozet gövdesi yumuşakça sallanır (canlı dursun) */}
      <Motion.div
        style={{ transformStyle: 'preserve-3d' }}
        initial={reduceMotion ? undefined : { rotateY: -180 }}
        animate={reduceMotion ? undefined : { rotateY: [0, 12, 0, -12, 0], rotateX: [0, -4, 0, 4, 0] }}
        transition={reduceMotion ? undefined : {
          rotateY: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
          rotateX: { duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
        }}
      >
        {/* Rozet gövdesi */}
        <div
          className="relative grid h-28 w-28 place-items-center rounded-full ring-2 sm:h-32 sm:w-32"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${hexToRgba('#ffffff', 0.9)}, ${hexToRgba(glow, 0.35)})`,
            boxShadow: `0 0 ${strongBurst ? 56 : 40}px ${hexToRgba(glow, 0.75)}, inset 0 2px 12px rgba(255,255,255,0.5)`,
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
      </Motion.div>

      {/* Parıltı süsü */}
      {!reduceMotion && (
        <Motion.div
          className="absolute -right-1 -top-1 z-20"
          animate={{ rotate: 360, scale: [1, 1.25, 1] }}
          transition={{ rotate: { duration: 5, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.6, repeat: Infinity } }}
        >
          <Sparkles className="h-7 w-7" style={{ color: theme.glow2, filter: `drop-shadow(0 0 8px ${hexToRgba(theme.glow, 0.7)})` }} />
        </Motion.div>
      )}
    </Motion.div>
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
