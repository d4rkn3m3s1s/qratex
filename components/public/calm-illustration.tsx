import { cn } from '@/lib/utils';

/**
 * 404 / 500 / bakım ekranlarının sakin illüstrasyonu — yüzen küçük QR karakteri.
 * Saf SVG + CSS (app/public-anim.css `qx-calm-*`): JS yok, azaltılmış harekette durağan.
 *  - `lost`  (404): kafası karışık, göz kırpar, soru işareti
 *  - `oops`  (500): yamuk ağız, küçük kıvılcım
 *  - `fix`   (bakım): dönen dişli
 */
export function CalmIllustration({ kind, className }: { kind: 'lost' | 'oops' | 'fix'; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn('h-24 w-24 text-brand', className)} aria-hidden focusable="false">
      <ellipse className="qx-calm-shadow" cx="60" cy="108" rx="26" ry="4" fill="currentColor" opacity="0.3" />
      <g className="qx-calm-float">
        <rect x="28" y="22" width="64" height="64" rx="16" fill="hsl(var(--surface-1))" stroke="currentColor" strokeWidth="3" />
        {/* QR köşe işaretleri */}
        <rect x="36" y="30" width="12" height="12" rx="3" fill="currentColor" opacity="0.85" />
        <rect x="72" y="30" width="12" height="12" rx="3" fill="currentColor" opacity="0.85" />
        <rect x="36" y="66" width="12" height="12" rx="3" fill="currentColor" opacity="0.85" />
        {/* Yüz */}
        <g className="qx-calm-eye">
          <circle cx="52" cy="54" r="3" fill="hsl(var(--foreground))" />
          <circle cx="68" cy="54" r="3" fill="hsl(var(--foreground))" />
        </g>
        {kind === 'oops' ? (
          <path d="M51 68 q4 -4 9 0 t9 0" fill="none" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <path d="M53 67 q7 4 14 0" fill="none" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </g>
      {kind === 'lost' ? (
        <text x="96" y="24" fontSize="22" fontWeight="700" fill="currentColor" className="qx-calm-breathe" style={{ transformOrigin: '100px 18px' }}>
          ?
        </text>
      ) : null}
      {kind === 'oops' ? (
        <path className="qx-calm-breathe" style={{ transformOrigin: '98px 18px' }} d="M98 8 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="hsl(var(--warning))" />
      ) : null}
      {kind === 'fix' ? (
        <g className="qx-calm-gear" fill="none" stroke="hsl(var(--warning))" strokeWidth="3">
          <circle cx="98" cy="20" r="7" />
          <path d="M98 7v5M98 28v5M85 20h5M106 20h5M89 11l3.5 3.5M103.5 25.5 107 29M89 29l3.5-3.5M103.5 14.5 107 11" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}
