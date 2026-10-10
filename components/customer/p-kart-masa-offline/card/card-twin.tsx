/**
 * Fiziksel kartın dijital ikizi — yalnız görünüm (hook yok; sunucu ve istemci bileşeninde
 * kullanılır). Kartım'daki kart yüzüyle aynı malzeme dili: tema bağımsız koyu yüzey, marka
 * ışıması, maskeli numara. Hareket yok; giriş/dönüş animasyonu çağıran adada.
 *
 * Kullanılmamış kartta isim alanı kesik çizgili "Senin adın burada"; başkasının kartında
 * yalnız "Qratex üyesi" (sahibin adı ASLA yazılmaz — kimlik yalnız sahibine).
 */
import { Snowflake, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TwinVariant = 'claimable' | 'owner' | 'member' | 'frozen' | 'blocked';

/** Kart malzemesi: koyu yüzey + marka/kategori ışıması; metin ≥ %72 beyaz (AA). */
export const TWIN_SURFACE_STYLE: React.CSSProperties = {
  backgroundColor: '#0b0a14',
  backgroundImage:
    'radial-gradient(ellipse 90% 70% at 8% -12%, hsl(var(--brand) / 0.55), transparent 55%), radial-gradient(ellipse 70% 60% at 105% 110%, hsl(var(--category-2) / 0.28), transparent 55%)',
};

export function CardTwin({
  variant,
  holder,
  maskedToken,
  ariaLabel,
  caption,
  statusLabel,
  className,
}: {
  variant: TwinVariant;
  /** Sahip görünümünde ad; claimable'da yer tutucu; member'da "Qratex üyesi". */
  holder: string;
  maskedToken: string;
  ariaLabel: string;
  caption: string;
  /** frozen / blocked rozet metni. */
  statusLabel?: string;
  className?: string;
}) {
  const dimmed = variant === 'frozen' || variant === 'blocked';
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('relative aspect-[1.586/1] w-full overflow-hidden rounded-[22px] text-white shadow-2xl ring-1 ring-white/10', className)}
      style={TWIN_SURFACE_STYLE}
    >
      <div className={cn('flex h-full flex-col justify-between p-5 sm:p-6', dimmed && 'opacity-60')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl font-bold tracking-tight">QRATEX</p>
            <p className="text-xs uppercase tracking-[0.18em] text-white/75">{caption}</p>
          </div>
          {/* Çip görseli (dekoratif). */}
          <span aria-hidden className="mt-1 block h-8 w-11 rounded-md bg-gradient-to-br from-amber-200/90 via-amber-400/80 to-amber-600/80 ring-1 ring-black/20" />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-base tracking-[0.2em] text-white/80 sm:text-lg">{maskedToken}</p>
          <p
            className={cn(
              'truncate text-lg font-semibold',
              variant === 'claimable' && 'inline-block rounded-md border border-dashed border-white/50 px-2 py-0.5 text-base font-medium text-white/80'
            )}
          >
            {holder}
          </p>
        </div>
      </div>
      {statusLabel && (variant === 'frozen' || variant === 'blocked') && (
        <span className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/20">
          {variant === 'frozen' ? <Snowflake className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
          {statusLabel}
        </span>
      )}
    </div>
  );
}
