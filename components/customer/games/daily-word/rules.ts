/**
 * Günün Kelimesi — SAF kurallar (istemci + sunucu). React yok, kelime listesi yok.
 *
 * Kelime listesi ve günün kelimesi YALNIZ sunucuda (`lib/games/content/daily-word.server.ts`,
 * `lib/games/validators/daily-word.ts`); istemci yalnız kendi tahminini ve sunucunun
 * döndürdüğü renk desenini görür.
 */

/** Türkçe alfabe (29 harf; Q W X yok). */
export const TR_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';
export const TR_LETTERS: readonly string[] = Array.from(TR_ALPHABET);
const LETTER_SET = new Set(TR_LETTERS);

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** Harf sonucu: 2 = doğru yer, 1 = kelimede var (başka yerde), 0 = yok. */
export type Mark = 0 | 1 | 2;

/** Türkçe büyük harfe çevirir (i → İ, ı → I), şapkaları sadeleştirir, boşlukları atar. */
export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .replace(/â/g, 'a')
    .replace(/Â/g, 'A')
    .replace(/î/g, 'i')
    .replace(/Î/g, 'İ')
    .replace(/û/g, 'u')
    .replace(/Û/g, 'U')
    .toLocaleUpperCase('tr-TR')
    .normalize('NFC');
}

/** Tek harf (normalize edilmiş) Türkçe alfabede mi. */
export function isTrLetter(ch: string): boolean {
  return LETTER_SET.has(ch);
}

/** Tam 5 Türkçe harften oluşan normalize kelime mi (sözlük denetimi DEĞİL). */
export function isWellFormed(word: string): boolean {
  const letters = Array.from(word);
  return letters.length === WORD_LENGTH && letters.every(isTrLetter);
}

/**
 * Wordle renklendirmesi (tekrarlı harf doğru): önce doğru yerler, sonra kalan harf
 * sayılarıyla "var" işaretleri. İki kelime de normalize ve 5 harf olmalı.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const g = Array.from(guess);
  const a = Array.from(answer);
  const marks: Mark[] = new Array(g.length).fill(0);
  const remaining = new Map<string, number>();
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) marks[i] = 2;
    else remaining.set(a[i], (remaining.get(a[i]) ?? 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 2) continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      marks[i] = 1;
      remaining.set(g[i], left - 1);
    }
  }
  return marks;
}

export function isSolvedMarks(marks: readonly Mark[]): boolean {
  return marks.length === WORD_LENGTH && marks.every((m) => m === 2);
}

/** Skor = 7 − tahmin sayısı (1. tahminde 6 … 6. tahminde 1); bulunamazsa 0. */
export function scoreFor(solved: boolean, guessCount: number): number {
  if (!solved || guessCount < 1 || guessCount > MAX_GUESSES) return 0;
  return MAX_GUESSES + 1 - guessCount;
}

/** 3 yıldız: 1-3 tahmin · 2: 4-5 · 1: 6 · 0: bulunamadı. */
export function starsFor(solved: boolean, guessCount: number): number {
  if (!solved) return 0;
  if (guessCount <= 3) return 3;
  if (guessCount <= 5) return 2;
  return 1;
}

/** Ekran klavyesi durumu: harf → en iyi bilinen işaret. */
export function mergeKeyState(prev: Record<string, Mark>, guess: string, marks: readonly Mark[]): Record<string, Mark> {
  const next = { ...prev };
  Array.from(guess).forEach((ch, i) => {
    const m = marks[i];
    if (next[ch] === undefined || m > next[ch]) next[ch] = m;
  });
  return next;
}

/** Paylaşım kartı: kelimeyi ele vermeyen emoji ızgarası. Yüksek kontrastta turuncu/mavi. */
export function shareText(opts: {
  dayLabel: string | null;
  rows: readonly (readonly Mark[])[];
  solved: boolean;
  highContrast?: boolean;
  practice?: boolean;
  /** Arayüz dili etiketleri (varsayılan Türkçe). */
  labels?: { head: string; practice: string };
}): string {
  const hit = opts.highContrast ? '🟧' : '🟩';
  const near = opts.highContrast ? '🟦' : '🟨';
  const miss = '⬛';
  const labels = opts.labels ?? { head: 'Qratex Günün Kelimesi', practice: ' (Pratik)' };
  const head = `${labels.head}${opts.practice ? labels.practice : opts.dayLabel ? ` ${opts.dayLabel}` : ''} ${
    opts.solved ? opts.rows.length : 'X'
  }/${MAX_GUESSES}`;
  const grid = opts.rows.map((r) => r.map((m) => (m === 2 ? hit : m === 1 ? near : miss)).join('')).join('\n');
  return `${head}\n\n${grid}`;
}

/** Europe/Istanbul takvim günü ("YYYY-MM-DD"). Günün kelimesi bu güne bağlıdır. */
export function istanbulDayKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
