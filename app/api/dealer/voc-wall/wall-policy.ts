/**
 * Mağaza ekranı (VoC duvarı) YAYIN POLİTİKASI — P0-35 / F10.
 *
 * Duvar şubedeki TV'de herkese açık gösterilir; bu yüzden yalnız "yayınlanabilir" yorumlar
 * çıkar ve müşteri kimliği maskelenir. Eskiden filtre yalnız `isPublic` (her zaman true) idi:
 * toksik, sahte (fraud) ve güven-işaretli yorumlar müşterinin TAM ADIYLA dönüyordu.
 *
 * Kurallar (FAIL-CLOSED):
 *  1. Silinmemiş, `isPublic`, `isToxic=false`, `trustFlagged=false`, `fraudScore < 0.7` (ya da yok).
 *  2. Toksiklik analizi yorum oluşturulduktan SONRA ve asenkron çalışır; bu sürede `isToxic`
 *     varsayılan `false`tur. Bu yüzden metinli bir yorum ancak denetimden geçtiyse yayınlanır:
 *     gerçek AI analizi (`aiProcessedAt` dolu) ya da yerel denetim (`aiModelUsed='local-fallback'`).
 *     Metinsiz (yalnız puan) kayıtların içerik riski yoktur.
 *  3. Yazarı sahtecilik nedeniyle işaretli/gölge-yasaklı olan yorumlar yayınlanmaz.
 *  4. Savunma derinliği: AI'ın kaçırdığı açık küfür için yerel sıkı sözlük; metindeki e-posta,
 *     telefon ve bağlantılar gizlenir.
 *  5. Ad maskelenir: "Ayşe Yılmaz" → "A*** Y.".
 */
import type { Prisma } from '@prisma/client';

/** Bu skorun üstündeki (dahil) yorumlar sahte/anomali sayılır ve yayınlanmaz. */
export const WALL_FRAUD_THRESHOLD = 0.7;

/** Duvarda yalnız bu dolandırıcılık durumundaki kullanıcıların yorumları yayınlanır. */
const CLEAN_FRAUD_STATUS = 'clean';

export const ANONYMOUS_WALL_NAME = 'Anonim';

/** Yayınlanabilir geri bildirimlerin Prisma koşulu (bayi kapsamlı). */
export function wallEligibleWhere(dealerId: string): Prisma.FeedbackWhereInput {
  return {
    qrCode: { dealerId },
    deletedAt: null,
    isPublic: true,
    isToxic: false,
    trustFlagged: false,
    AND: [
      { OR: [{ fraudScore: null }, { fraudScore: { lt: WALL_FRAUD_THRESHOLD } }] },
      // Fail-closed denetim: metinsiz ya da denetlenmiş.
      { OR: [{ text: null }, { aiProcessedAt: { not: null } }, { aiModelUsed: 'local-fallback' }] },
      // Yazar: anonim ya da temiz hesap.
      { OR: [{ userId: null }, { user: { fraudStatus: CLEAN_FRAUD_STATUS } }] },
    ],
  };
}

/**
 * Ad maskeleme: ilk kelimenin baş harfi + "***", birden çok kelime varsa son kelimenin baş harfi.
 *   "Ayşe Yılmaz" → "A*** Y." · "ayşe" → "A***" · null/boş → "Anonim"
 * E-posta biçimli ya da harf içermeyen adlar asla açık gösterilmez.
 */
export function maskCustomerName(name: string | null | undefined): string {
  if (typeof name !== 'string') return ANONYMOUS_WALL_NAME;
  const tokens = name
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}]/gu, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0 || name.includes('@')) return ANONYMOUS_WALL_NAME;
  const initial = (t: string) => Array.from(t)[0]!.toLocaleUpperCase('tr-TR');
  const first = `${initial(tokens[0]!)}***`;
  if (tokens.length === 1) return first;
  return `${first} ${initial(tokens[tokens.length - 1]!)}.`;
}

/** Kelime olarak geçtiğinde engellenen ifadeler (tam kelime). */
const BLOCKED_WORDS = [
  'amk', 'aq', 'sik', 'piç', 'pic', 'göt', 'salak', 'aptal', 'ahmak', 'gerizekalı', 'gerizekali',
  'şerefsiz', 'serefsiz', 'kahpe', 'oç', 'puşt', 'pust', 'ibne', 'yavşak', 'yavsak', 'dangalak',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick',
];
/** Kelime BAŞINDA geçtiğinde engellenen kökler (çekimli hâlleri de yakalanır). */
const BLOCKED_PREFIXES = [
  'siktir', 'sikeyim', 'sikerim', 'sikim', 'sikik', 'orospu', 'yarra', 'yarak', 'amına', 'amina',
  'amcık', 'amcik', 'pezeven', 'kaltak', 'ananı', 'anani', 'şerefsiz', 'gerizekal', 'fucking', 'motherfuck',
];

function words(text: string): string[] {
  return text
    .toLocaleLowerCase('tr-TR')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Açık küfür/hakaret içeriyor mu? (AI denetimini tamamlayan sıkı, düşük yanlış-pozitifli sözlük.) */
export function containsBlockedLanguage(text: string | null | undefined): boolean {
  if (!text) return false;
  const ws = words(text);
  return ws.some((w) => BLOCKED_WORDS.includes(w) || BLOCKED_PREFIXES.some((p) => w.startsWith(p)));
}

const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|tr|me|app|xyz|info|biz)(?:\.tr)?\b\S*/gi;
// 10+ haneli (boşluk/tire/parantez ayrılmış olabilir) numaralar: TR cep/sabit hat, +90.
const PHONE_RE = /(?:\+?\d[\s().-]?){10,}/g;

/** Duvarda gösterilecek metinden kişisel iletişim bilgisi ve bağlantıları gizler. */
export function redactWallText(text: string): string {
  return text
    .replace(EMAIL_RE, '[e-posta gizlendi]')
    .replace(URL_RE, '[bağlantı gizlendi]')
    .replace(BARE_DOMAIN_RE, '[bağlantı gizlendi]')
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[telefon gizlendi] ' : m))
    .replace(/\s+$/g, '');
}

export const WALL_TEXT_MAX = 300;

/** Yayına hazır metin (gizlenmiş + kısaltılmış); boşsa null. */
export function toWallText(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = redactWallText(text.trim());
  if (!clean) return null;
  return clean.length > WALL_TEXT_MAX ? `${clean.slice(0, WALL_TEXT_MAX)}…` : clean;
}
