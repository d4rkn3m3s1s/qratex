/**
 * An Motoru sahne matematiği (spec §3): zaman çizelgesi sözleşmeleri, duraklatılabilen
 * sahne saati, DPR tavanı, kadraj, seviye modeli, odometre, rozet ikonu sınıflandırma
 * ve odak tuzağı döngüsü.
 */
import { DURATION_MS } from '@/lib/motion/tokens';
import { calculateLevel } from '@/lib/utils';
import {
  GEM_TIMELINE,
  MAX_STAGE_DPR,
  MEDALLION_TIMELINE,
  MIN_DISMISS_MS,
  RING_TIMELINE,
  SCENE_DURATION_MS,
  backbufferSize,
  burstEnvelope,
  classifyBadgeIcon,
  createSceneClock,
  easeOutBack,
  fitVerticalFov,
  formatSceneInt,
  halfExtentAt,
  levelSceneModel,
  nextFocusIndex,
  odometerColumns,
  progressBetween,
  reducedSceneDurationMs,
  remainingMs,
  secToMs,
  stageDpr,
  upcomingMarks,
} from '@/components/moments/scenes/scene-math';

describe('süre ve zaman çizelgesi sözleşmeleri', () => {
  it('hiçbir sahne moment token sınırını (4,5 sn) aşmaz; seviye ~4, rozet ~3 sn', () => {
    for (const ms of Object.values(SCENE_DURATION_MS)) expect(ms).toBeLessThanOrEqual(DURATION_MS.moment);
    expect(SCENE_DURATION_MS.level_up).toBe(4000);
    expect(SCENE_DURATION_MS.league_up).toBe(4500);
    expect(SCENE_DURATION_MS.badge).toBe(3000);
  });

  it('kilit anlar sahne süresi içinde ve DOM metinleri okunacak kadar erken', () => {
    expect(secToMs(RING_TIMELINE.burstAt)).toBeLessThan(SCENE_DURATION_MS.level_up - 1500);
    expect(secToMs(GEM_TIMELINE.landAt)).toBeLessThan(SCENE_DURATION_MS.league_up - 1500);
    expect(secToMs(MEDALLION_TIMELINE.revealAt)).toBeLessThan(SCENE_DURATION_MS.badge - 1500);
    // Lig: eski amblem dağılmadan yeni taş inmeye başlar, zemin inişten önce döner.
    expect(GEM_TIMELINE.holdOld).toBeLessThan(GEM_TIMELINE.descendStart);
    expect(GEM_TIMELINE.backdropTo).toBeLessThanOrEqual(GEM_TIMELINE.landAt);
    // Rozet: ikon takla bitmeden hemen önce açılır.
    expect(MEDALLION_TIMELINE.revealAt).toBeGreaterThan(MEDALLION_TIMELINE.flipStart);
    expect(MEDALLION_TIMELINE.revealAt).toBeLessThanOrEqual(MEDALLION_TIMELINE.flipEnd);
  });

  it('kazara dokunuş penceresi kısa; azaltılmış kart en az 5 sn durur', () => {
    expect(MIN_DISMISS_MS).toBeLessThan(500);
    expect(reducedSceneDurationMs('badge')).toBe(5000);
    expect(reducedSceneDurationMs('league_up')).toBeGreaterThanOrEqual(SCENE_DURATION_MS.league_up);
  });
});

describe('createSceneClock (sekme gizlenince duran ortak saat)', () => {
  it('başlamadan 0; başladıktan sonra geçen süre', () => {
    const c = createSceneClock();
    expect(c.elapsedMs(500)).toBe(0);
    expect(c.started()).toBe(false);
    c.start(1000);
    expect(c.started()).toBe(true);
    expect(c.running()).toBe(true);
    expect(c.elapsedMs(1600)).toBe(600);
  });

  it('duraklatınca donar, devam edince kaldığı yerden sürer (gizli sekmede sahne tükenmez)', () => {
    const c = createSceneClock();
    c.start(0);
    c.pause(1000);
    expect(c.running()).toBe(false);
    expect(c.elapsedMs(60_000)).toBe(1000);
    c.resume(60_000);
    expect(c.elapsedMs(60_500)).toBe(1500);
  });

  it('ikinci start ve çift pause/resume etkisiz; başlamamış saat resume ile başlamaz', () => {
    const c = createSceneClock();
    c.resume(100);
    expect(c.started()).toBe(false);
    c.start(0);
    c.start(5000);
    expect(c.elapsedMs(1000)).toBe(1000);
    c.pause(1000);
    c.pause(2000);
    c.resume(3000);
    c.resume(4000);
    expect(c.elapsedMs(3500)).toBe(1500);
  });

  it('geriye giden zaman damgası negatif süre üretmez', () => {
    const c = createSceneClock();
    c.start(1000);
    expect(c.elapsedMs(900)).toBe(0);
  });
});

describe('upcomingMarks', () => {
  it('geçmiş işaretleri atar, tekrarı siler, sıralar', () => {
    expect(upcomingMarks([1300, 300, 1300, 4000, Number.NaN], 500)).toEqual([
      { mark: 1300, inMs: 800 },
      { mark: 4000, inMs: 3500 },
    ]);
    expect(upcomingMarks([100], 100)).toEqual([]);
  });

  it('remainingMs duraklatma ile tutarlı', () => {
    expect(remainingMs(4000, 1000, null, 99_999)).toBe(3000);
    expect(remainingMs(4000, 1000, 2000, 2500)).toBe(2500);
    expect(remainingMs(4000, 5000, null, 0)).toBe(0);
  });
});

describe('render bütçesi ve kadraj', () => {
  it('DPR en fazla 1,5; geçersiz değer → 1', () => {
    expect(MAX_STAGE_DPR).toBe(1.5);
    expect(stageDpr(3)).toBe(1.5);
    expect(stageDpr(1)).toBe(1);
    expect(stageDpr(undefined)).toBe(1);
    expect(stageDpr(Number.NaN)).toBe(1);
    expect(stageDpr(-2)).toBe(1);
  });

  it('arka tampon en az 1 piksel (0 boyutlu kapsayıcı WebGL hatası üretmez)', () => {
    expect(backbufferSize(0, 0, 1.5)).toEqual({ w: 1, h: 1 });
    expect(backbufferSize(400, 300, 1.5)).toEqual({ w: 600, h: 450 });
    expect(backbufferSize(Number.NaN, 10, 1)).toEqual({ w: 1, h: 10 });
  });

  it('portre ekranda dikey FOV genişler → küçük kenar her oranda aynı dünya ölçüsünü görür', () => {
    expect(fitVerticalFov(16 / 9, 40)).toBe(40);
    const v = fitVerticalFov(0.5, 40);
    expect(v).toBeGreaterThan(40);
    const horizHalf = Math.atan(Math.tan((v * Math.PI) / 360) * 0.5);
    expect(horizHalf).toBeCloseTo((40 * Math.PI) / 360, 6);
    expect(fitVerticalFov(0.01, 40)).toBeLessThanOrEqual(120);
    expect(fitVerticalFov(Number.NaN, 40)).toBe(40);
    expect(halfExtentAt(6, 40)).toBeCloseTo(6 * Math.tan((20 * Math.PI) / 180), 6);
  });

  it('easing ve zarflar sınırlı', () => {
    expect(progressBetween(5, 1, 3)).toBe(1);
    expect(progressBetween(0, 1, 3)).toBe(0);
    expect(progressBetween(2, 1, 3)).toBe(0.5);
    expect(easeOutBack(0)).toBeCloseTo(0, 6);
    expect(easeOutBack(1)).toBeCloseTo(1, 6);
    expect(burstEnvelope(0.5, 1)).toBe(0);
    expect(burstEnvelope(1.3, 1)).toBeCloseTo(1, 6);
    expect(burstEnvelope(10, 1)).toBeLessThan(0.01);
  });
});

describe('levelSceneModel', () => {
  it('xp formülle tutarlıysa ilerleme ve kalan XP gösterilir', () => {
    let xp = 0;
    while (calculateLevel(xp) < 2) xp += 50;
    const m = levelSceneModel({ from: 1, to: 2, xp });
    expect(m.from).toBe(1);
    expect(m.to).toBe(2);
    expect(m.progressPct).not.toBeNull();
    expect(m.progressPct!).toBeGreaterThanOrEqual(0);
    expect(m.progressPct!).toBeLessThanOrEqual(100);
    expect(m.xpToNext).not.toBeNull();
  });

  it('tutarsız/bozuk yük → çubuk gösterilmez, seviyeler makul', () => {
    expect(levelSceneModel({ from: 9, to: 3, xp: 0 })).toEqual({ from: 2, to: 3, progressPct: null, xpToNext: null });
    expect(levelSceneModel(null)).toEqual({ from: 1, to: 1, progressPct: null, xpToNext: null });
    expect(levelSceneModel({ from: 1, to: 5, xp: Number.NaN }).progressPct).toBeNull();
  });
});

describe('odometerColumns', () => {
  it('basamak basamak eşleşir; kısa eski değer baştaki sütunu boş bırakır', () => {
    expect(odometerColumns(9, 10)).toEqual([
      { from: null, to: 1 },
      { from: 9, to: 0 },
    ]);
    expect(odometerColumns(12, 13)).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 3 },
    ]);
  });

  it('uzun eski değer sağdan kırpılır', () => {
    expect(odometerColumns(123, 5)).toEqual([{ from: 3, to: 5 }]);
  });
});

describe('classifyBadgeIcon (img src güvenliği)', () => {
  it('yerel yol, https ve resim data URI görseldir', () => {
    expect(classifyBadgeIcon('/badges/star.svg')).toBe('image');
    expect(classifyBadgeIcon('https://cdn.example.com/a.png')).toBe('image');
    expect(classifyBadgeIcon('data:image/png;base64,AAAA')).toBe('image');
  });

  it('tehlikeli şemalar ve protokol-göreli URL görsel sayılmaz', () => {
    expect(classifyBadgeIcon('javascript:alert(1)')).toBe('none');
    expect(classifyBadgeIcon('//evil.example/x.png')).toBe('none');
    expect(classifyBadgeIcon('/\\evil.example/x.png')).toBe('none');
    expect(classifyBadgeIcon('\\\\evil.example\\x.png')).toBe('none');
    expect(classifyBadgeIcon('data:text/html,<script>')).toBe('none');
    expect(classifyBadgeIcon('http://insecure.example/x.png')).toBe('none');
  });

  it('emoji / kısa simge ve boş değer', () => {
    expect(classifyBadgeIcon('\u{1F3C6}')).toBe('emoji');
    expect(classifyBadgeIcon('')).toBe('none');
    expect(classifyBadgeIcon(null)).toBe('none');
  });
});

describe('odak tuzağı', () => {
  it('Tab sondan başa, Shift+Tab baştan sona döner', () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 1, false)).toBe(2);
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });
});

describe('formatSceneInt', () => {
  it('Türkçe binlik ayraç', () => {
    expect(formatSceneInt(1234567)).toBe('1.234.567');
    expect(formatSceneInt(999)).toBe('999');
    expect(formatSceneInt(-12000)).toBe('-12.000');
    expect(formatSceneInt(Number.NaN)).toBe('0');
  });
});
