'use client';

import { useEffect } from 'react';
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, OFFSET } from '@/lib/motion';
import { BUZZ } from '@/lib/moments/effects';
import { getLeagueSceneColors, lightenHex, sceneBackdrop, type ScenePair } from '@/lib/moments/scene-colors';
import type { Moment } from '@/lib/moments/types';
import { GEM_SCREEN_FRACTION, GEM_TIMELINE, secToMs, type SceneClock } from './scene-math';
import { SceneShell } from './scene-shell';
import { SceneStage } from './stage-lazy';
import { StageFallback2D } from './stage-fallback-2d';
import { CardAction, DismissHint, ReducedSceneCard, StageAction, useSceneCue } from './scene-parts';
import { useSceneCopy } from '@/lib/moments/scene-copy';

/**
 * Lig yükselme sahnesi (spec §3): tam ekran, ~4,5 sn. Eski amblem parçacıklara dağılır,
 * yeni lig fasetli taşı kamera yaklaşırken iner; zemin eski lig renginden yeni lig rengine
 * bürünür. Taş indiği anda lig adı belirir.
 *
 * Props sözleşmesi (M2 Host, `next/dynamic` ile yükler): `{ moment, onDone }`.
 */
/** Sahne odağı ekranın biraz üstünde: altta metin + eylem için yer kalır. */
const FOCUS_Y = 0.36;
const HOLD_MS = secToMs(GEM_TIMELINE.holdOld);
const BACKDROP_MS = secToMs(GEM_TIMELINE.backdropFrom);
const LAND_MS = secToMs(GEM_TIMELINE.landAt);
const MARKS = [HOLD_MS, BACKDROP_MS, LAND_MS - 120, LAND_MS];

function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 40) : '';
}

export default function LeagueUpScene({ moment, onDone }: { moment: Moment; onDone: () => void }) {
  const payload = moment.kind === 'league_up' ? moment.payload : null;

  const copy = useSceneCopy();
  useEffect(() => {
    if (!payload) onDone();
  }, [payload, onDone]);
  if (!payload) return null;

  const toName = cleanName(payload.toName);
  const fromName = cleanName(payload.fromName);
  const toColors = getLeagueSceneColors(payload.toKey);
  const fromColors = getLeagueSceneColors(payload.fromKey);
  const points = Number.isFinite(Number(payload.points)) ? Number(payload.points) : null;
  const title = copy.leagueTitle(toName);
  const announce = copy.leagueAnnounce(title, fromName);

  return (
    <SceneShell kind="league_up" variant="fullscreen" announce={announce} marks={MARKS} onDone={onDone}>
      {({ clock, elapsed, started, reduce, stageSettled, close, titleId }) =>
        reduce ? (
          <div className="grid size-full place-items-center bg-overlay/70 p-4">
            <ReducedSceneCard
              titleId={titleId}
              overline={copy.leagueOverline}
              title={title}
              visual={<StageFallback2D preset="gem" colors={toColors} />}
              actions={
                <>
                  <CardAction onClick={close} autoFocus>
                    {copy.great}
                  </CardAction>
                  <DismissHint tone="card" />
                </>
              }
            >
              {(fromName || points != null) && (
                <p className="qx-body text-fg-muted">
                  {fromName ? copy.leagueLeftBehind(fromName) : ''}
                  {points != null ? copy.leagueBalance(points) : ''}
                </p>
              )}
            </ReducedSceneCard>
          </div>
        ) : (
          <LeagueStage
            clock={clock}
            elapsed={elapsed}
            started={started}
            stageSettled={stageSettled}
            close={close}
            titleId={titleId}
            title={title}
            toName={toName}
            fromName={fromName}
            points={points}
            toColors={toColors}
            fromColors={fromColors}
          />
        )
      }
    </SceneShell>
  );
}

function LeagueStage({
  clock,
  elapsed,
  started,
  stageSettled,
  close,
  titleId,
  title,
  toName,
  fromName,
  points,
  toColors,
  fromColors,
}: {
  clock: SceneClock;
  elapsed: number;
  started: boolean;
  stageSettled: () => void;
  close: () => void;
  titleId: string;
  title: string;
  toName: string;
  fromName: string;
  points: number | null;
  toColors: ScenePair;
  fromColors: ScenePair;
}) {
  const copy = useSceneCopy();
  const oldOut = started && elapsed >= HOLD_MS;
  const toBackdrop = started && elapsed >= BACKDROP_MS;
  const textIn = started && elapsed >= LAND_MS - 120;
  const landed = started && elapsed >= LAND_MS;

  useSceneCue(landed, { sound: 'fanfare', buzz: BUZZ.big, withConfetti: false });

  const backdropSec = GEM_TIMELINE.backdropTo - GEM_TIMELINE.backdropFrom;

  return (
    <>
      {/* Zemin: eski lig rengi → yeni lig rengi (çapraz geçiş). */}
      <div aria-hidden className="absolute inset-0" style={{ background: sceneBackdrop(fromColors) }} />
      <Motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ background: sceneBackdrop(toColors) }}
        initial={{ opacity: 0 }}
        animate={{ opacity: toBackdrop ? 1 : 0 }}
        transition={{ duration: backdropSec, ease: EASE.standard }}
      />
      <SceneStage
        preset="gem"
        colors={toColors}
        fromColors={fromColors}
        clock={clock}
        focusY={FOCUS_Y}
        onSettled={stageSettled}
        className="absolute inset-0"
      />

      {/* Üstte eski lig adı: amblem dağılırken söner. */}
      {fromName && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center px-6"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
        >
          <Motion.p
            className="qx-overline text-white/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: started && !oldOut ? 1 : 0 }}
            transition={{ duration: DURATION.slow, ease: EASE.standard }}
          >
            {fromName} Ligi
          </Motion.p>
        </div>
      )}

      <div
        className="absolute inset-x-0 flex flex-col items-center px-6 text-center"
        style={{ top: `calc(${FOCUS_Y * 100}% + min(${GEM_SCREEN_FRACTION * 50}vw, ${GEM_SCREEN_FRACTION * 50}dvh) + 1.5rem)` }}
      >
        <Motion.div
          className="flex w-full max-w-md flex-col items-center gap-2"
          initial={{ opacity: 0, y: OFFSET.enter }}
          animate={textIn ? { opacity: 1, y: 0 } : { opacity: 0, y: OFFSET.enter }}
          transition={{ duration: DURATION.slow, ease: EASE.emphasized }}
        >
          <p className="qx-overline text-white/70">{copy.leagueOverline}</p>
          <h2 id={titleId} className="qx-h1 text-white">
            {toName ? (
              <>
                <span
                  className="bg-clip-text text-transparent"
                  // Koyu zeminde büyük metin için ≥ 3:1 kalsın: uç rengi açılır.
                  style={{ backgroundImage: `linear-gradient(90deg, #ffffff, ${lightenHex(toColors[1], 0.45)})` }}
                >
                  {toName}
                </span>{' '}
                {copy.leagueSuffix}
              </>
            ) : (
              title
            )}
          </h2>
          <p className="qx-body text-white/80 [@media(max-height:520px)]:hidden">
            {fromName ? copy.leagueLeftBehind(fromName) : copy.leagueUp}
            {points != null ? copy.leagueBalance(points) : ''}
          </p>
        </Motion.div>
      </div>

      <div
        className="absolute inset-x-0 flex flex-col items-center gap-2 px-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <StageAction onClick={close} autoFocus>
          {copy.great}
        </StageAction>
        <DismissHint compact />
      </div>
    </>
  );
}
