/**
 * Happy hour penceresi: gün + HH:mm aralığı (bitiş < başlangıç ise gece taşması).
 */
export function isHappyHourLive(
  hh: {
    startTime: string;
    endTime: string;
    daysOfWeek: unknown;
    isActive: boolean;
    validFrom: Date | null;
    validUntil: Date | null;
  },
  now: Date
): boolean {
  if (!hh.isActive) return false;
  if (hh.validFrom && now < new Date(hh.validFrom)) return false;
  if (hh.validUntil && now > new Date(hh.validUntil)) return false;

  const rawDays = hh.daysOfWeek;
  const days = Array.isArray(rawDays) ? rawDays.map(Number).filter((n) => !Number.isNaN(n)) : [];
  const allowed = days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  // UTC standardı: backend her yerde UTC (lib/timezone). Yerel getDay()/getHours()
  // sunucu TZ'ine göre kayıp, happy-hour'u yanlış gün/saatte tetikliyordu.
  if (!allowed.includes(now.getUTCDay())) return false;

  const parse = (s: string) => {
    const [h, m] = s.split(':').map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const startM = parse(hh.startTime);
  const endM = parse(hh.endTime);
  if (startM == null || endM == null) return false;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (endM < startM) {
    return cur >= startM || cur <= endM;
  }
  return cur >= startM && cur <= endM;
}
