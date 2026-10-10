/**
 * Mutlu saat akışı — zamanlama + biçimlendirme adaptörü (saf; Jest ile test edilir).
 * Keşfet → Fırsatlar sekmesi ve mekân detayı kullanır (eski konum: app/customer/campaigns/_lib).
 *
 * P0-39 (müşteri · kampanyalar) kök nedeni: sayfa `GET /api/happy-hour` yanıtında hiç olmayan
 * `happyHours` alanını ve hiçbir nesnede üretilmeyen `isActiveNow` bayrağını okuyordu; liste
 * canlıda HER ZAMAN boştu. Uç yanıt şeklinin sahibi F0.5/B1 şeridi olduğundan sayfa artık şekle
 * değil bu adaptöre bağlıdır. Adaptör bugünkü (`activeNow`/`upcoming`), zarf v2 (`data.*`) ve
 * liste (`happyHours`/`items`/`offers`) biçimlerini kabul eder, kayıtları doğrular ve tekilleştirir.
 *
 * Zaman semantiği puanlamayla AYNIDIR: `SS:dd` ve `daysOfWeek`, mutlu saat saat diliminin
 * (`HAPPY_HOUR_TIME_ZONE`; yanıt `timeZone` verirse o) duvar saatidir ve canlılık
 * `lib/happy-hour-live.ts#isHappyHourLive` ile hesaplanır — tüketimde çarpanı uygulayan
 * fonksiyonun ta kendisi. Pencereler mutlak anlara çevrilip kullanıcının saat diliminde
 * basılır; böylece "gösterilen saat" ile "çarpanın uygulandığı saat" her zaman aynıdır.
 * Gösterilen çarpan da puana gerçekten uygulanan (politika aralığına kırpılmış) değerdir.
 */
import { HAPPY_HOUR_TIME_ZONE, isHappyHourLive } from '@/lib/happy-hour-live';
import { clampHappyHourMultiplier } from '@/lib/points-multipliers';

export interface HappyHourOffer {
  id: string;
  name: string;
  description: string | null;
  /** Puana uygulanan çarpan (politika aralığına kırpılmış). */
  multiplier: number;
  startTime: string;
  endTime: string;
  /** Mutlu saat saat dilimindeki haftanın günleri (0=Pazar). Boş → puanlamadaki gibi "her gün". */
  days: number[];
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  dealer: { id: string; businessName: string | null; image: string | null } | null;
  /** `global`: tüm işletmeler (dealerId=null). */
  scope: 'dealer' | 'global';
}

export interface OfferWindow {
  start: Date;
  /** Hariç üst sınır (son dakikanın sonu). */
  end: Date;
}

export type OfferStatus = 'live' | 'today' | 'upcoming';

export interface ScheduledOffer extends HappyHourOffer {
  status: OfferStatus;
  /** Canlıysa içinde bulunulan pencere, değilse bir sonraki pencere. */
  window: OfferWindow | null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function parseDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const d of raw) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function parseMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Tek kaydı doğrula; bozuk kayıt (saat/çarpan/ad) listeyi çökertmek yerine atlanır. */
export function parseOffer(raw: unknown): HappyHourOffer | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = str(r.id);
  const name = str(r.name);
  const startTime = str(r.startTime);
  const endTime = str(r.endTime);
  if (!id || !name || !startTime || !endTime || !HHMM.test(startTime) || !HHMM.test(endTime)) return null;
  if (startTime === endTime) return null;
  const rawMultiplier = Number(r.effectiveMultiplier ?? r.multiplier);
  if (!Number.isFinite(rawMultiplier)) return null;
  // Gösterilen = puana uygulanan (canlıdaki eski aşırı kayıtlar da aynı aralığa kırpılır).
  const multiplier = clampHappyHourMultiplier(rawMultiplier);
  // 1x müşteriye fayda vaat etmez.
  if (multiplier <= 1) return null;
  const dealerRec = asRecord(r.dealer);
  const dealer = dealerRec
    ? { id: str(dealerRec.id) ?? '', businessName: str(dealerRec.businessName), image: str(dealerRec.image) }
    : null;
  const dealerId = r.dealerId === undefined ? dealer?.id || null : str(r.dealerId);
  return {
    id,
    name,
    description: str(r.description),
    multiplier: Math.round(multiplier * 10) / 10,
    startTime,
    endTime,
    days: parseDays(r.daysOfWeek ?? r.days),
    isActive: r.isActive === undefined ? true : r.isActive === true,
    validFrom: toDate(r.validFrom),
    validUntil: toDate(r.validUntil),
    dealer,
    scope: dealerId ? 'dealer' : 'global',
  };
}

const LIST_KEYS = ['activeNow', 'upcoming', 'happyHours', 'items', 'offers'] as const;

/**
 * Yanıt gövdesini teklif listesine çevirir. Tanınan biçimler (kök ya da `data` içinde):
 * `{ activeNow, upcoming }`, `{ happyHours }`, `{ items }`, `{ offers }` ya da düz dizi.
 */
export function parseHappyHourFeed(body: unknown): HappyHourOffer[] {
  return parseHappyHourFeedWithZone(body).offers;
}

/** Teklifler + mutlu saatlerin yorumlandığı saat dilimi (yanıttaki `timeZone`, yoksa varsayılan). */
export function parseHappyHourFeedWithZone(body: unknown): { offers: HappyHourOffer[]; timeZone: string } {
  const sources: unknown[] = [];
  const root = asRecord(body);
  const envelope = root ? asRecord(root.data) : null;
  if (Array.isArray(body)) sources.push(...body);
  if (root && Array.isArray(root.data)) sources.push(...root.data);
  for (const container of [envelope, root]) {
    if (!container) continue;
    for (const key of LIST_KEYS) {
      const list = container[key];
      if (Array.isArray(list)) sources.push(...list);
    }
  }
  const byId = new Map<string, HappyHourOffer>();
  for (const raw of sources) {
    const offer = parseOffer(raw);
    if (offer && offer.isActive && !byId.has(offer.id)) byId.set(offer.id, offer);
  }
  const zoneRaw = str(envelope?.timeZone) ?? str(root?.timeZone);
  return {
    offers: [...byId.values()],
    timeZone: zoneRaw && isValidTimeZone(zoneRaw) ? zoneRaw : HAPPY_HOUR_TIME_ZONE,
  };
}

// ───────────────────────────── Saat dilimi yardımcıları ─────────────────────────────

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    zoneFormatters.set(timeZone, f);
  }
  return f;
}

/** Anın `timeZone` duvar saati bileşenleri. */
function zonedParts(ts: number, timeZone: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const out = { y: 1970, m: 1, d: 1, h: 0, min: 0, s: 0 };
  for (const p of zoneFormatter(timeZone).formatToParts(new Date(ts))) {
    if (p.type === 'year') out.y = Number(p.value);
    else if (p.type === 'month') out.m = Number(p.value);
    else if (p.type === 'day') out.d = Number(p.value);
    else if (p.type === 'hour') out.h = Number(p.value) % 24;
    else if (p.type === 'minute') out.min = Number(p.value);
    else if (p.type === 'second') out.s = Number(p.value);
  }
  return out;
}

/** `timeZone`'un o andaki UTC farkı (ms; duvar − UTC). */
function zoneOffsetMs(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return wall - Math.floor(ts / 1000) * 1000;
}

/** `timeZone` duvar saatindeki takvim günü + dakika → mutlak an (yaz saati geçişlerine dayanıklı). */
export function zonedWallTimeToUtc(y: number, month0: number, day: number, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(y, month0, day, 0, minutes);
  const off1 = zoneOffsetMs(guess, timeZone);
  let ts = guess - off1;
  const off2 = zoneOffsetMs(ts, timeZone);
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

/**
 * Seçili gün D için puanlamanın kabul ettiği aralık (lib/happy-hour-live ile aynı):
 *  - normal: D başlangıç … D bitiş (bitiş dakikası dahil),
 *  - gece taşan: D başlangıç … D+1 bitiş (gece yarısı sonrası kısım ÖNCEKİ günün seçimine bağlı).
 */
function dayWindow(y: number, month0: number, day: number, startM: number, endM: number, timeZone: string): OfferWindow {
  const start = zonedWallTimeToUtc(y, month0, day, startM, timeZone);
  const end =
    endM > startM
      ? zonedWallTimeToUtc(y, month0, day, endM + 1, timeZone)
      : zonedWallTimeToUtc(y, month0, day + 1, endM + 1, timeZone);
  return { start, end };
}

/** Bitişik/örtüşen aralıkları birleştir (ardışık günlere yayılan pencere tek görünsün). */
function mergeSegments(segments: OfferWindow[]): OfferWindow[] {
  const sorted = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: OfferWindow[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start.getTime() <= last.end.getTime()) {
      if (s.end.getTime() > last.end.getTime()) last.end = s.end;
    } else {
      out.push({ start: new Date(s.start), end: new Date(s.end) });
    }
  }
  return out;
}

/**
 * Şimdiyi içeren ya da sıradaki pencere (geçerlilik tarihleriyle kırpılmış). 8 gün ileriye
 * bakılır; pencere yoksa (süresi dolmuş, gelecekte gün yok) `null`.
 */
export function currentOrNextWindow(
  offer: HappyHourOffer,
  now: Date,
  timeZone: string = HAPPY_HOUR_TIME_ZONE
): OfferWindow | null {
  const startM = parseMinutes(offer.startTime);
  const endM = parseMinutes(offer.endTime);
  if (!Number.isFinite(startM) || !Number.isFinite(endM) || startM === endM) return null;
  const days = offer.days.length > 0 ? offer.days : ALL_DAYS;
  const today = zonedParts(now.getTime(), timeZone);
  const segments: OfferWindow[] = [];
  for (let offset = -1; offset <= 8; offset++) {
    const cal = new Date(Date.UTC(today.y, today.m - 1, today.d + offset));
    if (!days.includes(cal.getUTCDay())) continue;
    segments.push(dayWindow(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), startM, endM, timeZone));
  }
  const from = offer.validFrom?.getTime() ?? -Infinity;
  const until = offer.validUntil?.getTime() ?? Infinity;
  for (const w of mergeSegments(segments)) {
    const start = Math.max(w.start.getTime(), from);
    const end = Math.min(w.end.getTime(), until);
    if (end <= start || end <= now.getTime()) continue;
    return { start: new Date(start), end: new Date(end) };
  }
  return null;
}

/** Kullanıcının (ya da verilen) saat dilimindeki takvim günü anahtarı. */
function localDayKey(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Teklifleri duruma ayırır ve sıralar: canlılar (en yüksek çarpan, sonra en erken biten)
 * ardından sıradakiler (en erken başlayan). Penceresi kalmayan kayıtlar elenir.
 *
 * @param timeZone kullanıcının saat dilimi ("bugün" ayrımı için; yoksa tarayıcınınki)
 * @param happyHourTimeZone `SS:dd` değerlerinin yorumlandığı saat dilimi
 */
export function scheduleOffers(
  offers: HappyHourOffer[],
  now: Date,
  timeZone?: string,
  happyHourTimeZone: string = HAPPY_HOUR_TIME_ZONE
): ScheduledOffer[] {
  const todayKey = localDayKey(now, timeZone);
  const scheduled: ScheduledOffer[] = [];
  for (const offer of offers) {
    const live = isHappyHourLive(
      {
        startTime: offer.startTime,
        endTime: offer.endTime,
        daysOfWeek: offer.days,
        isActive: offer.isActive,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
      },
      now,
      happyHourTimeZone
    );
    const window = currentOrNextWindow(offer, now, happyHourTimeZone);
    if (live) {
      scheduled.push({ ...offer, status: 'live', window });
      continue;
    }
    if (!window) continue;
    const status: OfferStatus = localDayKey(window.start, timeZone) === todayKey ? 'today' : 'upcoming';
    scheduled.push({ ...offer, status, window });
  }
  return scheduled.sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    if (a.status === 'live' && b.status === 'live') {
      if (b.multiplier !== a.multiplier) return b.multiplier - a.multiplier;
      return (a.window?.end.getTime() ?? Infinity) - (b.window?.end.getTime() ?? Infinity);
    }
    return (a.window?.start.getTime() ?? Infinity) - (b.window?.start.getTime() ?? Infinity);
  });
}

// ───────────────────────────── Biçimlendirme ─────────────────────────────

export type FeedLocale = 'tr' | 'en';

function tag(locale: FeedLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

export function formatClock(d: Date, locale: FeedLocale, timeZone?: string): string {
  return new Intl.DateTimeFormat(tag(locale), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(d);
}

/** Pencerenin yerel saat aralığı: "15:00 – 17:00" (bitiş, son dakika olarak gösterilir). */
export function formatWindowRange(w: OfferWindow, locale: FeedLocale, timeZone?: string): string {
  const lastMinute = new Date(w.end.getTime() - MINUTE);
  return `${formatClock(w.start, locale, timeZone)} – ${formatClock(lastMinute, locale, timeZone)}`;
}

/** "Bugün", "Yarın" ya da yerel gün adı. */
export function formatDayLabel(d: Date, now: Date, locale: FeedLocale, timeZone?: string): string {
  const key = localDayKey(d, timeZone);
  if (key === localDayKey(now, timeZone)) return locale === 'en' ? 'Today' : 'Bugün';
  if (key === localDayKey(new Date(now.getTime() + DAY), timeZone)) return locale === 'en' ? 'Tomorrow' : 'Yarın';
  return new Intl.DateTimeFormat(tag(locale), { weekday: 'long', timeZone }).format(d);
}

/** Kalan süre: "42 dk", "1 sa 5 dk", "2 gün". */
export function formatDuration(ms: number, locale: FeedLocale): string {
  const totalMin = Math.max(1, Math.ceil(ms / MINUTE));
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  const u = locale === 'en' ? { d: 'd', h: 'h', m: 'min' } : { d: 'gün', h: 'sa', m: 'dk' };
  if (days > 0) return hours > 0 ? `${days} ${u.d} ${hours} ${u.h}` : `${days} ${u.d}`;
  if (hours > 0) return minutes > 0 ? `${hours} ${u.h} ${minutes} ${u.m}` : `${hours} ${u.h}`;
  return `${minutes} ${u.m}`;
}

/**
 * Tekrar eden günler — kullanıcının saat diliminde. Her seçili günün başlangıç anı (mutlu saat
 * saat diliminde) kullanıcının yerel gününe çevrilir; saat dilimi farkı günü kaydırıyorsa doğru
 * gün görünür. Pazartesiden başlayarak sıralı; 7 gün → "Her gün".
 */
export function formatRecurrence(
  offer: HappyHourOffer,
  locale: FeedLocale,
  timeZone?: string,
  happyHourTimeZone: string = HAPPY_HOUR_TIME_ZONE
): string {
  const days = offer.days.length > 0 ? offer.days : ALL_DAYS;
  if (days.length === 7) return locale === 'en' ? 'Every day' : 'Her gün';
  const startM = parseMinutes(offer.startTime);
  // Referans hafta: 2024-01-07 Pazar. Gün d → o haftanın d. günü, başlangıç dakikası.
  const weekdayFmt = new Intl.DateTimeFormat(tag(locale), { weekday: 'short', timeZone });
  const isoFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone });
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const local = days
    .map((d) => zonedWallTimeToUtc(2024, 0, 7 + d, Number.isFinite(startM) ? startM : 0, happyHourTimeZone))
    .map((instant) => ({ label: weekdayFmt.format(instant), idx: order.indexOf(isoFmt.format(instant)) }))
    .sort((a, b) => a.idx - b.idx);
  const unique = local.filter((v, i, arr) => arr.findIndex((x) => x.idx === v.idx) === i);
  if (unique.length === 7) return locale === 'en' ? 'Every day' : 'Her gün';
  return unique.map((v) => v.label).join(', ');
}

/** Çarpan metni: 2 → "2x", 1.5 → "1,5x" (TR). */
export function formatMultiplier(m: number, locale: FeedLocale): string {
  return `${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 1 }).format(m)}x`;
}
