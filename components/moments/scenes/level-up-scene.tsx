'use client';

import { useEffect } from 'react';
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, OFFSET } from '@/lib/motion';
import { BUZZ } from '@/lib/moments/effects';
import { LEVEL_SCENE_COLORS, sceneBackdrop } from '@/lib/moments/scene-colors';
import type { Moment } from '@/lib/moments/types';
import { RING_SCREEN_FRACTION, RING_TIMELINE, levelSceneModel, secToMs, type SceneClock } from './scene-math';
import { SceneShell } from './scene-shell';
import { SceneStage } from './stage-lazy';
import { StageFallback2D } from './stage-fallback-2d';
import { DismissHint, Odometer, ReducedSceneCard, SceneProgress, StageAction, CardAction, useSceneCue } from './scene-parts';
import { useSceneCopy } from '@/lib/moments/scene-copy';
import { useLocaleSafe } from '@/lib/app-locale';

/**
 * Seviye atlama sahnesi (spec §3): tam ekran, ~4 sn, dokun/Esc ile geçilir.
 * 3B parçacıklar parlak halkada toplanır; halka kapandığı anda ışın patlaması ve eski →
 * yeni seviye odometresi döner; altta sonraki seviyeye ilerleme çubuğu dolar.
 *
 * Props sözleşmesi (M2 Host, `next/dynamic` ile yükler): `{ moment, onDone }`.
 */
/** Sahne odağı ekranın biraz üstünde: altta metin + eylem için yer kalır. */
const FOCUS_Y = 0.36;
const BURST_MS = secToMs(RING_TIMELINE.burstAt);
const MARKS = [BURST_MS - 150, BURST_MS, BURST_MS + 350];

export default function LevelUpScene({ moment, onDone }: { moment: Moment; onDone: () => void }) {
  const payload = moment.kind === 'level_up' ? moment.payload : null;

  // Yanlış türde an gelirse kuyruk tıkanmasın.
  const copy = useSceneCopy();
  useEffect(() => {
    if (!payload) onDone();
  }, [payload, onDone]);
  if (!payload) return null;

  const model = levelSceneModel(payload);
  const colors = LEVEL_SCENE_COLORS;
  const progressLabel = copy.levelProgress(model.xpToNext);
  const announce = copy.levelAnnounce(model.to, model.xpToNext);

  return (
    <SceneShell kind="level_up" variant="fullscreen" announce={announce} marks={MARKS} onDone={onDone}>
      {({ clock, elapsed, started, reduce, stageSettled, close, titleId }) =>
        reduce ? (
          <div className="grid size-full place-items-center bg-overlay/70 p-4">
            <ReducedSceneCard
              titleId={titleId}
              overline={copy.levelOverline}
              title={copy.levelCardTitle(model.to)}
              visual={<StageFallback2D preset="ring" colors={colors} />}
              actions={
                <>
                  <CardAction onClick={close} autoFocus>
                    {copy.continue}
                  </CardAction>
                  <DismissHint tone="card" />
                </>
              }
            >
              <p className="qx-body text-fg-muted">{copy.levelFromTo(model.from, model.to)}</p>
              {model.progressPct != null && (
                <SceneProgress pct={model.progressPct} colors={colors} run="static" label={progressLabel} tone="card" />
              )}
            </ReducedSceneCard>
          </div>
        ) : (
          <LevelStage
            model={model}
            clock={clock}
            elapsed={elapsed}
            started={started}
            stageSettled={stageSettled}
            close={close}
            titleId={titleId}
            progressLabel={progressLabel}
          />
        )
      }
    </SceneShell>
  );
}

function LevelStage({
  model,
  clock,
  elapsed,
  started,
  stageSettled,
  close,
  titleId,
  progressLabel,
}: {
  model: ReturnType<typeof levelSceneModel>;
  clock: SceneClock;
  elapsed: number;
  started: boolean;
  stageSettled: () => void;
  close: () => void;
  titleId: string;
  progressLabel: string;
}) {
  const copy = useSceneCopy();
  const levelWord = useLocaleSafe() === 'en' ? 'Level' : 'Seviye';
  const colors = LEVEL_SCENE_COLORS;
  const textIn = started && elapsed >= BURST_MS - 150;
  const flip = started && elapsed >= BURST_MS;
  const barRun = started && elapsed >= BURST_MS + 350;

  useSceneCue(flip, { sound: 'win', buzz: BUZZ.success, withConfetti: false });

  return (
    <>
      <div aria-hidden className="absolute inset-0" style={{ background: sceneBackdrop(colors) }} />
      <SceneStage preset="ring" colors={colors} clock={clock} focusY={FOCUS_Y} onSettled={stageSettled} className="absolute inset-0" />

      {/* Halkanın içindeki odometre — konum CSS sarmalayıcıda, hareket içteki Motion'da. */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white"
        style={{ top: `${FOCUS_Y * 100}%` }}
      >
        <Motion.div
          initial={{ opacity: 0, scale: 0.86 }}
          animate={started ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.86 }}
          transition={{ duration: DURATION.slow, ease: EASE.emphasized, delay: 0.35 }}
          className="flex flex-col items-center"
        >
          <span className="qx-overline text-white/70">{levelWord}</span>
          <Odometer
            from={model.from}
            to={model.to}
            flip={flip}
            className="font-bold tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
            // Yazı boyutu küçük kenara bağlı (halka çapı = 0,56 × küçük kenar).
            style={{ fontSize: 'min(17vw, 17dvh)' }}
          />
        </Motion.div>
      </div>

      <div
        className="absolute inset-x-0 flex flex-col items-center px-6 text-center"
        style={{ top: `calc(${FOCUS_Y * 100}% + min(${RING_SCREEN_FRACTION * 50}vw, ${RING_SCREEN_FRACTION * 50}dvh) + 1.25rem)` }}
      >
        <Motion.div
          className="flex w-full max-w-sm flex-col items-center gap-3"
          initial={{ opacity: 0, y: OFFSET.enter }}
          animate={textIn ? { opacity: 1, y: 0 } : { opacity: 0, y: OFFSET.enter }}
          transition={{ duration: DURATION.slow, ease: EASE.emphasized }}
        >
          <h2 id={titleId} className="qx-h1 text-white">
            {copy.levelTitle}
          </h2>
          <p className="qx-body text-white/80">{copy.levelNow(model.to)}</p>
          {model.progressPct != null && (
            // Çok alçak yatay ekranda (telefon yan) çubuk eylem düğmesiyle çakışmasın.
            <div className="w-full [@media(max-height:520px)]:hidden">
              <SceneProgress pct={model.progressPct} colors={colors} run={barRun} label={progressLabel} />
            </div>
          )}
        </Motion.div>
      </div>

      <div
        className="absolute inset-x-0 flex flex-col items-center gap-2 px-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <StageAction onClick={close} autoFocus>
          {copy.continue}
        </StageAction>
        <DismissHint compact />
      </div>
    </>
  );
}
