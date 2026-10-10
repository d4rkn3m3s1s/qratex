/**
 * Paylaşım önizleme kartı (OG 1200×630) — `next/og` ImageResponse için ortak çizim.
 * WhatsApp/iMessage/Instagram önizlemesinde mekân + öneri görünsün (denetim B2 / B8).
 * CSS değişkeni kullanılamaz → kategori renkleri `--category-*` HSL değerlerinin hex karşılığı.
 */
import type { PlaceCategory } from '@/lib/places/categories';
import { OG_IMAGE_BACKGROUND_GRADIENT, OG_IMAGE_TITLE_HEX } from '@/lib/brand-colors';
import { CHART_HEX } from '@/lib/chart-palette';

export const OG_SIZE = { width: 1200, height: 630 } as const;

const CATEGORY_HEX: Record<PlaceCategory, string> = {
  kahve: '#f97316', // --category-7
  restoran: '#e11d48', // --category-5
  tatli: '#d946ef', // --category-8
  kahvalti: '#f59e0b', // --category-4
  bar: '#7c3aed', // --category-1
  konaklama: '#0ea5e9', // --category-2
};

const BRAND_HEX = '#7c3aed';

export function ogAccent(category: PlaceCategory | null): string {
  return category ? CATEGORY_HEX[category] : BRAND_HEX;
}

function initial(text: string): string {
  return (text.trim()[0] ?? 'Q').toLocaleUpperCase('tr-TR');
}

export function ShareOgCard({
  eyebrow,
  title,
  subtitle,
  chips,
  accent,
  avatarText,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  chips: string[];
  accent: string;
  avatarText: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: OG_IMAGE_BACKGROUND_GRADIENT,
        fontFamily: 'system-ui, sans-serif',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 12,
          background: `linear-gradient(90deg, ${accent}, #d946ef)`,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            background: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 60,
            fontWeight: 800,
            color: '#ffffff',
          }}
        >
          {initial(avatarText)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 860 }}>
          <div style={{ fontSize: 28, color: CHART_HEX.slate200, letterSpacing: 2, textTransform: 'uppercase' }}>{eyebrow}</div>
          <div style={{ fontSize: 64, fontWeight: 800, color: OG_IMAGE_TITLE_HEX, lineHeight: 1.1, marginTop: 8 }}>
            {title.length > 48 ? `${title.slice(0, 47)}…` : title}
          </div>
        </div>
      </div>
      {subtitle ? (
        <div style={{ display: 'flex', fontSize: 40, color: '#f8fafc', lineHeight: 1.3, maxWidth: 1050 }}>
          “{subtitle.length > 90 ? `${subtitle.slice(0, 89)}…` : subtitle}”
        </div>
      ) : (
        <div style={{ display: 'flex' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {chips.slice(0, 3).map((chip) => (
            <div
              key={chip}
              style={{
                display: 'flex',
                fontSize: 28,
                padding: '10px 22px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: OG_IMAGE_TITLE_HEX }}>qratex</div>
      </div>
    </div>
  );
}
