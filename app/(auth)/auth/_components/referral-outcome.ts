/**
 * `/auth/complete` davet sonucu — yanıtı DÜRÜSTÇE yorumlar.
 *
 * Eskiden sayfa `POST /api/referral` yanıtını hiç okumuyor, kod geçersiz / zaten kullanılmış /
 * modül kapalı / 500 olsa bile "Davet bonusu hesabınıza eklendi!" yazıyordu. Kural:
 *  - yalnız `2xx + success:true + status:'COMPLETED' + pointsEarned > 0` → "credited"
 *  - `2xx + success:true` ama ödül henüz yok (PENDING: doğrulama + ilk QR bekleniyor) → "pending"
 *  - geri kalan her şey (HTTP hatası, `success` yok, gövde bozuk, ağ hatası) → "failed"
 */
export type ReferralOutcome =
  | { kind: 'credited'; points: number }
  | { kind: 'pending' }
  | { kind: 'failed'; reason?: string };

type ReferralBody = {
  success?: unknown;
  status?: unknown;
  pointsEarned?: unknown;
  error?: unknown;
};

const MAX_REASON_LENGTH = 200;

export function interpretReferralResponse(httpOk: boolean, body: unknown): ReferralOutcome {
  const data: ReferralBody = body && typeof body === 'object' ? (body as ReferralBody) : {};
  if (!httpOk || data.success !== true) {
    const reason =
      typeof data.error === 'string' && data.error.trim() ? data.error.trim().slice(0, MAX_REASON_LENGTH) : undefined;
    return reason ? { kind: 'failed', reason } : { kind: 'failed' };
  }
  const points = typeof data.pointsEarned === 'number' && Number.isFinite(data.pointsEarned) ? data.pointsEarned : 0;
  if (data.status === 'COMPLETED' && points > 0) return { kind: 'credited', points: Math.floor(points) };
  return { kind: 'pending' };
}

/** Davet kodunu uygular; ağ hatası dahil her sonucu `ReferralOutcome`'a çevirir. */
export async function applyReferralCode(code: string, fetchImpl: typeof fetch = fetch): Promise<ReferralOutcome> {
  try {
    const res = await fetchImpl('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => null);
    return interpretReferralResponse(res.ok, body);
  } catch {
    return { kind: 'failed' };
  }
}
