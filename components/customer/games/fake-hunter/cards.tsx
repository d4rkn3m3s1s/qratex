'use client';

/**
 * Sahte Avcısı — dört modun kart görünümleri (yalnız sunum). Karar mantığı ana bileşende.
 * Görsel dil: Bot Avcısı'nın radar/hologram arenası (koyu deniz yeşili, tarama çizgileri).
 * Renk tek ayırt edici değil: SAHTE = turuncu + ✕ + yazı, GERÇEK = mavi + ✓ + yazı
 * (renk körü güvenli mavi/turuncu çifti).
 */
import { m, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { BadgeCheck, CalendarDays, Camera, Check, MessageSquareText, Radar, ShieldQuestion, Star, X } from 'lucide-react';
import type { FakeHunterMode } from './rules';

export const FAKE_COLOR = '#f59e0b';
export const REAL_COLOR = '#38bdf8';

export interface FHItem {
  id: string;
  mode: FakeHunterMode;
  difficulty?: number;
  why?: string;
  [k: string]: unknown;
}

export const MODE_META: Record<FakeHunterMode, { title: string; short: string; how: string; fakeLabel: string; realLabel: string }> = {
  kaydir: {
    title: 'Kaydır',
    short: 'Yorumu oku, karar ver',
    how: 'Kartı sola kaydır: sahte. Sağa kaydır: gerçek. Somut ayrıntı, artı-eksi dengesi gerçeğe; abartı, kalıp ve reklam diline sahteliğe işaret eder.',
    fakeLabel: 'Sahte',
    realLabel: 'Gerçek',
  },
  dosya: {
    title: 'Dosya',
    short: 'Yorumcunun dosyasını incele',
    how: 'Hesap yaşı, yorum hızı, ziyaret doğrulaması ve geçmiş birlikte okunur. Tek bir işaret yetmez: yeni hesap da dürüst olabilir.',
    fakeLabel: 'Sahte',
    realLabel: 'Gerçek',
  },
  kelime: {
    title: 'Kelime',
    short: 'Yorumu ele veren cümleyi bul',
    how: 'Her yorumda tek bir cümle sahteliği ele verir: teşvik, reklam, rakibe yönlendirme, işletme ağzı ya da anahtar kelime doldurma. O cümleye dokun.',
    fakeLabel: '',
    realLabel: '',
  },
  profil: {
    title: 'Profil',
    short: 'İnsan mı, bot mu?',
    how: 'Hesabın davranış izine bak: yorum hızı, saatler, hedeflenen işletmeler, tekrar eden metinler. Bot ya da koordineli hesap mı, gerçek bir insan mı?',
    fakeLabel: 'Bot',
    realLabel: 'İnsan',
  },
};

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} yıldız`} role="img">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} aria-hidden className="h-3.5 w-3.5" style={{ color: i < v ? '#fbbf24' : 'rgba(255,255,255,0.25)', fill: i < v ? '#fbbf24' : 'transparent' }} />
      ))}
    </span>
  );
}

/** Hologram tarama çizgileri (dekoratif). */
function Scanlines({ accent }: { accent: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.12]"
      style={{ backgroundImage: `repeating-linear-gradient(0deg, ${accent} 0px, transparent 2px, transparent 5px)` }}
    />
  );
}

export function cardShell(accent: string): React.CSSProperties {
  return {
    background: 'linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
    borderColor: `${accent}55`,
    boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${accent}22`,
  };
}

// ───────────────────────────── Kaydır ─────────────────────────────

export function SwipeCard({
  item,
  accent,
  disabled,
  reduce,
  onVerdict,
}: {
  item: FHItem;
  accent: string;
  disabled: boolean;
  reduce: boolean;
  onVerdict: (v: 'real' | 'fake') => void;
}) {
  // Kart başına KENDİ hareket değeri (kart anahtarla yeniden kurulur → önceki uçuş taşınmaz).
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], reduce ? [0, 0] : [-12, 12]);
  const fakeOp = useTransform(x, [-110, -25], [1, 0]);
  const realOp = useTransform(x, [25, 110], [0, 1]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (disabled) return;
    if (info.offset.x <= -90 || info.velocity.x < -600) onVerdict('fake');
    else if (info.offset.x >= 90 || info.velocity.x > 600) onVerdict('real');
  };
  return (
    <m.div
      drag={disabled ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragEnd={onDragEnd}
      style={{ x, rotate, ...cardShell(accent) }}
      className="relative mx-auto w-full max-w-[22rem] cursor-grab touch-pan-y select-none rounded-2xl border p-5 active:cursor-grabbing"
    >
      <Scanlines accent={accent} />
      <m.div
        aria-hidden
        style={{ opacity: fakeOp, borderColor: FAKE_COLOR, color: FAKE_COLOR }}
        className="pointer-events-none absolute left-3 top-3 -rotate-12 rounded-md border-2 px-2 py-0.5 text-sm font-black tracking-widest"
      >
        ✕ SAHTE
      </m.div>
      <m.div
        aria-hidden
        style={{ opacity: realOp, borderColor: REAL_COLOR, color: REAL_COLOR }}
        className="pointer-events-none absolute right-3 top-3 rotate-12 rounded-md border-2 px-2 py-0.5 text-sm font-black tracking-widest"
      >
        ✓ GERÇEK
      </m.div>
      <div className="relative mt-6 flex items-center justify-between gap-2 text-xs text-white/70">
        <span className="truncate">{String(item.place ?? '')}</span>
        <Stars n={Number(item.stars ?? 0)} />
      </div>
      <p className="relative mt-3 text-[15px] leading-relaxed text-white">“{String(item.text ?? '')}”</p>
    </m.div>
  );
}

// ───────────────────────────── Dosya ─────────────────────────────

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/30 px-2.5 py-2">
      <span aria-hidden className="shrink-0 text-white/60">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] text-white/60">{label}</span>
        <span className="block truncate text-sm font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}

export function FileCard({ item, accent }: { item: FHItem; accent: string }) {
  const verified = item.visitVerified === true;
  return (
    <div className="relative mx-auto w-full max-w-[24rem] rounded-2xl border p-4" style={cardShell(accent)}>
      <Scanlines accent={accent} />
      <div className="relative flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Yorumcu dosyası</p>
          <p className="truncate text-base font-bold text-white">{String(item.reviewer ?? '')}</p>
        </div>
        <Stars n={Number(item.stars ?? 0)} />
      </div>
      <div className="relative mt-3 grid grid-cols-2 gap-2">
        <Field icon={<CalendarDays className="h-4 w-4" />} label="Hesap yaşı" value={String(item.accountAge ?? '')} />
        <Field icon={<MessageSquareText className="h-4 w-4" />} label="Toplam yorum" value={String(item.reviewCount ?? 0)} />
        <Field icon={<Camera className="h-4 w-4" />} label="Fotoğraf" value={String(item.photoCount ?? 0)} />
        <Field
          icon={verified ? <BadgeCheck className="h-4 w-4" /> : <ShieldQuestion className="h-4 w-4" />}
          label="Ziyaret"
          value={verified ? 'Doğrulandı' : 'Doğrulanmadı'}
        />
      </div>
      <p className="relative mt-3 text-[15px] leading-relaxed text-white">“{String(item.text ?? '')}”</p>
      <p className="relative mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-relaxed text-white/80">
        <span className="font-semibold text-white">Geçmiş: </span>
        {String(item.history ?? '')}
      </p>
    </div>
  );
}

// ───────────────────────────── Kelime ─────────────────────────────

export function WordCard({
  item,
  accent,
  disabled,
  chosen,
  correct,
  onVerdict,
}: {
  item: FHItem;
  accent: string;
  disabled: boolean;
  /** Geri bildirimde seçilen bölüm (s0…). */
  chosen: string | null;
  /** Pratik geri bildiriminde doğru bölüm. */
  correct: string | null;
  onVerdict: (v: string) => void;
}) {
  const parts = Array.isArray(item.parts) ? (item.parts as string[]) : [];
  return (
    <div className="relative mx-auto w-full max-w-[24rem] rounded-2xl border p-4" style={cardShell(accent)}>
      <Scanlines accent={accent} />
      <p className="relative text-[11px] font-semibold uppercase tracking-widest text-white/60">Ele veren cümleye dokun</p>
      <ol className="relative mt-3 space-y-2">
        {parts.map((p, i) => {
          const sid = `s${i}`;
          const isCorrect = correct === sid;
          const isChosenWrong = chosen === sid && correct !== null && !isCorrect;
          const isChosen = chosen === sid;
          const border = isCorrect ? FAKE_COLOR : isChosenWrong ? 'rgba(255,255,255,0.5)' : isChosen ? accent : 'rgba(255,255,255,0.14)';
          return (
            <li key={sid}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onVerdict(sid)}
                aria-label={`${i + 1}. cümle: ${p}`}
                className="flex min-h-[44px] w-full items-start gap-3 rounded-xl border bg-black/30 px-3 py-2.5 text-left text-[15px] leading-snug text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:hover:bg-black/30"
                style={{ borderColor: border, borderWidth: isCorrect || isChosen ? 2 : 1 }}
              >
                <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold">
                  {i + 1}
                </span>
                <span className="flex-1">{p}</span>
                {isCorrect && (
                  <span className="shrink-0 rounded px-1.5 text-xs font-bold" style={{ color: '#000', background: FAKE_COLOR }}>
                    ✕ ele veren
                  </span>
                )}
                {isChosenWrong && <span className="shrink-0 text-xs font-semibold text-white/80">senin seçimin</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────────── Profil ─────────────────────────────

export function ProfileCard({ item, accent, reduce }: { item: FHItem; accent: string; reduce: boolean }) {
  const name = String(item.name ?? '');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR'))
    .join('');
  const samples = Array.isArray(item.samples) ? (item.samples as string[]) : [];
  return (
    <div className="relative mx-auto w-full max-w-[24rem] overflow-hidden rounded-2xl border p-4" style={cardShell(accent)}>
      {/* Radar süpürmesi: konum dış sarmalayıcıda, dönüş içte (framer transform Tailwind'i ezer). */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48">
        <m.div
          className="h-full w-full rounded-full"
          style={{ background: `conic-gradient(from 0deg, ${accent}00 0deg, ${accent}00 290deg, ${accent}55 360deg)` }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <Scanlines accent={accent} />
      <div className="relative flex items-center gap-3">
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-lg font-black text-white"
          style={{ borderColor: accent, background: `${accent}22` }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{name}</p>
          <p className="truncate text-xs text-white/70">
            {String(item.handle ?? '')} · {String(item.joined ?? '')}’den beri
          </p>
        </div>
      </div>
      <div className="relative mt-3 grid grid-cols-2 gap-2">
        <Field icon={<MessageSquareText className="h-4 w-4" />} label="Yorum" value={String(item.reviewCount ?? 0)} />
        <Field icon={<Star className="h-4 w-4" />} label="Ortalama puan" value={Number(item.avgStars ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 1 })} />
      </div>
      <p className="relative mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-white" style={{ borderColor: `${accent}55`, background: `${accent}14` }}>
        <Radar aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
        <span>
          <span className="font-semibold">Davranış izi: </span>
          {String(item.pattern ?? '')}
        </span>
      </p>
      <ul className="relative mt-3 space-y-1.5">
        {samples.map((s, i) => (
          <li key={i} className="rounded-lg bg-black/30 px-3 py-2 text-sm italic text-white/90">
            “{s}”
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────── Karar düğmeleri ─────────────────────────────

export function VerdictButtons({
  mode,
  disabled,
  onVerdict,
}: {
  mode: FakeHunterMode;
  disabled: boolean;
  onVerdict: (v: 'real' | 'fake') => void;
}) {
  const meta = MODE_META[mode];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVerdict('fake')}
        aria-label={`${meta.fakeLabel} (sol ok tuşu)`}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 bg-black/40 text-base font-bold transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 motion-reduce:transition-none"
        style={{ borderColor: FAKE_COLOR, color: FAKE_COLOR }}
      >
        <X aria-hidden className="h-5 w-5" /> {meta.fakeLabel}
        <kbd aria-hidden className="ml-1 hidden rounded border border-current px-1 text-[10px] font-semibold sm:inline">←</kbd>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onVerdict('real')}
        aria-label={`${meta.realLabel} (sağ ok tuşu)`}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 bg-black/40 text-base font-bold transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 motion-reduce:transition-none"
        style={{ borderColor: REAL_COLOR, color: REAL_COLOR }}
      >
        <Check aria-hidden className="h-5 w-5" /> {meta.realLabel}
        <kbd aria-hidden className="ml-1 hidden rounded border border-current px-1 text-[10px] font-semibold sm:inline">→</kbd>
      </button>
    </div>
  );
}
