'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Zap, Flame, ShieldAlert } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxWarn, sfxCombo, sfxPowerUp, sfxFanfare, haptic } from '@/lib/game-sounds';

const QUARANTINE_CHARGE_MS = 10000; // karantina şarj süresi
const QUARANTINE_DURATION_MS = 3500;

const DEF = getMiniGame('network-defender')!;
const W = 340;
const H = 400;
const NODE_COUNT = 11;
const ROUND_MS = 50_000;
const INFECT_LIMIT = 6; // bu kadar düğüm enfekte olursa kaybedersin

type NodeState = 'clean' | 'infected' | 'cleaning';
interface GNode {
  id: number;
  x: number;
  y: number;
  state: NodeState;
}

let _seq = 0;
function buildGraph(): { nodes: GNode[]; edges: [number, number][] } {
  const nodes: GNode[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const ang = (i / NODE_COUNT) * Math.PI * 2;
    const ring = i === 0 ? 0 : 0.62 + (i % 2) * 0.28;
    nodes.push({
      id: ++_seq,
      x: W / 2 + Math.cos(ang) * (W * 0.4) * ring,
      y: H / 2 + Math.sin(ang) * (H * 0.4) * ring,
      state: 'clean',
    });
  }
  // kenarlar: her düğümü 2 komşuya bağla + merkeze
  const edges: [number, number][] = [];
  for (let i = 1; i < NODE_COUNT; i++) {
    edges.push([0, i]);
    edges.push([i, 1 + (i % (NODE_COUNT - 1))]);
  }
  return { nodes, edges };
}

export function NetworkDefenderGame() {
  const game = useMiniGame('network-defender');
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<[number, number][]>([]);
  const [score, setScore] = useState(0);
  const [infectedCount, setInfectedCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [combo, setCombo] = useState(0);
  const [quarantinePct, setQuarantinePct] = useState(0);
  const [quarantineActive, setQuarantineActive] = useState(false);

  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<[number, number][]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const quarantineReadyAtRef = useRef(0);
  const quarantineUntilRef = useRef(0);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const playing = game.phase === 'playing';

  const sync = useCallback(() => {
    setNodes([...nodesRef.current]);
    setInfectedCount(nodesRef.current.filter((n) => n.state === 'infected').length);
  }, []);

  const endGame = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      runningRef.current = false;
      if (won) sfxWin();
      else sfxHit();
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    comboRef.current = 0;
    quarantineReadyAtRef.current = Date.now() + QUARANTINE_CHARGE_MS;
    quarantineUntilRef.current = 0;
    setScore(0);
    setCombo(0);
    setQuarantinePct(0);
    setQuarantineActive(false);
    const g = buildGraph();
    nodesRef.current = g.nodes;
    edgesRef.current = g.edges;
    setEdges(g.edges);
    // başlangıç enfeksiyonu
    const seed = g.nodes[2 + Math.floor(Math.random() * (g.nodes.length - 2))];
    seed.state = 'infected';
    sync();
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    // enfeksiyon yayılımı: zamanla hızlanır; karantinada durur.
    let spread: ReturnType<typeof setTimeout>;
    const scheduleSpread = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const interval = Math.max(700, 1400 - (elapsed / ROUND_MS) * 700);
      spread = setTimeout(() => {
        if (!runningRef.current) return;
        // karantina aktifse bu turu atla
        if (Date.now() >= quarantineUntilRef.current) {
          const ns = nodesRef.current;
          const infected = ns.filter((n) => n.state === 'infected');
          if (infected.length > 0) {
            const src = infected[Math.floor(Math.random() * infected.length)];
            const neighborIds = edgesRef.current
              .filter(([a, b]) => a === src.id || b === src.id)
              .map(([a, b]) => (a === src.id ? b : a));
            const targets = ns.filter((n) => neighborIds.includes(n.id) && n.state === 'clean');
            if (targets.length) {
              const t = targets[Math.floor(Math.random() * targets.length)];
              t.state = 'infected';
              sfxWarn();
              const rect = arenaRef.current?.getBoundingClientRect();
              if (rect) {
                fxRef.current?.ring((t.x / W) * rect.width, (t.y / H) * rect.height, '#f43f5e');
                fxRef.current?.burst((t.x / W) * rect.width, (t.y / H) * rect.height, '#f43f5e', 10);
              }
              sync();
              if (nodesRef.current.filter((n) => n.state === 'infected').length >= INFECT_LIMIT) {
                // Ağ enfekte oldu = KAYIP (ödül yok). Süre dolumundaki bitiş (aşağıda) skor eşiğini korur.
                endGame(false);
                return;
              }
            }
          }
        }
        scheduleSpread();
      }, interval);
    };
    scheduleSpread();

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTimeLeft(Math.max(0, Math.round((ROUND_MS - elapsed) / 1000)));
      // karantina şarjı / aktiflik HUD
      const left = quarantineReadyAtRef.current - Date.now();
      setQuarantinePct(Math.max(0, Math.min(100, Math.round((1 - left / QUARANTINE_CHARGE_MS) * 100))));
      setQuarantineActive(Date.now() < quarantineUntilRef.current);
      if (elapsed >= ROUND_MS) {
        clearInterval(tick);
        clearTimeout(spread);
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    }, 200);

    return () => {
      clearTimeout(spread);
      clearInterval(tick);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const cleanNode = useCallback(
    (node: GNode) => {
      if (!runningRef.current || node.state !== 'infected') return;
      const target = nodesRef.current.find((n) => n.id === node.id);
      if (!target) return;
      target.state = 'clean';
      comboRef.current += 1;
      setCombo(comboRef.current);
      const comboBonus = comboRef.current % 4 === 0 ? 1 : 0;
      scoreRef.current += 1 + comboBonus;
      setScore(scoreRef.current);
      sfxCombo(comboRef.current);
      haptic(8);
      const rect = arenaRef.current?.getBoundingClientRect();
      if (rect) {
        const sx = rect.width / W;
        const sy = rect.height / H;
        fxRef.current?.burst(node.x * sx, node.y * sy, DEF.accent, 20);
        fxRef.current?.ring(node.x * sx, node.y * sy, DEF.accent);
        fxRef.current?.floatText(node.x * sx, node.y * sy, comboBonus ? '+2' : '+1', '#c4b5fd');
        if (comboRef.current > 0 && comboRef.current % 4 === 0) {
          sfxFanfare();
          fxRef.current?.shockwave(node.x * sx, node.y * sy, DEF.accent, 150);
        }
      }
      sync();
      if (scoreRef.current >= DEF.maxScore) endGame(true);
    },
    [endGame, sync]
  );

  // Karantina: hazırsa tüm yayılımı geçici durdurur + dalga efekti.
  const fireQuarantine = useCallback(() => {
    if (!runningRef.current || Date.now() < quarantineReadyAtRef.current) return;
    quarantineReadyAtRef.current = Date.now() + QUARANTINE_CHARGE_MS;
    quarantineUntilRef.current = Date.now() + QUARANTINE_DURATION_MS;
    setQuarantineActive(true);
    sfxPowerUp();
    haptic([10, 30, 10]);
    const rect = arenaRef.current?.getBoundingClientRect();
    if (rect) fxRef.current?.shockwave(rect.width / 2, rect.height / 2, '#8b5cf6', 260);
  }, []);

  const nodeById = useCallback((id: number) => nodes.find((n) => n.id === id), [nodes]);

  return (
    <GameShell
      title={DEF.title}
      emoji={DEF.emoji}
      description={DEF.description}
      accent={DEF.accent}
      phase={game.phase}
      alreadyPlayed={game.alreadyPlayed}
      result={game.result}
      rewardThreshold={DEF.rewardThreshold}
      gameType={DEF.gameType}
      onStart={game.start}
      copy={getGameCopy(DEF.gameType)}
    >
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1.5 text-rose-400">
          <Network className="h-4 w-4" /> {infectedCount}/{INFECT_LIMIT}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><Zap className="h-4 w-4" /> {score}</div>
          {combo >= 2 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      {/* Karantina butonu */}
      <button
        onClick={fireQuarantine}
        disabled={quarantinePct < 100}
        className="mb-2 flex w-full items-center gap-2 rounded-full px-2 py-1 transition disabled:cursor-default"
        style={{ background: quarantineActive ? 'rgba(139,92,246,0.25)' : quarantinePct >= 100 ? 'rgba(139,92,246,0.15)' : 'transparent' }}
      >
        <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: quarantinePct >= 100 || quarantineActive ? '#a855f7' : '#52525b' }} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${quarantineActive ? 100 : quarantinePct}%`, background: quarantineActive ? 'linear-gradient(90deg,#a855f7,#22d3ee)' : quarantinePct >= 100 ? '#a855f7' : '#6d28d9' }} />
        </div>
        <span className="w-20 shrink-0 text-right text-[10px] font-bold" style={{ color: quarantinePct >= 100 || quarantineActive ? '#a855f7' : '#64748b' }}>
          {quarantineActive ? '🛡️ AKTİF' : quarantinePct >= 100 ? 'KARANTİNA!' : 'karantina'}
        </span>
      </button>

      <div
        ref={arenaRef}
        className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl"
        style={{ aspectRatio: `${W} / ${H}`, background: 'radial-gradient(circle at 50% 40%, #1a1240 0%, #0c0824 55%, #050310 90%)' }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          {edges.map(([a, b], i) => {
            const na = nodeById(a);
            const nb = nodeById(b);
            if (!na || !nb) return null;
            const danger = na.state === 'infected' || nb.state === 'infected';
            return (
              <line
                key={i}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke={danger ? '#f43f5e' : `${DEF.accent}`}
                strokeOpacity={danger ? 0.7 : 0.3}
                strokeWidth={danger ? 2 : 1.2}
              >
                {danger && (
                  <animate attributeName="stroke-opacity" values="0.3;0.9;0.3" dur="1s" repeatCount="indefinite" />
                )}
              </line>
            );
          })}
        </svg>

        {nodes.map((n) => {
          const infected = n.state === 'infected';
          return (
            <motion.button
              key={n.id}
              type="button"
              onClick={() => cleanNode(n)}
              animate={infected ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={infected ? { duration: 0.8, repeat: Infinity } : {}}
              className="absolute flex items-center justify-center rounded-full border-2"
              style={{
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
                width: n.id === nodes[0]?.id ? 40 : 30,
                height: n.id === nodes[0]?.id ? 40 : 30,
                transform: 'translate(-50%, -50%)',
                borderColor: infected ? '#f43f5e' : DEF.accent,
                background: infected
                  ? 'radial-gradient(circle, rgba(244,63,94,0.9), rgba(120,20,40,0.7))'
                  : `radial-gradient(circle, ${DEF.accent}cc, ${DEF.accent}44)`,
                boxShadow: infected ? '0 0 18px #f43f5e' : `0 0 12px ${DEF.accent}99`,
                cursor: infected ? 'pointer' : 'default',
              }}
            >
              <span className="text-sm">{infected ? '☣️' : '🟢'}</span>
            </motion.button>
          );
        })}

        <FxLayer ref={fxRef} />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">☣️ Enfekteyi temizle · 🛡️ karantina = yayılımı durdur · yayılım {INFECT_LIMIT}’e ulaşmasın!</p>
    </GameShell>
  );
}
