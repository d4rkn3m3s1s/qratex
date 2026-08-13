'use client';

import { useMemo, useState, type JSX } from 'react';
import { m as Motion, useReducedMotion } from 'framer-motion';
import { useAppT } from '@/lib/app-locale';
import styles from './dealer-radar-scope.module.css';

export type RadarScopeContact = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  lastVisitIso: string;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function positionOnRadar(index: number, total: number): { x: number; y: number } {
  const t = index + 0.5;
  const norm = total > 0 ? t / total : 0;
  const radiusPct = 19 + Math.sqrt(norm) * 29;
  const theta = t * GOLDEN_ANGLE;
  return {
    x: 50 + radiusPct * Math.cos(theta),
    y: 50 + radiusPct * Math.sin(theta),
  };
}

function daysSince(iso: string): number {
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (86400 * 1000)));
}

function bearingRangeNm(x: number, y: number): { brg: number; rng: string } {
  const dx = x - 50;
  const dy = y - 50;
  const brg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
  const dist = (Math.sqrt(dx * dx + dy * dy) / 42) * 30;
  return { brg, rng: dist.toFixed(1) };
}

function GraticuleSvg() {
  const ticks: JSX.Element[] = [];
  for (let i = 0; i < 36; i++) {
    const deg = i * 10;
    const rad = ((deg - 90) * Math.PI) / 180;
    const major = i % 3 === 0;
    const rOuter = 42;
    const rInner = major ? 30 : 35;
    ticks.push(
      <line
        key={i}
        x1={50 + rInner * Math.cos(rad)}
        y1={50 + rInner * Math.sin(rad)}
        x2={50 + rOuter * Math.cos(rad)}
        y2={50 + rOuter * Math.sin(rad)}
        stroke="currentColor"
        strokeWidth={major ? 0.35 : 0.18}
        opacity={major ? 0.55 : 0.28}
      />,
    );
  }
  return (
    <svg className={styles.graticule} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.06)" />
          <stop offset="70%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={42} fill="url(#radarGlow)" />
      {[42, 28, 14].map((r) => (
        <circle
          key={r}
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.22}
          opacity={r === 42 ? 0.4 : 0.22}
        />
      ))}
      {ticks}
      <line x1={50} y1={8} x2={50} y2={92} stroke="currentColor" strokeWidth={0.15} opacity={0.2} />
      <line x1={8} y1={50} x2={92} y2={50} stroke="currentColor" strokeWidth={0.15} opacity={0.2} />
      {['N', 'E', 'S', 'W'].map((L, i) => {
        const a = ((i * 90 - 90) * Math.PI) / 180;
        const tx = 50 + 46 * Math.cos(a);
        const ty = 50 + 46 * Math.sin(a);
        return (
          <text
            key={L}
            x={tx}
            y={ty}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            fontSize={3.2}
            opacity={0.45}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {L}
          </text>
        );
      })}
    </svg>
  );
}

function TargetVectors({
  positions,
}: {
  positions: { x: number; y: number }[];
}) {
  if (positions.length === 0) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-[3] h-full w-full" viewBox="0 0 100 100" aria-hidden>
      {positions.map((p, i) => (
        <line
          key={i}
          x1={50}
          y1={50}
          x2={p.x}
          y2={p.y}
          stroke="rgba(34, 211, 238, 0.14)"
          strokeWidth={0.12}
          strokeDasharray="1 1.2"
        />
      ))}
    </svg>
  );
}

export function DealerRadarScope({ contacts }: { contacts: RadarScopeContact[] }) {
  const t = useAppT();
  const reduceMotion = useReducedMotion();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => a.id.localeCompare(b.id)),
    [contacts],
  );

  const positions = useMemo(
    () => sorted.map((_, i) => positionOnRadar(i, sorted.length)),
    [sorted],
  );

  const hovered = sorted.find((c) => c.id === hoveredId);
  const hoveredPos = hovered ? positions[sorted.indexOf(hovered)] : null;
  const intel = hoveredPos ? bearingRangeNm(hoveredPos.x, hoveredPos.y) : null;

  return (
    <Motion.div
      className="relative"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-800/95 via-slate-950 to-black p-[3px] shadow-[0_25px_80px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(251,191,36,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute left-3 top-3 h-2 w-2 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-inner ring-1 ring-black/40" />
        <div className="pointer-events-none absolute right-3 top-3 h-2 w-2 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-inner ring-1 ring-black/40" />
        <div className="pointer-events-none absolute bottom-3 left-3 h-2 w-2 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-inner ring-1 ring-black/40" />
        <div className="pointer-events-none absolute bottom-3 right-3 h-2 w-2 rounded-full bg-gradient-to-br from-slate-500 to-slate-800 shadow-inner ring-1 ring-black/40" />

        <div className="relative rounded-[1.85rem] bg-gradient-to-b from-slate-950/95 via-[#060a12] to-black px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.08),transparent)]" />

          <div className="relative z-10 mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 shadow-[0_0_14px_rgba(251,191,36,0.8)]" />
                </span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-amber-200/90">
                  {t('dealerRadar.hudTitle')}
                </span>
              </div>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-cyan-100/40">{t('dealerRadar.hudSubtitle')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] text-cyan-200/50 sm:text-[11px]">
              <span>
                {t('dealerRadar.rangeNm')}{' '}
                <span className="text-amber-300/90">{t('dealerRadar.hudRange')}</span>
              </span>
              <span>
                TRG <span className="text-cyan-300">{sorted.length}</span>
              </span>
              <span className="hidden sm:inline text-cyan-500/30">|</span>
              <span className="hidden text-amber-500/40 sm:inline">CIC-7A</span>
            </div>
          </div>

          <div className={styles.face}>
            <div className={styles.hexMesh} />
            <GraticuleSvg />
            <div className={styles.sonar} />
            <div className={`${styles.sonar} ${styles.sonar2}`} />
            <div className={`${styles.sonar} ${styles.sonar3}`} />
            <TargetVectors positions={positions} />
            <div className={styles.sweepSlow} />
            <div className={styles.sweepBloom} />
            <div className={styles.sweepFast} />
            <div className={styles.beam} />
            <div className={styles.hubRing} />
            <div className={styles.hub} />

            {sorted.length === 0 ? (
              <div className="absolute inset-0 z-[9] flex flex-col items-center justify-center px-8 text-center">
                <Motion.div
                  className="mb-3 h-px w-24 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
                  animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
                <p className="font-mono text-xs tracking-widest text-cyan-200/35">{t('dealerRadar.hudEmptyScan')}</p>
              </div>
            ) : (
              sorted.map((contact, i) => {
                const { x, y } = positions[i]!;
                const label = contact.name || contact.email || t('dealerRadar.anonymousCustomer');
                const initials = (contact.name || contact.email || '?').charAt(0).toUpperCase();
                const days = daysSince(contact.lastVisitIso);
                return (
                  <Motion.button
                    key={contact.id}
                    type="button"
                    className={`${styles.blipWrap} group`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 22,
                      delay: reduceMotion ? 0 : i * 0.06,
                    }}
                    onMouseEnter={() => setHoveredId(contact.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(contact.id)}
                    onBlur={() => setHoveredId(null)}
                    aria-label={`${label}, ${t('dealerRadar.daysAgo').replace('{days}', String(days))}`}
                  >
                    <span className={styles.cornerTL} />
                    <span className={styles.cornerTR} />
                    <span className={styles.cornerBL} />
                    <span className={styles.cornerBR} />
                    <div className={styles.targetRing} />
                    <div className={styles.avatar}>
                      {contact.image ? (
                        <img src={contact.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 font-mono text-sm font-bold text-amber-400/90">
                          {initials}
                        </div>
                      )}
                    </div>
                    <span className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded border border-amber-500/30 bg-black/70 px-1 py-px font-mono text-[6px] font-bold tracking-[0.2em] text-amber-300 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                      {t('dealerRadar.lockVisual')}
                    </span>
                  </Motion.button>
                );
              })
            )}

            <div className={styles.noise} />
            <div className={styles.crt} />
            <div className={styles.vignette} />
          </div>

          <Motion.div
            className="relative z-10 mt-5 overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-r from-slate-950/90 via-slate-900/50 to-slate-950/90 p-4 shadow-inner backdrop-blur-sm"
            layout
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400/70">
                {t('dealerRadar.intelPanel')}
              </span>
              {intel && (
                <span className="font-mono text-[10px] text-cyan-400/60">
                  {t('dealerRadar.bearing')} {intel.brg}° · {t('dealerRadar.rangeNm')} {intel.rng}
                </span>
              )}
            </div>
            {hovered ? (
              <Motion.div
                key={hovered.id}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-500/25 shadow-lg ring-1 ring-cyan-500/20">
                  {hovered.image ? (
                    <img src={hovered.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900 font-mono text-lg text-amber-400">
                      {(hovered.name || hovered.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-amber-50">{hovered.name || t('dealerRadar.anonymousCustomer')}</p>
                  <p className="truncate text-xs text-cyan-200/35">{hovered.email}</p>
                  <p className="mt-1 font-mono text-[11px] text-cyan-400/80">
                    {t('dealerRadar.lastVisitLabel')}:{' '}
                    <span className="text-amber-200/90">
                      {t('dealerRadar.daysAgo').replace('{days}', String(daysSince(hovered.lastVisitIso)))}
                    </span>
                  </p>
                </div>
              </Motion.div>
            ) : (
              <p className="text-sm leading-relaxed text-cyan-100/35">{t('dealerRadar.hoverForIntel')}</p>
            )}
          </Motion.div>

          <p className="relative z-10 mt-3 text-center font-mono text-[9px] uppercase tracking-[0.35em] text-amber-500/25">
            {t('dealerRadar.hudFooter')}
          </p>
        </div>
      </div>
    </Motion.div>
  );
}
