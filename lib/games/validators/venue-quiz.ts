/**
 * Mekân Bilgi Yarışması — SUNUCU doğrulayıcısı + düello belirteçleri (sınıflandırma ailesi).
 * Yalnız `lib/games/registry/venue-quiz.server.ts` ve düello API'si
 * (`app/api/customer/venue-quiz/duel/route.ts`) içe aktarır; etiketli içerik buradan okunur.
 *
 * Sıralı tur (günde 1, ödüllü): sıralı havuzdan 10 soru, zorluk eğrisi 3 kolay → 4 orta → 3 zor,
 * kategoriler mümkün olduğunca dengeli; şıklar tohumla karıştırılır (opak `o0…o3`), `why` SİLİNİR.
 * Onaylı + aktif bayi sorusu varsa turda en fazla 1 tane "Sponsorlu" olarak yer alır.
 *
 * Puan SUNUCUNUN (`rules.ts → scoreRun`): doğru + hız + seri. Kanıt `{ answers: [{ id, verdict, tMs }] }`.
 * Hile önlemleri (dürüst oyuncuyu cezalandırmadan):
 *   - soru sırası zorunlu (`q0, q1…`), tekrar/eksik kimlik → proof_invalid
 *   - şık kimliği turdaki şıklardan biri ya da `timeout` olmalı → proof_invalid
 *   - tMs azalırsa → proof_invalid; son cevap sunucu süresinden sonra → implausible
 *   - 2'den fazla insanüstü hızlı cevap (< 400 ms) → implausible
 *   - "Süre bankası": son cevap ile sunucu süresi arasındaki fark ≤ 120 sn. Hız bonusu,
 *     beyan edilen cevap süresinden hesaplanır; soruları turdan önce/arada araştırıp hızlı
 *     cevap beyan etmek bu sınıra takılır (araştırmaya harcanan süre bir yere yazılmalı).
 *   - süre aşımı (≥ 15 sn + tolerans) cevabı doğru olsa da 0 puan.
 *
 * Düello (asenkron, aynı tohum) tur kurucusu `buildDuelRound` burada; belirteçler ve HTTP işleyicileri
 * `./venue-quiz-duel.ts`'te (define-route'a bağımlı; kayıt defteri sunucu modülü onu çekmez).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { splitPools } from '@/lib/games/content/pool';
import { classificationProofSchema, VERIFY_CLOCK_SLACK_MS, type ClassificationProof } from '@/lib/games/verify';
import type { ClassificationRound, ClassificationVerifier, PublicContentItem, VerifierOutcome, VerifyInput } from '@/lib/games/verify/types';
import {
  VENUE_QUIZ_BANK,
  sponsoredBankItems,
  type VenueQuizItem,
} from '@/lib/games/content/venue-quiz.server';
import {
  DUEL_COUNT,
  RANKED_COUNT,
  TIMEOUT_VERDICT,
  TRANSITION_MS,
  QUESTION_MS,
  scoreRun,
  type CategoryId,
  type TimedAnswer,
} from '@/components/customer/games/venue-quiz/rules';

export const VENUE_QUIZ_GAME_TYPE = 'venue-quiz';
/** Pratik + düello havuzu payı (kimlik karmasıyla, deterministik). */
export const PRACTICE_SHARE = 0.3;
export const VENUE_QUIZ_POOLS = splitPools(VENUE_QUIZ_BANK, PRACTICE_SHARE);
/** Turdan önce (giriş/geri sayım) + bitişten sonra (ağ) en fazla bu kadar "kayıp" süre. */
export const MAX_OVERHEAD_MS = 120_000;
/** İnsanüstü hızlı cevap sınırı aşımı. */
export const MAX_FAST_ANSWERS = 2;
/** Tek soru aralığında (ağ/sekme gecikmesi) tolerans; üstü = beyan edilmiş süre sahte. */
export const MAX_QUESTION_SLACK_MS = 5_000;

const RANKED_CURVE: readonly (1 | 2 | 3)[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
const DUEL_CURVE: readonly (1 | 2 | 3)[] = [1, 1, 2, 2, 2, 3, 3, 3];
/** Sponsorlu soru sıralı turda bu sıraya (orta zorluk) konur. */
const SPONSOR_SLOT = 4;

export interface PublicQuestion extends PublicContentItem {
  category: CategoryId;
  prompt: string;
  options: { id: string; text: string }[];
  difficulty: number;
  why?: string;
  sponsor?: { name: string };
}

function byId(a: VenueQuizItem, b: VenueQuizItem) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Zorluk eğrisine göre, kategori dengesini gözeterek seçer (havuz yetmezse komşu zorluktan). */
function pickCurve(pool: readonly VenueQuizItem[], curve: readonly (1 | 2 | 3)[], rng: Rng): VenueQuizItem[] {
  const shuffled = rng.shuffle(pool.slice().sort(byId));
  const used = new Set<string>();
  const catCount = new Map<string, number>();
  const out: VenueQuizItem[] = [];
  let prevCat: string | null = null;
  for (const d of curve) {
    const ranked = (want: number) => shuffled.filter((it) => !used.has(it.id) && (it.difficulty ?? 2) === want);
    let cands = ranked(d);
    if (cands.length === 0) cands = [...ranked(2), ...ranked(d === 3 ? 2 : d === 1 ? 2 : 1), ...ranked(3), ...ranked(1)];
    cands = cands.filter((it, i, arr) => arr.findIndex((x) => x.id === it.id) === i);
    if (cands.length === 0) break;
    // En az kullanılan kategori; eşitlikte öncekiyle aynı olmayan; sonra karıştırma sırası.
    let best = cands[0];
    let bestKey = Number.POSITIVE_INFINITY;
    for (const it of cands) {
      const c = catCount.get(it.payload.category) ?? 0;
      const key = c * 2 + (it.payload.category === prevCat ? 1 : 0);
      if (key < bestKey) {
        best = it;
        bestKey = key;
      }
    }
    used.add(best.id);
    catCount.set(best.payload.category, (catCount.get(best.payload.category) ?? 0) + 1);
    prevCat = best.payload.category;
    out.push(best);
  }
  return out;
}

/** Havuz öğesi → istemci sorusu (şıklar karışık, opak kimlikler) + doğru şık kimliği. */
function toPublic(item: VenueQuizItem, index: number, rng: Rng, keepWhy: boolean): { q: PublicQuestion; truth: string } {
  const order = rng.shuffle([0, 1, 2, 3]);
  const options = order.map((orig, j) => ({ id: `o${j}`, text: item.payload.options[orig] }));
  const truth = `o${order.indexOf(0)}`;
  const q: PublicQuestion = {
    id: `q${index}`,
    category: item.payload.category,
    prompt: item.payload.prompt,
    options,
    difficulty: item.difficulty ?? 2,
    ...(keepWhy && item.payload.why ? { why: item.payload.why } : {}),
    ...(item.payload.sponsorName ? { sponsor: { name: item.payload.sponsorName } } : {}),
  };
  return { q, truth };
}

function assemble(items: readonly VenueQuizItem[], rng: Rng, keepWhy: boolean): ClassificationRound & { why: Record<string, string> } {
  const out: PublicContentItem[] = [];
  const answerKey: Record<string, string> = {};
  const why: Record<string, string> = {};
  items.forEach((it, i) => {
    const { q, truth } = toPublic(it, i, rng.fork(`opt:${it.id}`), keepWhy);
    out.push(q);
    answerKey[q.id] = truth;
    if (it.payload.why) why[q.id] = it.payload.why;
  });
  return { items: out, answerKey, why };
}

export function buildRankedRound(seed: string, sponsored: readonly VenueQuizItem[] = sponsoredBankItems()): ClassificationRound {
  const rng = createRng(seed).fork('vq:ranked');
  const picked = pickCurve(VENUE_QUIZ_POOLS.ranked, RANKED_CURVE, rng.fork('pick'));
  if (sponsored.length > 0 && picked.length > SPONSOR_SLOT) {
    picked[SPONSOR_SLOT] = rng.fork('sponsor').pick(sponsored.slice().sort(byId));
  }
  const { items, answerKey } = assemble(picked.slice(0, RANKED_COUNT), rng.fork('opts'), false);
  return { items, answerKey };
}

/** Pratik: pratik havuzunun TAMAMI, etiketli + açıklamalı (istemci kategoriye göre seçer). */
export function buildPracticeRound(seed: string): ClassificationRound {
  const rng = createRng(seed).fork('vq:practice');
  const order = rng.shuffle(VENUE_QUIZ_POOLS.practice.slice().sort(byId));
  const { items, answerKey } = assemble(order, rng.fork('opts'), true);
  return { items, answerKey };
}

/** Düello turu: aynı kod → herkese aynı sorular, aynı şık sırası. */
export function buildDuelRound(code: string) {
  const rng = createRng(`duel:${code}`).fork('vq:duel');
  const picked = pickCurve(VENUE_QUIZ_POOLS.practice, DUEL_CURVE, rng.fork('pick'));
  return assemble(picked.slice(0, DUEL_COUNT), rng.fork('opts'), false);
}

// ───────────────────────────── Puanlama / doğrulama ─────────────────────────────

export interface ScoredRun {
  outcome: VerifierOutcome;
  correct: number;
  perQuestion: { id: string; correct: boolean; timedOut: boolean; points: number }[];
}

/**
 * Bir turun cevaplarını denetler ve puanlar (sıralı doğrulayıcı ve düello ortak).
 * `elapsedMs`: sunucu saatine göre turun başlangıcından geçen süre.
 */
export function scoreRound(round: ClassificationRound, answers: readonly TimedAnswer[], elapsedMs: number): ScoredRun {
  const fail = (flag: 'proof_invalid' | 'implausible', detail: string): ScoredRun => ({
    outcome: { verifiedScore: 0, flags: [flag], detail },
    correct: 0,
    perQuestion: [],
  });
  if (answers.length > round.items.length) return fail('proof_invalid', 'sorudan fazla cevap');
  let lastT = -1;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const item = round.items[i];
    if (a.id !== item.id) return fail('proof_invalid', `sıra dışı soru ${a.id}`);
    const optionIds = Array.isArray(item.options) ? (item.options as { id: string }[]).map((o) => o.id) : [];
    if (a.verdict !== TIMEOUT_VERDICT && !optionIds.includes(a.verdict)) return fail('proof_invalid', `geçersiz şık ${a.verdict}`);
    if (a.tMs < lastT) return fail('proof_invalid', 'zaman sırası bozuk');
    // Soru başına süre sınırı (kök neden düzeltmesi): istemci süreyi kendisi beyan ettiğinden,
    // tek bir soruya (ör. ilkine) devasa süre yazıp araştırma süresini oraya gömerek kalan
    // soruları "hızlı" beyan etmek mümkündü. Dürüst istemci her soruyu QUESTION_MS'te zaman
    // aşımına düşürür; bu yüzden hiçbir aralık süre + tolerans'ı aşamaz.
    const gap = i === 0 ? a.tMs : a.tMs - (lastT + TRANSITION_MS);
    if (gap > QUESTION_MS + MAX_QUESTION_SLACK_MS) return fail('implausible', `soru ${a.id} süresi aşıldı`);
    lastT = a.tMs;
  }
  if (answers.length > 0) {
    if (lastT > elapsedMs + VERIFY_CLOCK_SLACK_MS) return fail('implausible', 'cevap sunucu süresinden sonra');
    if (elapsedMs - lastT > MAX_OVERHEAD_MS) return fail('implausible', 'süre bankası tutmuyor');
  }
  const run = scoreRun(answers, round.answerKey);
  if (run.fast > MAX_FAST_ANSWERS) return fail('implausible', `${run.fast} insanüstü hızlı cevap`);
  return {
    outcome: { verifiedScore: run.score, flags: [] },
    correct: run.correct,
    perQuestion: run.answers.map((a) => ({ id: a.id, correct: a.correct, timedOut: a.timedOut, points: a.points })),
  };
}

export const venueQuizVerifier: ClassificationVerifier<ClassificationProof> = {
  kind: 'classification',
  requireProof: true,
  proofSchema: classificationProofSchema,
  buildRound: (seed) => buildRankedRound(seed),
  practiceRound: (seed) => buildPracticeRound(seed),
  score(round: ClassificationRound, proof: ClassificationProof, input: VerifyInput): VerifierOutcome {
    return scoreRound(round, proof.answers, input.serverElapsedSec * 1000).outcome;
  },
};
