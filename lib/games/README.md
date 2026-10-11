# lib/games — oyun motoru, kayıt defteri ve sunucu otoritesi

Oyun ajanları için sözleşme. Karar belgeleri: `docs/audit/2026-10-08/00-YOL-HARITASI.md` §7 (portföy),
§4.2 (motion + 3D politikası: mini oyunlar **2D canvas**), `docs/audit/2026-10-08/sistem/oyun-ekosistemi.md`.

## Harita

| Yol | Ne | Kim içe aktarır |
|---|---|---|
| `engine/rng.ts` | Tohumlu PRNG (cyrb53 → mulberry32), `fork(label)` alt akışlar | istemci + sunucu (replay) |
| `engine/loop.ts` | Sabit adımlı döngü (60 Hz mantık, rAF çizim), gizlenince duraklar | istemci |
| `engine/canvas.ts` | DPR'lı canvas, mantıksal koordinat, `toLogical` | istemci |
| `engine/input.ts` | Klavye / kaydırma / işaretçi / sanal D-pad, basılı tutma tekrarı | istemci |
| `engine/record.ts` | Girdi kaydı `[adım, kod, a?, b?]` + sunucu şeması | istemci + sunucu |
| `engine/prefs.ts`, `engine/fx.ts` | Ses/titreşim tercihi + efekt cephesi (politika + An Motoru) | istemci |
| `engine/hooks.ts` | `useGameLoop`, `useCanvasSurface`, `useGameInput`, `useCoarsePointer`, `useGamePrefs`, `useLatestRef` | istemci (`'use client'`) |
| `verify/` | Doğrulayıcı tipleri, fabrikalar (`classificationVerifier`, `deterministicVerifier`, `actionVerifier`), `runVerifier` | sunucu (+ testler) |
| `content/pool.ts` | Etiketli havuz → tohumdan tur, pratik/sıralı havuz bölme | yalnız `*.server.ts` |
| `content/<id>.ts` | **Etiketli** içerik (oyun ajanı yazar) | yalnız `registry/<id>.server.ts` |
| `registry/index.ts` | 13 hedef oyun + 6 emekli + eski kimlik eşlemesi + `resolveGameRoute` | istemci + sunucu |
| `registry/<id>.ts` | Oyunun kaydı (bileşen yükleyici, durum, mod, kontroller) | istemci güvenli |
| `registry/<id>.server.ts` | Oyunun doğrulayıcısı (`serverModule`) | yalnız `registry/server.ts` |
| `registry/server.ts` | `gameType → doğrulayıcı`; tarayıcıda yüklenirse **fırlatır** | `lib/game-routes.ts` |

Sunucu kuralları (eşik, ödül, süre, `maxScorePerSec`, deneme penceresi) **hâlâ** `lib/minigame-config.ts`
`MINI_GAMES` / `PACMAN_GAME`'de; admin override'ı `lib/minigame-config-effective.ts`. Kayıt defteri ile bağ: `gameType`.
Deneme yaşam döngüsü (tohum, HMAC belirteç, günde 1, makullük, mint) `lib/game-session.ts`; HTTP `lib/game-routes.ts`.

Rotalar: `/customer/games/[game]` (tek dinamik sayfa) · API `POST /api/customer/games/[game]/{start,complete,practice}`.

## Bir oyunu canlıya almak / v2'ye taşımak (kontrol listesi)

1. **Saf mantık**: `components/customer/games/<id>/sim.ts` (ya da `lib/games/<id>/sim.ts`) — React'sız, `createRng(seed)`
   ile. Skoru etkileyen her rastgelelik tohumdan; `Math.random` yalnız kozmetik efektte.
2. **Bileşen** (v2): yalnız oynanış. Props `GameComponentProps` (aşağıda). Kabuk, mod, duraklatma, oturum ve
   ödül `app/customer/games/[game]/game-host.tsx`'te — bileşen `useMiniGame` ya da `GameShell` **kullanmaz**.
3. **Kayıt**: `registry/<id>.ts` → `component: { contract: 'v2', load: () => import('…').then((m) => m.X) }`,
   `status: 'live'`, `modes.practice: true`, `controls` metni.
4. **Doğrulayıcı**: `registry/<id>.server.ts` → `export const serverModule = { verifier: … }`.
5. **Sunucu kuralı**: `lib/minigame-config.ts`'teki satırdan (yeni oyunlarda) `hidden` + `release`'i kaldır; eşik /
   `maxScorePerSec` / `maxDurationSec`'i mekaniğe göre ayarla (`__tests__/lib/minigame-config.test.ts` makullük testleri).
6. **Eski sayfalar**: `app/customer/games/<eski-id>/page.tsx` → tek satırlık yönlendirme:
   ```tsx
   import { permanentRedirect } from 'next/navigation';
   export default function Page() { permanentRedirect('/customer/games/<yeni-id>?mod=<mod>'); }
   ```
   Aynı kimlikle devam eden oyunda (ör. `mind-thief`) eski klasörü **sil** — statik klasör dinamik rotayı gölgeler.
7. **Birleşen eski oyun**: sunucuda `hidden: true` (+ `hiddenReason`) — ama **turnuva rotasyonu tuzağına** bak.
8. Testler (aşağıda) + `tsc-check` 0 hata.

## v2 bileşen sözleşmesi

```ts
interface GameComponentProps {
  id: string; gameType: string;
  mode: 'ranked' | 'practice';
  seed: string;                              // sıralıda sunucudan; pratikte yeni tohum
  config: MiniGameConfig;                    // ETKİN yapılandırma — `getMiniGame(...)` DEF'i değil BU
  content: PublicContentItem[] | null;       // sınıflandırma: tur içeriği (sıralıda etiketsiz)
  answerKey: Record<string, string> | null;  // yalnız pratik: anında geri bildirim
  paused: boolean;                           // kabuk duraklattı → useGameLoop({ paused })
  onPauseRequest(): void;                    // Esc / sekme gizlendi
  onFinish(r: { score: number; won: boolean; proof?: GameProof }): void;  // BİR kez
  fx: GameFx;                                // ses/titreşim/konfeti/sarsıntı (politika + tercih)
  accent: string;
}
```

İskelet:

```tsx
'use client';
export function XGame({ seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: 360, height: 480 });
  const sim = useRef(createSim(seed));             // saf mantık
  const rec = useRef(createInputRecorder());
  const { getStep } = useGameLoop({
    active: true, paused,
    onAutoPause: onPauseRequest,
    update: (dt, step) => { if (sim.current.step(dt)) finish(); },
    render: () => draw(surface.current?.beginFrame(), sim.current),
  });
  useGameInput(canvasRef, {
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => { if (e.type === 'press') { if (e.action === 'pause') return onPauseRequest();
      rec.current.recordAction(getStep(), e.action); sim.current.input(e.action); } },
  });
  const finish = () => onFinish({ score: sim.current.score, won: sim.current.score >= config.rewardThreshold,
    proof: { log: rec.current.entries(), steps: getStep() } });
  return <canvas ref={canvasRef} className="w-full touch-none" aria-label="…" />;
}
```

Kurallar:
- **Mantık `update`'te, React state'e her karede yazma.** HUD için ≤ 10 Hz (ör. ref + `setInterval(…,100)`) ya da
  canvas'ta çiz. `aria-live="polite"` bir HUD özeti (skor/can) ekle — ekran okuyucu için.
- **Eşik/tavan `config`'ten** (admin override). `won` yalnız kozmetik; karar sunucunun.
- Konum CSS sarmalayıcıda, `scale/rotate` içteki `m.*` elemanda (framer inline transform Tailwind translate'i ezer).
- Canvas boyutu `clientWidth/clientHeight` (motor yapar); 3B yok (mini oyunlar 2D canvas — §4.2).
- Dokunmatik kontroller `useCoarsePointer()` ile gösterilir, **ekran genişliğiyle değil** (≥ 640 px iPad).
  Dokunma hedefi ≥ 44 px. Renk tek ayırt edici olmasın (ikon/desen de).
- Ses/titreşim yalnız `fx` üzerinden (`fx.sfx(() => sfxHit())`, `fx.haptic('success')`); konfeti `fx.confetti`.
  Azaltılmış harekette hepsi no-op; sarsıntı `fx.shake(px)` → 0.
- Ödül kutlaması (puan kapsülü, seviye/lig/rozet anları) **An Motoru**'nda — host halleder; oyun tekrar etmez.

## Doğrulayıcı aileleri (sunucu otoritesi)

| Aile | Kanıt (`proof`) | Sunucu ne yapar | Oyunlar |
|---|---|---|---|
| `classification` | `{ answers: [{ id, verdict, tMs }] }` | Turu **aynı tohumdan** yeniden kurar, cevapları puanlar; tekrarlı/turda olmayan id → `proof_invalid`; insanüstü hız / süre sonrası cevap → `implausible` | Sahte Avcısı, Günün Kelimesi, Bilgi Yarışması |
| `deterministic` | `{ log: InputLog, steps }` | `simulate(seed, log, steps)` ile replay; skor sunucunun; `steps/60 s` > sunucu süresi → `implausible` | Yılan, İstif, Birleştir, Sinyal, Eşleştir-3, Spam Kırıcı |
| `action` | `{ checkpoints: [[tMs, skor], …] }` (ör. 5 sn'de bir + bitiş) | Monotonluk, ≤ `maxGapSec` aralık, parça başına hız ≤ `maxScorePerSec × burstFactor`, istemci skoru son noktayı aşamaz | Zihin Hırsızı, Çekirdek Savunması, Kar Tanesi, Yıldız Avı |

```ts
// registry/fake-hunter.server.ts
import { classificationVerifier } from '@/lib/games/verify';
import { drawRound, splitPools } from '@/lib/games/content/pool';
import { FAKE_HUNTER_BANK } from '@/lib/games/content/fake-hunter';
const pools = splitPools(FAKE_HUNTER_BANK);
export const serverModule = {
  verifier: classificationVerifier({
    buildRound: (seed) => drawRound(pools.ranked, seed, { count: 12, minPerLabel: 4 }),
    practiceRound: (seed) => drawRound(pools.practice, seed, { count: 8 }),
  }),
};
```

- Bayraklar: `proof_missing`, `proof_invalid`, `implausible` → **kazanılmadı** (ödül yok, gerekçe kullanıcıya görünür);
  `score_mismatch` (|istemci − sunucu| > 0) yalnız sinyal. Sinyaller `AnalyticsEvent{ event: 'game_attempt_flagged',
  category: 'game_integrity' }` olarak yazılır (admin oyun detayı/inceleme için).
- `requireProof: true` varsayılandır. Kanıt gövdesi ≤ 256 KB, girdi kaydı ≤ 20.000 olay.
- Doğrulayıcı **saf ve senkron** olmalı (DB/ağ yok); `runVerifier` asla fırlatmaz.
- Ortak kurallar her zaman geçerli (`lib/game-session.ts`): HMAC belirteç, tohum DB'den, sunucu saatiyle min süre,
  saniye başına skor tavanı, deneme penceresi, `maxScore` kırpma, atomik tek seferlik `mintPoints`.

## İçerik dosyası deseni (sınıflandırma)

```ts
// lib/games/content/fake-hunter.ts  — YALNIZ registry/fake-hunter.server.ts import eder
import type { ContentItem } from './pool';
export const FAKE_HUNTER_BANK: ContentItem<'real' | 'fake', { text: string; mode: 'kaydir' | 'dosya' | 'kelime' | 'profil' }>[] = [
  { id: 'fh-0001', label: 'fake', difficulty: 2, payload: { text: '…', mode: 'kaydir' } },
];
```
- `payload` istemciye gider: **etiket ya da etiketi ele veren alan koyma.** Tur kimlikleri opak (`q0…`).
- Havuz kimlikleri kalıcı ve benzersiz (`<oyun>-<sıra>`); `splitPools` pratik payını kimlik karmasıyla ayırır —
  kimliği değiştirmek öğeyi havuzlar arasında taşır.
- Gerçek kullanıcı yorumu kullanılacaksa anonimleştirilmiş ve onaylı olmalı (KVKK); sahte örnekler "karikatür" değil.

## Modlar ve ekonomi

- **Sıralı**: `POST …/start` → deneme başlangıçta harcanır; günde **1** (şema: `@@unique([userId, gameType, dayKey])`;
  günde N için `MiniGameAttempt` şeması gerekir). Ödül `mintPoints` ile, oyun kategorisi tavanı `lib/economy/caps.ts`
  (günde 600, haftada 3.000). Liderlik/turnuva yalnız sıralı denemelerden beslenir.
- **Pratik**: `POST …/practice` → ödülsüz, DB'ye yazmaz, liderliğe/turnuvaya/seriye girmez, her çağrıda yeni tohum.
  Sonuç sunucuya gönderilmez. Dakikada 30 tur sınırı.
- Kayıt girdisinde `modes.practice: false` → kabuk mod seçimini göstermez (eski sözleşmeli oyunlar).

## Turnuva rotasyonu (dondurulmuş takvim)

Öne çıkan (ödüllü) oyun `featuredGameForWeek(weekKey)` → `lib/game-tournament.ts` `TOURNAMENT_ROTATION` takviminden
gelir; `visibleMiniGames()`'ten **türetilmez** (eskiden emekli-ama-gizli-olmayan 8 kimlik rotasyondaydı, Yıldız Avı
hiç aday değildi ve bir oyunu gizlemek haftanın oyununu kaydırıyordu). Portföy değişince mevcut dilimlere **dokunma**;
sona `fromWeek`'i gelecek bir hafta olan yeni dilim ekle (`__tests__/lib/game-tournament.test.ts` son dilimin yalnız
canlı + optIn olmayan oyunlardan oluştuğunu ve dilimlerin sıralı olduğunu denetler). Ödül: günlük `tournament-settle`
işi geçen haftanın ilk 3'üne otomatik kredi eder; talep ucu aynı `creditTournamentPrize`'ı çağırır (`lib/game-rankings.ts`).
Oyun günü (`gameDayKey`) Europe/Istanbul takvim günüdür; turnuva haftası ISO/UTC (Pazartesi 03:00 TSİ).

## Test deseni

- Saf mantık: `__tests__/lib/<id>-sim.test.ts` — aynı tohum + aynı kayıt → aynı skor; bilinen kayıtla altın skor.
- Doğrulayıcı: `runVerifier` ile dürüst kanıt geçer, şişirilmiş skor sunucu skoruna iner, kanıtsız/bozuk/hızlandırılmış
  kanıt bloklanır (örnek: `__tests__/lib/games-verify.test.ts`).
- HTTP: `__tests__/api/games-practice-verify.test.ts` deseni (prisma + economy + rate-limit mock; `registry/server`
  mock'u ile doğrulayıcı bağlanır). Gerçek DB'ye **bağlanma**.
- Kayıt defteri hizası: `__tests__/lib/games-registry.test.ts` (yeni oyun eklenince otomatik denetlenir).
