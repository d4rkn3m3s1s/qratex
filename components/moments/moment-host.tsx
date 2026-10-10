'use client';

/**
 * An Motoru — Host (spec §2 `moment-host.tsx`).
 *
 * Müşteri panelinin (`app/customer/layout.tsx`) ve QR geri bildirim sayfasının kökünde
 * durur; kuyruktaki TEK anı oynatır:
 *   · puan kapsülü (küçük, kaydedilmeyen; `moments.points()`)
 *   · seviye / lig / rozet sahneleri (sunucuda `CustomerMoment` kaydı olan büyük anlar)
 *
 * Çekme: ilk bağlanışta ~1,2 sn gecikmeli, `moments.refresh()` olayında hemen, sekme
 * yeniden görünür olduğunda (en az 15 sn arayla). Arka planda POLLING YOK.
 * 401/403/ağ hatası sessizce yutulur.
 *
 * "Tam bir kez": büyük an GÖSTERİLMEYE BAŞLADIĞI anda `seen` POST edilir (sekme ortada
 * kapansa da tekrar oynamaz); aynı sekmede kuyruk aynı id'yi ikinci kez kabul etmez.
 *
 * Saygı: ekranda açık bir dialog varsa (karşılama videosu, onboarding, çark sonucu …) ya
 * da sekme gizliyse büyük anı BAŞLATMAZ; 1 sn aralıkla tekrar dener. Puan kapsülü akışı
 * kesmediği (`pointer-events: none`) için beklemez.
 *
 * Sahneler `next/dynamic` ile lazy; 3D parça yalnız bir sahne gerçekten oynayınca yüklenir.
 * Bir sahne yüklenemez/çökerse ya da süre sınırını aşarsa kuyruk tıkanmaz (sonrakine geçer).
 */
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { momentQueue, type QueueItem, type QueueSnapshot } from '@/lib/moments/queue';
import {
  MOMENTS_REFRESH_EVENT,
  fetchPendingMoments,
  markMomentsSeen,
  registerMomentHost,
  subscribeMomentHosts,
  tryStartNextMoment,
  type MomentHostHandle,
} from '@/lib/moments/client';
import type { Moment, MomentKind } from '@/lib/moments/types';
import { PointsCapsule } from './points-capsule';

/** Sahne bileşenlerinin props sözleşmesi (M3 sahneleri: `{ moment, onDone }`, default export). */
export type MomentSceneProps<K extends MomentKind> = {
  moment: Extract<Moment, { kind: K }>;
  onDone: () => void;
};

const LevelUpScene = dynamic<MomentSceneProps<'level_up'>>(() => import('./scenes/level-up-scene'), {
  ssr: false,
  loading: () => null,
});
const LeagueUpScene = dynamic<MomentSceneProps<'league_up'>>(() => import('./scenes/league-up-scene'), {
  ssr: false,
  loading: () => null,
});
const BadgeScene = dynamic<MomentSceneProps<'badge'>>(() => import('./scenes/badge-scene'), {
  ssr: false,
  loading: () => null,
});

/** İlk çekme gecikmesi (sayfa ilk boyamasını ve hidrasyonu ezmesin). */
const INITIAL_FETCH_DELAY_MS = 1200;
/** Sekme görünür olunca yeniden çekme için en kısa aralık. */
const VISIBILITY_REFETCH_MIN_MS = 15_000;
/** Dialog açık / sekme gizliyken büyük anı başlatmayı yeniden deneme aralığı. */
const BLOCKED_RETRY_MS = 1000;
/**
 * Bir sahne `onDone` çağırmazsa kuyruğu kurtaran emniyet süresi — GÖRÜNÜR süre
 * (sahneler ≤ 4,5 sn; azaltılmış harekette sade kart ≥ 5 sn okunur).
 */
const SCENE_SAFETY_MS = 20_000;
const SAFETY_TICK_MS = 1000;

const OPEN_DIALOG_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]';

/** Host dışındaki açık bir dialog var mı? (Host'un kendi sahneleri sayılmaz.) */
function hasBlockingDialog(hostRoot: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const nodes = document.querySelectorAll<HTMLElement>(OPEN_DIALOG_SELECTOR);
  for (const el of Array.from(nodes)) {
    if (hostRoot && hostRoot.contains(el)) continue;
    if (el.closest('[data-moment-host]')) continue;
    return true;
  }
  return false;
}

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

const subscribeQueue = (cb: () => void) => momentQueue.subscribe(cb);
const getQueueSnapshot = (): QueueSnapshot => momentQueue.getSnapshot();
const EMPTY_SNAPSHOT: QueueSnapshot = { active: null, pending: [] };
const getServerQueueSnapshot = (): QueueSnapshot => EMPTY_SNAPSHOT;

/** Oturumdaki kullanıcı (sekme içinde değişirse — çıkış/giriş — kuyruk sıfırlanır). */
let lastUserId: string | null = null;

/** Sahne çökerse ya da chunk yüklenemezse kuyruğu ilerletir. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[moments] sahne oynatılamadı:', error, info?.componentStack);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ActiveMoment({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  if (item.lane === 'points') return <PointsCapsule moment={item.data} onDone={onDone} />;
  const m = item.data;
  switch (m.kind) {
    case 'level_up':
      return <LevelUpScene moment={m} onDone={onDone} />;
    case 'league_up':
      return <LeagueUpScene moment={m} onDone={onDone} />;
    case 'badge':
      return <BadgeScene moment={m} onDone={onDone} />;
    default:
      return null;
  }
}

export function MomentHost() {
  const { data: session, status } = useSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  const userId = status === 'authenticated' && user?.role === 'CUSTOMER' && user.id ? user.id : null;

  // Liderlik: aynı anda birden çok Host bağlıysa yalnız ilki oynatır/çeker.
  const [handle, setHandle] = useState<MomentHostHandle | null>(null);
  const getIsLeader = useCallback(() => !!handle?.isLeader(), [handle]);
  const isLeader = useSyncExternalStore(subscribeMomentHosts, getIsLeader, () => false);

  const snapshot = useSyncExternalStore(subscribeQueue, getQueueSnapshot, getServerQueueSnapshot);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ── Kayıt (yalnız oturum açık müşteri) ─────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    if (lastUserId && lastUserId !== userId) momentQueue.reset(); // başka hesaba geçildi
    lastUserId = userId;
    const h = registerMomentHost();
    setHandle(h);
    return () => {
      h.release();
      setHandle((cur) => (cur === h ? null : cur));
    };
  }, [userId]);

  // ── Çekme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !isLeader) return;
    let alive = true;
    let inFlight = false;
    let again = false;
    let lastFetchAt = 0;

    const pull = async () => {
      if (!alive) return;
      if (inFlight) {
        again = true; // çekme sürerken gelen refresh kaybolmasın
        return;
      }
      inFlight = true;
      lastFetchAt = Date.now();
      try {
        const list = await fetchPendingMoments();
        if (alive && list.length > 0) momentQueue.enqueue(list);
      } finally {
        inFlight = false;
        if (alive && again) {
          again = false;
          void pull();
        }
      }
    };

    const initial = window.setTimeout(() => void pull(), INITIAL_FETCH_DELAY_MS);
    const onRefresh = () => void pull();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt >= VISIBILITY_REFETCH_MIN_MS) {
        void pull();
      }
    };
    window.addEventListener(MOMENTS_REFRESH_EVENT, onRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      window.clearTimeout(initial);
      window.removeEventListener(MOMENTS_REFRESH_EVENT, onRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, isLeader]);

  // ── Oynatma kapısı: etkin an yoksa sıradakini başlat ───────────────────────
  const active = snapshot.active;
  const head = snapshot.pending[0] ?? null;
  useEffect(() => {
    if (!userId || !isLeader || active || !head) return;
    let timer: number | null = null;

    const tryStart = () => {
      timer = null;
      const result = tryStartNextMoment(momentQueue, {
        canStartRecord: () => isPageVisible() && !hasBlockingDialog(rootRef.current),
        onRecordStart: (id) => void markMomentsSeen([id]),
      });
      if (result === 'blocked') timer = window.setTimeout(tryStart, BLOCKED_RETRY_MS);
    };

    tryStart();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [userId, isLeader, active, head]);

  // ── Emniyet: sahne bitmezse kuyruğu kurtar ─────────────────────────────────
  const activeKey = active?.key ?? null;
  const activeLane = active?.lane ?? null;
  useEffect(() => {
    if (!activeKey || activeLane !== 'record') return;
    // Yalnız GÖRÜNÜR süre sayılır: sahne saati gizli sekmede durur, dönünce sürer.
    let visibleMs = 0;
    const id = window.setInterval(() => {
      if (isPageVisible()) visibleMs += SAFETY_TICK_MS;
      if (visibleMs >= SCENE_SAFETY_MS) momentQueue.next(activeKey);
    }, SAFETY_TICK_MS);
    return () => window.clearInterval(id);
  }, [activeKey, activeLane]);

  if (!userId || !isLeader || !active) return null;

  const done = () => momentQueue.next(active.key);
  return (
    <div ref={rootRef} data-moment-host="">
      <SceneBoundary key={active.key} onError={done}>
        <ActiveMoment key={active.key} item={active} onDone={done} />
      </SceneBoundary>
    </div>
  );
}

export default MomentHost;
