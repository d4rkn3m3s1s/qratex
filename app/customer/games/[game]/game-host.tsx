'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/customer/games/game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { gameFx } from '@/lib/games/engine/fx';
import { getGameEntry, isPlayable, type GameEntry, type GameFinish, type GameMode, type V2GameComponent } from '@/lib/games/registry';
import { getGameCopy } from '@/lib/minigame-copy';
import { LoadingLabel } from '@/components/layout/loading-label';

/**
 * Dinamik oyun sayfasının istemci adası. Kayıt defterinden bileşeni `next/dynamic` ile yükler
 * (oyun başına ayrı JS parçası; SSR yok — canvas/tarayıcı API'leri).
 *
 *   legacy → bileşen kendi GameShell + useMiniGame'ini içerir; olduğu gibi çizilir.
 *   v2     → kabuk, mod (Sıralı/Pratik), duraklatma, oturum ve ödül BURADA; bileşen yalnız
 *            oynanışı çizer (`GameComponentProps`). An Motoru entegrasyonu (puan kapsülü,
 *            seviye/lig/rozet anları) `useMiniGame` + GameShell konfetisi üzerinden korunur.
 */

function GameLoading() {
  return (
    <div role="status" className="flex min-h-[460px] items-center justify-center rounded-3xl border border-white/10 bg-black/60">
      <Loader2 className="h-8 w-8 animate-spin text-white/70 motion-reduce:animate-none" aria-hidden />
      <LoadingLabel tr="Oyun yükleniyor…" en="Loading game…" />
    </div>
  );
}

// next/dynamic bileşenleri modül düzeyinde önbelleklenir (her render'da yeni bileşen = yeniden mount).
const componentCache = new Map<string, ComponentType<never>>();

function lazyComponent(entry: GameEntry & { component: NonNullable<GameEntry['component']> }) {
  const hit = componentCache.get(entry.id);
  if (hit) return hit;
  const loader = entry.component.load as () => Promise<ComponentType<never>>;
  const C = dynamic(() => loader(), { ssr: false, loading: GameLoading }) as ComponentType<never>;
  componentCache.set(entry.id, C);
  return C;
}

/**
 * `initialMode`: hub'daki Sıralı/Pratik seçimi (`?kip=pratik`). Yalnız oyun pratik modunu
 * destekliyorsa uygulanır; aksi hâlde sıralı ile açılır.
 */
export function GameHost({ id, initialMode }: { id: string; initialMode?: GameMode }) {
  const entry = getGameEntry(id);
  if (!isPlayable(entry)) {
    // Sunucu sayfası zaten yönlendirir; istemci kaydı ile uyumsuzluk olursa dürüst durum.
    return (
      <p role="alert" className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
        Bu oyun şu anda oynanamıyor.
      </p>
    );
  }
  const Comp = lazyComponent(entry);
  if (entry.component.contract === 'legacy') {
    const Legacy = Comp as unknown as ComponentType<Record<string, never>>;
    return <Legacy />;
  }
  return <V2Host entry={entry} Game={Comp as unknown as V2GameComponent} initialMode={initialMode} />;
}

/** v2 sözleşmeli oyunların kabuğu: mod, duraklatma, oturum, sonuç. */
function V2Host({ entry, Game, initialMode }: { entry: GameEntry; Game: V2GameComponent; initialMode?: GameMode }) {
  const rankedOn = entry.modes.ranked !== false;
  const startMode: GameMode =
    !rankedOn || (initialMode === 'practice' && entry.modes.practice) ? 'practice' : 'ranked';
  const game = useMiniGame(entry.gameType, { initialMode: startMode });
  const [paused, setPaused] = useState(false);
  const copy = useMemo(() => getGameCopy(entry.gameType), [entry.gameType]);

  const accent = game.config?.accent ?? entry.accent;
  const playing = game.phase === 'playing';

  const { finish, reset, mode } = game;
  const onFinish = useCallback(
    (r: GameFinish) => {
      setPaused(false);
      void finish(r.score, r.won, r.proof);
    },
    [finish]
  );

  const onQuit = useCallback(() => {
    setPaused(false);
    if (mode === 'practice') {
      reset();
      return;
    }
    // Sıralı deneme başlangıçta harcanmıştır; çıkış = 0 skorla bitirme (dürüst kayıt).
    void finish(0, false);
  }, [finish, reset, mode]);

  const onModeChange = entry.modes.practice && rankedOn ? game.setMode : undefined;

  return (
    <GameShell
      title={game.config?.title ?? entry.title}
      emoji={game.config?.emoji ?? entry.emoji}
      description={game.config?.description ?? entry.tagline}
      accent={accent}
      phase={game.phase}
      alreadyPlayed={game.alreadyPlayed}
      rankedUsedToday={game.rankedUsedToday}
      result={game.result}
      rewardThreshold={game.config?.rewardThreshold}
      onStart={() => {
        setPaused(false);
        void game.start();
      }}
      gameType={entry.gameType}
      copy={copy}
      mode={game.mode}
      onModeChange={onModeChange}
      onPause={() => setPaused(true)}
      paused={paused}
      onResume={() => setPaused(false)}
      onQuit={onQuit}
      settings
      controls={entry.controls}
    >
      {playing && game.seed && game.config && (
        <Game
          id={entry.id}
          gameType={entry.gameType}
          mode={game.mode}
          seed={game.seed}
          config={game.config}
          content={game.content}
          answerKey={game.answerKey}
          paused={paused}
          onPauseRequest={() => setPaused(true)}
          onFinish={onFinish}
          fx={gameFx}
          accent={accent}
        />
      )}
    </GameShell>
  );
}
